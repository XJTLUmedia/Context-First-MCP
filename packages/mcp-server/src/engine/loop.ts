import type { SessionStore } from "../state/store.js";
import type { ToolCatalog } from "../registry/catalog.js";
import type {
  UnifiedLoopResult,
  UnifiedLoopStage,
  LoopDirective,
  DirectiveConstraint,
  GroundingResult,
  DriftResult,
} from "../state/types.js";
import { refineConversation } from "./refiner.js";
import { detectConflicts } from "./detector.js";
import { checkAmbiguity } from "./validator.js";
import { computeEntropy } from "./entropy.js";
import { checkAbstention } from "./abstention.js";
import { discoverTools } from "./discovery.js";
import { checkGrounding } from "./grounding.js";
import { recordHealthSnapshot, detectDrift as runDriftDetection } from "./drift.js";

export interface LoopInput {
  sessionId: string;
  messages: Array<{ role: "user" | "assistant"; content: string; turn: number }>;
  currentInput?: string;
  claim?: string;
  discoveryQuery?: string;
  lookbackTurns?: number;
  entropyThreshold?: number;
  abstentionThreshold?: number;
}

export function runUnifiedLoop(
  store: SessionStore,
  catalog: ToolCatalog,
  input: LoopInput
): UnifiedLoopResult {
  const {
    sessionId,
    messages,
    claim,
    discoveryQuery,
    lookbackTurns = 5,
    entropyThreshold = 0.6,
    abstentionThreshold = 0.6,
  } = input;

  // --- Gap Fix: Auto-infer currentInput from last user message if not provided ---
  const currentInput = input.currentInput ??
    [...messages].reverse().find(m => m.role === "user")?.content;

  const stages: UnifiedLoopStage[] = [];
  const session = store.getOrCreate(sessionId);

  // --- Stage 1: INGEST ---
  const ingestStart = Date.now();
  for (const msg of messages) {
    store.addHistory(sessionId, {
      role: msg.role,
      content: msg.content,
      turn: msg.turn,
      timestamp: new Date(),
    });
  }

  // --- Stage 1b: AUTO GROUND-TRUTH EXTRACTION ---
  // Extract and store key facts from user messages so that conflict/abstention
  // stages work even if the LLM never manually called set_state.
  const autoExtractedFacts: Record<string, string> = {};
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const extracted = extractFacts(msg.content);
    for (const [key, value] of Object.entries(extracted)) {
      if (!session.groundTruth.has(key)) {
        store.setState(sessionId, key, value, "auto-extracted");
        autoExtractedFacts[key] = value;
      }
    }
  }
  stages.push({ name: "ingest", status: "completed", durationMs: Date.now() - ingestStart, result: { messagesIngested: messages.length } });

  // --- Stage 2: RECAP ---
  let recapResult: UnifiedLoopResult["recap"] = null;
  const recapStart = Date.now();
  try {
    const allHistory = store.getHistory(sessionId);
    if (allHistory.length > 0) {
      const recap = refineConversation(allHistory, lookbackTurns);
      store.setRecap(sessionId, recap);
      recapResult = {
        summary: recap.summary,
        hiddenIntents: recap.hiddenIntents,
        keyDecisions: recap.keyDecisions,
      };
      stages.push({ name: "recap", status: "completed", durationMs: Date.now() - recapStart, result: recapResult });
    } else {
      stages.push({ name: "recap", status: "skipped", durationMs: Date.now() - recapStart, result: "No history" });
    }
  } catch (e) {
    stages.push({ name: "recap", status: "error", durationMs: Date.now() - recapStart, result: String(e) });
  }

  // --- Stage 3: CONFLICT DETECTION ---
  let conflictsResult: UnifiedLoopResult["conflicts"] = null;
  const conflictStart = Date.now();
  try {
    if (currentInput && session.groundTruth.size > 0) {
      conflictsResult = detectConflicts(currentInput, session.groundTruth);
      // Persist detected conflicts to session so downstream stages (abstention) see them
      for (const conflict of conflictsResult.conflicts) {
        store.addConflict(sessionId, {
          key: conflict.existingKey,
          oldValue: conflict.existingValue,
          newValue: conflict.conflictingStatement,
          description: conflict.suggestion,
          detectedAt: new Date(),
        });
      }
      stages.push({ name: "conflict", status: "completed", durationMs: Date.now() - conflictStart, result: conflictsResult });
    } else {
      stages.push({ name: "conflict", status: "skipped", durationMs: Date.now() - conflictStart, result: currentInput ? "No ground truth yet" : "No currentInput provided" });
    }
  } catch (e) {
    stages.push({ name: "conflict", status: "error", durationMs: Date.now() - conflictStart, result: String(e) });
  }

  // --- Stage 4: AMBIGUITY CHECK ---
  let ambiguityResult: UnifiedLoopResult["ambiguity"] = null;
  const ambiguityStart = Date.now();
  try {
    if (currentInput) {
      ambiguityResult = checkAmbiguity(currentInput);
      stages.push({ name: "ambiguity", status: "completed", durationMs: Date.now() - ambiguityStart, result: ambiguityResult });
    } else {
      stages.push({ name: "ambiguity", status: "skipped", durationMs: Date.now() - ambiguityStart, result: "No currentInput provided" });
    }
  } catch (e) {
    stages.push({ name: "ambiguity", status: "error", durationMs: Date.now() - ambiguityStart, result: String(e) });
  }

  // --- Stage 5: ENTROPY MONITOR ---
  let entropyResult: UnifiedLoopResult["entropy"] = null;
  const entropyStart = Date.now();
  try {
    const assistantOutputs = messages
      .filter(m => m.role === "assistant")
      .map(m => m.content);
    if (assistantOutputs.length > 0) {
      const freshSession = store.getOrCreate(sessionId);
      const metrics = computeEntropy(assistantOutputs, freshSession.groundTruth, freshSession.history);
      const spikeDetected = metrics.compositeScore > entropyThreshold;
      entropyResult = {
        metrics,
        spikeDetected,
        recommendation: spikeDetected ? "ergo_reset" : "normal",
      };
      stages.push({ name: "entropy", status: "completed", durationMs: Date.now() - entropyStart, result: entropyResult });
    } else {
      stages.push({ name: "entropy", status: "skipped", durationMs: Date.now() - entropyStart, result: "No assistant outputs to analyze" });
    }
  } catch (e) {
    stages.push({ name: "entropy", status: "error", durationMs: Date.now() - entropyStart, result: String(e) });
  }

  // --- Stage 6: ABSTENTION CHECK ---
  let abstentionResult: UnifiedLoopResult["abstention"] = null;
  const abstentionStart = Date.now();
  try {
    if (claim) {
      const freshSession = store.getOrCreate(sessionId);
      const abstention = checkAbstention(
        claim,
        freshSession.groundTruth,
        [],  // requiredKeys - check all
        freshSession.conflicts,
        freshSession.history,
        abstentionThreshold
      );
      abstentionResult = {
        shouldAbstain: abstention.shouldAbstain,
        confidence: abstention.confidence,
        suggestedQuestions: abstention.suggestedQuestions,
      };
      stages.push({ name: "abstention", status: "completed", durationMs: Date.now() - abstentionStart, result: abstentionResult });
    } else {
      stages.push({ name: "abstention", status: "skipped", durationMs: Date.now() - abstentionStart, result: "No claim provided" });
    }
  } catch (e) {
    stages.push({ name: "abstention", status: "error", durationMs: Date.now() - abstentionStart, result: String(e) });
  }

  // --- Stage 7: DISCOVERY ---
  let discoveryResult: UnifiedLoopResult["discovery"] = null;
  const discoveryStart = Date.now();
  try {
    const query = discoveryQuery || currentInput || (recapResult?.summary ?? "");
    if (query) {
      const discovery = discoverTools(catalog, query, 3);
      discoveryResult = {
        suggestedTools: discovery.matches.map(m => ({
          toolName: m.toolName,
          relevanceScore: m.relevanceScore,
        })),
      };
      stages.push({ name: "discovery", status: "completed", durationMs: Date.now() - discoveryStart, result: discoveryResult });
    } else {
      stages.push({ name: "discovery", status: "skipped", durationMs: Date.now() - discoveryStart, result: "No query available for discovery" });
    }
  } catch (e) {
    stages.push({ name: "discovery", status: "error", durationMs: Date.now() - discoveryStart, result: String(e) });
  }

  // --- Stage 8: GROUNDING CHECK (arXiv:2602.13224 — SGI) ---
  let groundingResult: GroundingResult | null = null;
  const groundingStart = Date.now();
  try {
    const assistantOutputs = messages
      .filter(m => m.role === "assistant")
      .map(m => m.content);
    const freshSessionG = store.getOrCreate(sessionId);
    if (assistantOutputs.length > 0 && freshSessionG.groundTruth.size > 0) {
      const lastAssistantOutput = assistantOutputs[assistantOutputs.length - 1];
      groundingResult = checkGrounding(lastAssistantOutput, freshSessionG.groundTruth, claim);
      stages.push({ name: "grounding", status: "completed", durationMs: Date.now() - groundingStart, result: groundingResult });
    } else {
      stages.push({ name: "grounding", status: "skipped", durationMs: Date.now() - groundingStart, result: assistantOutputs.length === 0 ? "No assistant output to check" : "No ground truth to check against" });
    }
  } catch (e) {
    stages.push({ name: "grounding", status: "error", durationMs: Date.now() - groundingStart, result: String(e) });
  }

  // --- Stage 9: TEMPORAL DRIFT DETECTION (arXiv:2503.15560 — TCA) ---
  // We record a health snapshot first, then run drift detection after synthesis computes health.
  // For now, compute a preliminary health and record it.
  let driftResult: DriftResult | null = null;

  // --- Stage 10: SYNTHESIS ---
  let action: UnifiedLoopResult["action"] = "proceed";
  let summary = "";

  // --- Aggregate all questions from every stage into one list ---
  const allQuestions: string[] = [];
  if (ambiguityResult?.clarifyingQuestions) {
    allQuestions.push(...ambiguityResult.clarifyingQuestions);
  }
  if (abstentionResult?.suggestedQuestions) {
    allQuestions.push(...abstentionResult.suggestedQuestions);
  }
  if (conflictsResult?.hasConflicts) {
    for (const c of conflictsResult.conflicts) {
      allQuestions.push(c.suggestion);
    }
  }
  if (groundingResult && !groundingResult.isGrounded) {
    allQuestions.push(...groundingResult.suggestions);
  }
  const uniqueQuestions = [...new Set(allQuestions)].slice(0, 8);

  // --- WEIGHTED context health (replaces flat average) ---
  // Weights reflect severity: conflicts and grounding failures are more critical
  // than mild ambiguity or slightly elevated entropy.
  const weightedSignals: Array<{ value: number; weight: number }> = [];
  if (entropyResult) weightedSignals.push({ value: 1 - entropyResult.metrics.compositeScore, weight: 1.0 });
  if (ambiguityResult) weightedSignals.push({ value: 1 - ambiguityResult.score, weight: 0.8 });
  if (abstentionResult) weightedSignals.push({ value: abstentionResult.confidence, weight: 1.2 });
  if (conflictsResult) {
    // Scale conflict severity: high-severity conflicts drag health down harder
    const maxSeverity = conflictsResult.conflicts.reduce((max, c) =>
      c.severity === "high" ? 3 : c.severity === "medium" ? Math.max(max, 2) : Math.max(max, 1), 0);
    const conflictHealth = conflictsResult.hasConflicts ? Math.max(0, 1 - maxSeverity * 0.25) : 1.0;
    weightedSignals.push({ value: conflictHealth, weight: 1.5 });
  }
  if (groundingResult) weightedSignals.push({ value: groundingResult.score, weight: 1.3 });

  const totalWeight = weightedSignals.reduce((s, x) => s + x.weight, 0);
  const contextHealth = totalWeight > 0
    ? Math.round((weightedSignals.reduce((s, x) => s + x.value * x.weight, 0) / totalWeight) * 100) / 100
    : 1.0;

  // --- Determine action and build LLM-facing instruction ---
  let instruction = "";

  if (abstentionResult?.shouldAbstain) {
    action = "abstain";
    summary = `Low confidence (${(abstentionResult.confidence * 100).toFixed(0)}%). ${abstentionResult.suggestedQuestions.length} clarifying questions suggested.`;
    instruction = `You lack sufficient verified information to answer confidently. Ask the user the following questions before proceeding:\n${uniqueQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
  } else if (entropyResult?.spikeDetected) {
    action = "reset";
    summary = `Entropy spike detected (composite: ${entropyResult.metrics.compositeScore.toFixed(2)}). Context reset recommended.`;
    instruction = "Your recent outputs show signs of degradation (hedging, repetition, or contradictions). Summarize what you know so far, then re-anchor on the user's core intent. Call recap_conversation or clear_state to reset.";
  } else if (ambiguityResult?.isAmbiguous || conflictsResult?.hasConflicts) {
    action = "clarify";
    const parts: string[] = [];
    if (ambiguityResult?.isAmbiguous) parts.push(`ambiguity score ${ambiguityResult.score.toFixed(2)}`);
    if (conflictsResult?.hasConflicts) parts.push(`${conflictsResult.conflicts.length} conflict(s) detected`);
    summary = `Clarification needed: ${parts.join(", ")}.`;
    instruction = `Before proceeding, resolve these issues with the user:\n${uniqueQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
  } else {
    action = "proceed";
    const completedStages = stages.filter(s => s.status === "completed").length;
    summary = `All ${completedStages} stages passed. Context is healthy.`;
    instruction = "Context is healthy. Proceed with your response." +
      (recapResult?.hiddenIntents?.length ? ` Keep in mind these hidden intents: ${recapResult.hiddenIntents.join("; ")}.` : "") +
      (recapResult?.keyDecisions?.length ? ` Previous decisions: ${recapResult.keyDecisions.join("; ")}.` : "");
  }

  // --- Filter discovery results to only suggest tools NOT already run in this loop ---
  const internalToolNames = new Set([
    "recap_conversation", "detect_conflicts", "check_ambiguity",
    "entropy_monitor", "abstention_check", "context_loop",
    "check_grounding", "detect_drift",
  ]);
  const suggestedNextTools = (discoveryResult?.suggestedTools ?? [])
    .filter(t => !internalToolNames.has(t.toolName))
    .map(t => t.toolName);

  // --- Record health snapshot and run drift detection (Stage 9 completion) ---
  const driftStart = Date.now();
  try {
    const latestTurn = messages.length > 0 ? Math.max(...messages.map(m => m.turn)) : 0;
    const breakdown: Record<string, number> = {};
    if (entropyResult) breakdown.entropy = 1 - entropyResult.metrics.compositeScore;
    if (ambiguityResult) breakdown.ambiguity = 1 - ambiguityResult.score;
    if (abstentionResult) breakdown.abstention = abstentionResult.confidence;
    if (conflictsResult) breakdown.conflict = conflictsResult.hasConflicts ? 0.3 : 1.0;
    if (groundingResult) breakdown.grounding = groundingResult.score;
    recordHealthSnapshot(sessionId, latestTurn, contextHealth, breakdown);
    driftResult = runDriftDetection(sessionId);
    stages.push({ name: "drift", status: "completed", durationMs: Date.now() - driftStart, result: driftResult });
  } catch (e) {
    stages.push({ name: "drift", status: "error", durationMs: Date.now() - driftStart, result: String(e) });
  }

  // --- Build machine-readable constraints (W4 fix: less LLM-reliant) ---
  const constraints: DirectiveConstraint[] = [];

  if (abstentionResult?.shouldAbstain) {
    constraints.push({
      type: "must_not_answer",
      scope: claim ?? "current_query",
      reason: `Abstention confidence ${(abstentionResult.confidence * 100).toFixed(0)}% — insufficient verified info`,
    });
    for (const q of abstentionResult.suggestedQuestions.slice(0, 3)) {
      constraints.push({ type: "must_ask", scope: q, reason: "Missing information detected by abstention check" });
    }
  }
  if (conflictsResult?.hasConflicts) {
    for (const c of conflictsResult.conflicts.filter(c => c.severity === "high")) {
      constraints.push({
        type: "must_verify",
        scope: c.existingKey,
        reason: `High-severity conflict: stored "${String(c.existingValue)}" vs new "${c.conflictingStatement}"`,
      });
    }
  }
  if (entropyResult?.spikeDetected) {
    constraints.push({
      type: "must_reset",
      scope: "conversation_context",
      reason: `Entropy spike ${entropyResult.metrics.compositeScore.toFixed(2)} exceeds threshold`,
    });
  }
  if (groundingResult && !groundingResult.isGrounded) {
    constraints.push({
      type: "must_ground",
      scope: "assistant_claims",
      reason: `Grounding score ${groundingResult.score.toFixed(2)} — ${groundingResult.ungroundedClaims.length} ungrounded claim(s)`,
    });
  }
  if (driftResult?.hasDrift && driftResult.severity > 0.5) {
    constraints.push({
      type: "must_reset",
      scope: "context_drift",
      reason: `${driftResult.driftType} drift detected (severity ${driftResult.severity.toFixed(2)}, risk ${driftResult.riskScore.toFixed(2)})`,
    });
  }

  // --- Override action if drift is critical ---
  if (driftResult?.hasDrift && driftResult.riskScore >= 0.7 && action === "proceed") {
    action = "reset";
    summary = `Temporal drift detected (${driftResult.driftType}, risk ${driftResult.riskScore.toFixed(2)}). Context reset recommended.`;
    instruction = `Your context health has been ${driftResult.trend} over recent turns. ${driftResult.recommendation} Call recap_conversation or clear_state to re-anchor.`;
  }
  if (groundingResult && !groundingResult.isGrounded && action === "proceed") {
    action = "clarify";
    summary = `Grounding check failed (score ${groundingResult.score.toFixed(2)}). ${groundingResult.ungroundedClaims.length} ungrounded claim(s).`;
    instruction = `Your recent response contains claims not supported by stored facts.\n` +
      `Ungrounded: ${groundingResult.ungroundedClaims.slice(0, 3).join("; ")}.\n` +
      `${groundingResult.suggestions.join(" ")}`;
  }

  const directive: LoopDirective = {
    action,
    instruction,
    questions: uniqueQuestions,
    contextHealth,
    autoExtractedFacts,
    suggestedNextTools,
    constraints,
    grounding: groundingResult ? {
      isGrounded: groundingResult.isGrounded,
      score: groundingResult.score,
      ungroundedClaims: groundingResult.ungroundedClaims,
    } : null,
    drift: driftResult ? {
      hasDrift: driftResult.hasDrift,
      driftType: driftResult.driftType,
      severity: driftResult.severity,
      trend: driftResult.trend,
      riskScore: driftResult.riskScore,
    } : null,
  };

  return {
    sessionId,
    action,
    summary,
    directive,
    stages,
    recap: recapResult,
    conflicts: conflictsResult,
    ambiguity: ambiguityResult,
    entropy: entropyResult,
    abstention: abstentionResult,
    discovery: discoveryResult,
    grounding: groundingResult,
    drift: driftResult,
    timestamp: new Date(),
  };
}

// ─── Auto Ground-Truth Extraction ───

/**
 * Extract key-value facts from user messages using heuristic patterns.
 * Looks for explicit declarations, preferences, and decisions.
 */
/**
 * Normalize entity names to canonical forms.
 * "ReactJS" → "react", "Node.js" → "nodejs", "PostgreSQL" → "postgresql"
 */
function normalizeEntity(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.js$/i, "js")       // Node.js → nodejs
    .replace(/\.ts$/i, "ts")       // Deno.ts → denots (rare but consistent)
    .replace(/[\s._-]+/g, "")      // React_JS → reactjs, Vue.js → vuejs
    .replace(/^the\s+/i, "");       // "the database" → "database"
}

function extractFacts(text: string): Record<string, string> {
  const facts: Record<string, string> = {};

  const patterns: Array<{ pattern: RegExp; keyGroup: number; valueGroup: number }> = [
    // "use X" / "using X" / "we're using X"
    { pattern: /\b(?:use|using|we(?:'re| are) using)\s+([A-Z][\w.-]+(?:\s+[\w.-]+){0,2})/gi, keyGroup: 0, valueGroup: 1 },
    // "the X is Y" / "X should be Y"
    { pattern: /\bthe\s+([\w\s]{2,30}?)\s+(?:is|should be|will be|must be)\s+["']?([^.!?\n]{2,60})["']?/gi, keyGroup: 1, valueGroup: 2 },
    // "deploy to X" / "deploy on X"
    { pattern: /\b(?:deploy|deploying|host|hosting)\s+(?:to|on)\s+([\w\s.-]{2,30})/gi, keyGroup: 0, valueGroup: 1 },
    // "language: X" / "framework: X" — colon-separated key-value
    { pattern: /\b(language|framework|database|platform|runtime|stack|target|env|environment)\s*[:=]\s*["']?([\w\s.-]{2,40})["']?/gi, keyGroup: 1, valueGroup: 2 },
    // "I want X" / "I need X"
    { pattern: /\bI\s+(?:want|need|require|prefer)\s+(.{3,60}?)(?:\.|$|,)/gi, keyGroup: 0, valueGroup: 1 },
  ];

  for (const { pattern, keyGroup, valueGroup } of patterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const rawKey = normalizeEntity(
        keyGroup === 0
          ? match[0].split(/\s+/).slice(0, 2).join("_")
          : match[keyGroup]
      ).slice(0, 40);
      const rawValue = match[valueGroup].trim().slice(0, 100);
      if (rawKey.length >= 2 && rawValue.length >= 2) {
        facts[rawKey] = rawValue;
      }
    }
  }

  return facts;
}
