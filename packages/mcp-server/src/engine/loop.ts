import type { SessionStore } from "../state/store.js";
import type { ToolCatalog } from "../registry/catalog.js";
import type {
  UnifiedLoopResult,
  UnifiedLoopStage,
  LoopDirective,
  DirectiveConstraint,
  GroundingResult,
  DriftResult,
  InternalStateResult,
  NCBResult,
  VerifyFirstResult,
  TruthDirectionResult,
  LogicalConsistencyResult,
  IoEResult,
  SelfCritiqueResult,
} from "../state/types.js";
import { refineConversation } from "./refiner.js";
import { detectConflicts } from "./detector.js";
import { checkAmbiguity } from "./validator.js";
import { computeEntropy } from "./entropy.js";
import { checkAbstention } from "./abstention.js";
import { discoverTools } from "./discovery.js";
import { checkGrounding } from "./grounding.js";
import { recordHealthSnapshot, detectDrift as runDriftDetection } from "./drift.js";
import { analyzeDepth } from "./depth.js";
import { probeInternalState } from "./internal-state.js";
import { checkNeighborhoodConsistency } from "./neighborhood.js";
import { verifyFirst } from "./verify-first.js";
import { analyzeTruthDirection } from "./truth-direction.js";
import { checkLogicalConsistency } from "./logical-consistency.js";
import { ioeSelfCorrect } from "./ioe-correct.js";
import { iterativeSelfCritique } from "./self-critique.js";
import type { DepthResult } from "../state/types.js";

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

  // --- Stage 9.5: DEPTH QUALITY CHECK (arXiv:2512.20662 — Laziness Detection) ---
  let depthResult: DepthResult | null = null;
  const depthStart = Date.now();
  try {
    const assistantOutputsForDepth = messages
      .filter(m => m.role === "assistant")
      .map(m => m.content);
    if (assistantOutputsForDepth.length > 0) {
      const lastOutput = assistantOutputsForDepth[assistantOutputsForDepth.length - 1];
      depthResult = analyzeDepth(lastOutput);
      stages.push({ name: "depth", status: "completed", durationMs: Date.now() - depthStart, result: depthResult });
    } else {
      stages.push({ name: "depth", status: "skipped", durationMs: Date.now() - depthStart, result: "No assistant output to analyze for depth" });
    }
  } catch (e) {
    stages.push({ name: "depth", status: "error", durationMs: Date.now() - depthStart, result: String(e) });
  }

  // --- Stage 9.6: INTERNAL STATE PROBING (Layer 5 — "The Internal State Knows When It's Lying") ---
  let internalStateResult: InternalStateResult | null = null;
  const internalStateStart = Date.now();
  try {
    const assistantOutputsForState = messages
      .filter(m => m.role === "assistant")
      .map(m => m.content);
    if (assistantOutputsForState.length > 0) {
      const lastOutput = assistantOutputsForState[assistantOutputsForState.length - 1];
      const freshSessionIS = store.getOrCreate(sessionId);
      internalStateResult = probeInternalState(
        lastOutput,
        freshSessionIS.groundTruth,
        assistantOutputsForState.length > 1 ? assistantOutputsForState.slice(0, -1) : undefined
      );
      stages.push({ name: "internal_state", status: "completed", durationMs: Date.now() - internalStateStart, result: internalStateResult });
    } else {
      stages.push({ name: "internal_state", status: "skipped", durationMs: Date.now() - internalStateStart, result: "No assistant output to probe" });
    }
  } catch (e) {
    stages.push({ name: "internal_state", status: "error", durationMs: Date.now() - internalStateStart, result: String(e) });
  }

  // --- Stage 9.7: NEIGHBORHOOD CONSISTENCY (Layer 5 — NCB Measurement) ---
  let neighborhoodResult: NCBResult | null = null;
  const neighborhoodStart = Date.now();
  try {
    const assistantOutputsForNCB = messages
      .filter(m => m.role === "assistant")
      .map(m => m.content);
    const freshSessionNCB = store.getOrCreate(sessionId);
    if (currentInput && assistantOutputsForNCB.length > 0) {
      const lastOutput = assistantOutputsForNCB[assistantOutputsForNCB.length - 1];
      const knownFacts = Array.from(freshSessionNCB.groundTruth.values()).map(
        (entry) => `${entry.value}`
      );
      neighborhoodResult = checkNeighborhoodConsistency(
        currentInput,
        lastOutput,
        knownFacts
      );
      stages.push({ name: "neighborhood", status: "completed", durationMs: Date.now() - neighborhoodStart, result: neighborhoodResult });
    } else {
      stages.push({ name: "neighborhood", status: "skipped", durationMs: Date.now() - neighborhoodStart, result: currentInput ? "No assistant output" : "No currentInput provided" });
    }
  } catch (e) {
    stages.push({ name: "neighborhood", status: "error", durationMs: Date.now() - neighborhoodStart, result: String(e) });
  }

  // --- Stage 9.8: VERIFY-FIRST (Layer 5 — Chain-of-Verification) ---
  let verificationResult: VerifyFirstResult | null = null;
  const verifyStart = Date.now();
  try {
    const assistantOutputsForVerify = messages
      .filter(m => m.role === "assistant")
      .map(m => m.content);
    const freshSessionV = store.getOrCreate(sessionId);
    if (assistantOutputsForVerify.length > 0 && currentInput) {
      const lastOutput = assistantOutputsForVerify[assistantOutputsForVerify.length - 1];
      const knownFacts = Array.from(freshSessionV.groundTruth.values()).map(
        (entry) => String(entry.value)
      );
      verificationResult = verifyFirst(
        lastOutput,
        currentInput,
        undefined,
        knownFacts.length > 0 ? knownFacts : undefined
      );
      stages.push({ name: "verify_first", status: "completed", durationMs: Date.now() - verifyStart, result: verificationResult });
    } else {
      stages.push({ name: "verify_first", status: "skipped", durationMs: Date.now() - verifyStart, result: assistantOutputsForVerify.length === 0 ? "No assistant output to verify" : "No currentInput provided" });
    }
  } catch (e) {
    stages.push({ name: "verify_first", status: "error", durationMs: Date.now() - verifyStart, result: String(e) });
  }

  // --- Stage 9.9: TRUTH DIRECTION (Layer 5 — Truth Vector Analysis) ---
  let truthDirectionResult: TruthDirectionResult | null = null;
  const truthDirStart = Date.now();
  try {
    const freshSessionTD = store.getOrCreate(sessionId);
    const assistantOutputsTD = messages.filter(m => m.role === "assistant").map(m => m.content);
    if (assistantOutputsTD.length > 0 && freshSessionTD.groundTruth.size > 0) {
      const lastOutput = assistantOutputsTD[assistantOutputsTD.length - 1];
      const priorOutputs = assistantOutputsTD.slice(0, -1);
      truthDirectionResult = analyzeTruthDirection(lastOutput, freshSessionTD.groundTruth, priorOutputs);
      stages.push({ name: "truth_direction", status: "completed", durationMs: Date.now() - truthDirStart, result: truthDirectionResult });
    } else {
      stages.push({ name: "truth_direction", status: "skipped", durationMs: Date.now() - truthDirStart, result: "No assistant output or ground truth available" });
    }
  } catch (e) {
    stages.push({ name: "truth_direction", status: "error", durationMs: Date.now() - truthDirStart, result: String(e) });
  }

  // --- Stage 9.10: LOGICAL CONSISTENCY (Layer 5 — Cross-Claim Logic Check) ---
  let logicalConsistencyResult: LogicalConsistencyResult | null = null;
  const logicStart = Date.now();
  try {
    const assistantOutputsLC = messages.filter(m => m.role === "assistant").map(m => m.content);
    if (assistantOutputsLC.length > 0) {
      const lastOutput = assistantOutputsLC[assistantOutputsLC.length - 1];
      // Extract claims as sentences from the last output
      const claims = lastOutput.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
      const freshSessionLC = store.getOrCreate(sessionId);
      const knownFacts = Array.from(freshSessionLC.groundTruth.values()).map(e => String(e.value));
      if (claims.length >= 2) {
        logicalConsistencyResult = checkLogicalConsistency(claims, knownFacts);
        stages.push({ name: "logical_consistency", status: "completed", durationMs: Date.now() - logicStart, result: logicalConsistencyResult });
      } else {
        stages.push({ name: "logical_consistency", status: "skipped", durationMs: Date.now() - logicStart, result: "Fewer than 2 claims extracted" });
      }
    } else {
      stages.push({ name: "logical_consistency", status: "skipped", durationMs: Date.now() - logicStart, result: "No assistant output" });
    }
  } catch (e) {
    stages.push({ name: "logical_consistency", status: "error", durationMs: Date.now() - logicStart, result: String(e) });
  }

  // --- Stage 9.11: IoE SELF-CORRECTION (Layer 6 — Conditional Correction) ---
  let ioeResult: IoEResult | null = null;
  const ioeStart = Date.now();
  try {
    const freshSessionIoE = store.getOrCreate(sessionId);
    const assistantOutputsIoE = messages.filter(m => m.role === "assistant").map(m => m.content);
    // Only run IoE correction if there are potential issues detected by prior stages
    const needsCorrection = (internalStateResult && internalStateResult.overallTruthfulness < 0.6) ||
      (verificationResult && !verificationResult.shouldAccept) ||
      (truthDirectionResult && truthDirectionResult.overallAlignment < 0.5) ||
      (logicalConsistencyResult && logicalConsistencyResult.inconsistentCount > 0);

    if (assistantOutputsIoE.length > 0 && needsCorrection) {
      const lastOutput = assistantOutputsIoE[assistantOutputsIoE.length - 1];
      const priorAttempts = assistantOutputsIoE.slice(0, -1);
      ioeResult = ioeSelfCorrect(lastOutput, freshSessionIoE.groundTruth, currentInput || "", priorAttempts);
      stages.push({ name: "ioe_correction", status: "completed", durationMs: Date.now() - ioeStart, result: ioeResult });
    } else {
      stages.push({ name: "ioe_correction", status: "skipped", durationMs: Date.now() - ioeStart, result: needsCorrection ? "No assistant output" : "No correction needed — prior stages passed" });
    }
  } catch (e) {
    stages.push({ name: "ioe_correction", status: "error", durationMs: Date.now() - ioeStart, result: String(e) });
  }

  // --- Stage 9.12: SELF-CRITIQUE (Layer 6 — Iterative Quality Improvement) ---
  let selfCritiqueResult: SelfCritiqueResult | null = null;
  const critiqueStart = Date.now();
  try {
    const assistantOutputsSC = messages.filter(m => m.role === "assistant").map(m => m.content);
    // Only run self-critique if the response needs improvement but isn't totally rejected
    const needsCritique = (depthResult?.isLazy) ||
      (verificationResult && !verificationResult.shouldAccept && verificationResult.verificationScore >= 0.3) ||
      (ioeResult && ioeResult.action === "correct");

    if (assistantOutputsSC.length > 0 && needsCritique) {
      const lastOutput = assistantOutputsSC[assistantOutputsSC.length - 1];
      const freshSessionSC = store.getOrCreate(sessionId);
      const contextFacts = Array.from(freshSessionSC.groundTruth.values()).map(e => String(e.value));
      selfCritiqueResult = iterativeSelfCritique(lastOutput, undefined, 2, contextFacts, currentInput || "");
      stages.push({ name: "self_critique", status: "completed", durationMs: Date.now() - critiqueStart, result: selfCritiqueResult });
    } else {
      stages.push({ name: "self_critique", status: "skipped", durationMs: Date.now() - critiqueStart, result: needsCritique ? "No assistant output" : "No critique needed — response quality acceptable" });
    }
  } catch (e) {
    stages.push({ name: "self_critique", status: "error", durationMs: Date.now() - critiqueStart, result: String(e) });
  }

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
  if (depthResult) weightedSignals.push({ value: depthResult.depthScore, weight: 1.1 });
  if (internalStateResult) weightedSignals.push({ value: internalStateResult.overallTruthfulness, weight: 1.2 });
  if (neighborhoodResult) weightedSignals.push({ value: neighborhoodResult.ncbScore, weight: 1.0 });
  if (verificationResult) weightedSignals.push({ value: verificationResult.verificationScore, weight: 1.1 });
  if (truthDirectionResult) weightedSignals.push({ value: truthDirectionResult.overallAlignment, weight: 1.2 });
  if (logicalConsistencyResult) weightedSignals.push({ value: logicalConsistencyResult.consistencyScore, weight: 1.3 });
  if (ioeResult) weightedSignals.push({ value: ioeResult.preConfidence.overallConfidence, weight: 1.0 });
  if (selfCritiqueResult) weightedSignals.push({ value: selfCritiqueResult.finalQuality, weight: 0.9 });

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
  } else if (depthResult?.isLazy) {
    action = "deepen";
    summary = `Laziness pattern detected: ${depthResult.sectionCount} sections but ${depthResult.shallowSections.length} are shallow (depth score ${depthResult.depthScore.toFixed(2)}).`;
    instruction = `Your output covers many topics but lacks depth. ${depthResult.recommendation}\n` +
      `Specific improvements needed:\n${depthResult.elaborationDirectives.map((d, i) => `${i + 1}. ${d}`).join("\n")}\n` +
      `Do NOT add more topics. Instead, deeply elaborate each existing section with specific examples, data, causal analysis, and evidence.`;
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
  if (depthResult?.isLazy) {
    for (const section of depthResult.shallowSections.slice(0, 5)) {
      constraints.push({
        type: "must_deepen",
        scope: section.heading,
        reason: `Section "${section.heading}" is shallow: ${section.wordCount} words, ${section.sentenceCount} sentences, density ${section.detailDensity.toFixed(2)}`,
      });
    }
  }
  if (internalStateResult && internalStateResult.likelyFalseCount > 0) {
    constraints.push({
      type: "must_verify_claims",
      scope: "likely_false_claims",
      reason: `Internal state probing detected ${internalStateResult.likelyFalseCount} likely false claim(s) (overall truthfulness ${(internalStateResult.overallTruthfulness * 100).toFixed(0)}%)`,
    });
  }
  if (neighborhoodResult && neighborhoodResult.verdict === "brittle") {
    constraints.push({
      type: "must_verify_claims",
      scope: "brittle_response",
      reason: `Neighborhood consistency check: response is brittle (NCB score ${neighborhoodResult.ncbScore.toFixed(2)}, genuine knowledge confidence ${neighborhoodResult.genuineKnowledgeConfidence.toFixed(2)})`,
    });
  }
  if (verificationResult && !verificationResult.shouldAccept && verificationResult.verificationScore < 0.45) {
    constraints.push({
      type: "must_correct",
      scope: "rejected_answer",
      reason: `Verify-first check recommends rejection (score ${verificationResult.verificationScore.toFixed(2)})`,
    });
  } else if (verificationResult && !verificationResult.shouldAccept) {
    constraints.push({
      type: "must_verify_claims",
      scope: "revise_answer",
      reason: `Verify-first check recommends revision (score ${verificationResult.verificationScore.toFixed(2)})`,
    });
  }
  if (truthDirectionResult && truthDirectionResult.deviantClaims.length > 0) {
    constraints.push({
      type: "must_check_truth",
      scope: "deviant_claims",
      reason: `Truth direction analysis: ${truthDirectionResult.deviantClaims.length} claim(s) deviate from ground truth (alignment ${truthDirectionResult.overallAlignment.toFixed(2)})`,
    });
  }
  if (logicalConsistencyResult && logicalConsistencyResult.inconsistentCount > 0) {
    constraints.push({
      type: "must_check_logic",
      scope: "inconsistent_claims",
      reason: `Logical consistency check: ${logicalConsistencyResult.inconsistentCount} inconsistency(ies) found (score ${logicalConsistencyResult.consistencyScore.toFixed(2)})`,
    });
  }
  if (ioeResult && ioeResult.action === "escalate") {
    for (const q of ioeResult.escalationQuestions.slice(0, 3)) {
      constraints.push({ type: "must_ask", scope: q, reason: "IoE self-correction escalated — needs user input" });
    }
  }
  if (ioeResult && ioeResult.action === "correct") {
    constraints.push({
      type: "must_self_correct",
      scope: "response_corrections",
      reason: `IoE identified ${ioeResult.corrections.length} correction(s). Confidence: ${(ioeResult.preConfidence.overallConfidence * 100).toFixed(0)}% → ${ioeResult.postConfidence ? (ioeResult.postConfidence.overallConfidence * 100).toFixed(0) + "%" : "pending"}`,
    });
  }
  if (selfCritiqueResult && selfCritiqueResult.remainingIssues.length > 0) {
    constraints.push({
      type: "must_self_critique",
      scope: "quality_issues",
      reason: `Self-critique: ${selfCritiqueResult.remainingIssues.length} remaining issue(s). Quality: ${selfCritiqueResult.initialQuality.toFixed(2)} → ${selfCritiqueResult.finalQuality.toFixed(2)}`,
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
  if (depthResult?.isLazy && action === "proceed") {
    action = "deepen";
    summary = `Depth check: laziness pattern detected (depth ${depthResult.depthScore.toFixed(2)}, ${depthResult.shallowSections.length} shallow sections).`;
    instruction = `Your output covers many topics but lacks depth. ${depthResult.recommendation}\n` +
      `Specific improvements needed:\n${depthResult.elaborationDirectives.map((d, i) => `${i + 1}. ${d}`).join("\n")}\n` +
      `Do NOT add more topics. Instead, deeply elaborate each existing section with specific examples, data, causal analysis, and evidence.`;
  }
  // --- Layer 5 overrides ---
  if (verificationResult && !verificationResult.shouldAccept && verificationResult.verificationScore < 0.45 && action === "proceed") {
    action = "verify";
    summary = `Verify-first check rejected the answer (score ${verificationResult.verificationScore.toFixed(2)}).`;
    instruction = `Your response failed verification. Score: ${verificationResult.verificationScore.toFixed(2)}. ` +
      `Re-examine your claims for factual accuracy and internal consistency before responding.`;
  }
  if (internalStateResult && internalStateResult.overallTruthfulness < 0.4 && action === "proceed") {
    action = "verify";
    summary = `Internal state probing flagged low truthfulness (${(internalStateResult.overallTruthfulness * 100).toFixed(0)}%, ${internalStateResult.likelyFalseCount} likely false claims).`;
    instruction = `Internal state analysis detected ${internalStateResult.likelyFalseCount} potentially false claim(s). ` +
      `Overall truthfulness: ${(internalStateResult.overallTruthfulness * 100).toFixed(0)}%. ` +
      `Review and verify each claim before responding. ${internalStateResult.recommendations.slice(0, 3).join(" ")}`;
  }
  if (neighborhoodResult?.verdict === "brittle" && action === "proceed") {
    action = "verify";
    summary = `Neighborhood consistency check: response is brittle (NCB ${neighborhoodResult.ncbScore.toFixed(2)}).`;
    instruction = `Your response is not robust under perturbation — it may reflect surface-level pattern matching rather than genuine knowledge. ` +
      `NCB score: ${neighborhoodResult.ncbScore.toFixed(2)}. Genuine knowledge confidence: ${neighborhoodResult.genuineKnowledgeConfidence.toFixed(2)}. ` +
      `Verify your claims through alternative reasoning paths.`;
  }
  // --- Layer 6 overrides (truth, logic, correction, critique) ---
  if (truthDirectionResult && truthDirectionResult.overallAlignment < 0.3 && action === "proceed") {
    action = "verify";
    summary = `Truth direction analysis: low alignment (${truthDirectionResult.overallAlignment.toFixed(2)}), ${truthDirectionResult.deviantClaims.length} deviant claim(s).`;
    instruction = `Your response diverges significantly from verified facts. ` +
      `${truthDirectionResult.warnings.slice(0, 3).join(" ")} ` +
      `Re-examine claims against known facts before responding.`;
  }
  if (logicalConsistencyResult && logicalConsistencyResult.trustLevel === "low" && action === "proceed") {
    action = "verify";
    summary = `Logical consistency: low trust (score ${logicalConsistencyResult.consistencyScore.toFixed(2)}, ${logicalConsistencyResult.inconsistentCount} inconsistencies).`;
    instruction = `Your response contains logical inconsistencies. ` +
      `${logicalConsistencyResult.recommendations.slice(0, 3).join(" ")} ` +
      `Resolve contradictions before responding.`;
  }
  if (ioeResult?.action === "escalate" && (action === "proceed" || action === "verify")) {
    action = "clarify";
    summary = `IoE self-correction escalated — ${ioeResult.escalationQuestions.length} question(s) for user.`;
    instruction = `Self-correction analysis determined that user input is needed. ` +
      `Questions:\n${ioeResult.escalationQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
    uniqueQuestions.push(...ioeResult.escalationQuestions);
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
    depth: depthResult ? {
      depthScore: depthResult.depthScore,
      isLazy: depthResult.isLazy,
      shallowSections: depthResult.shallowSections.map(s => s.heading),
      elaborationDirectives: depthResult.elaborationDirectives,
    } : null,
    internalState: internalStateResult ? {
      overallTruthfulness: internalStateResult.overallTruthfulness,
      likelyTrueCount: internalStateResult.likelyTrueCount,
      uncertainCount: internalStateResult.uncertainCount,
      likelyFalseCount: internalStateResult.likelyFalseCount,
    } : null,
    neighborhood: neighborhoodResult ? {
      ncbScore: neighborhoodResult.ncbScore,
      verdict: neighborhoodResult.verdict,
      genuineKnowledgeConfidence: neighborhoodResult.genuineKnowledgeConfidence,
    } : null,
    verification: verificationResult ? {
      overallScore: verificationResult.verificationScore,
      recommendation: (verificationResult.shouldAccept ? "accept" : verificationResult.verificationScore >= 0.45 ? "revise" : "reject") as "accept" | "revise" | "reject",
    } : null,
    truthDirection: truthDirectionResult ? {
      overallAlignment: truthDirectionResult.overallAlignment,
      deviantClaimCount: truthDirectionResult.deviantClaims.length,
      coherentDirectionDetected: truthDirectionResult.coherentDirectionDetected,
      warnings: truthDirectionResult.warnings,
    } : null,
    logicalConsistency: logicalConsistencyResult ? {
      consistencyScore: logicalConsistencyResult.consistencyScore,
      inconsistentCount: logicalConsistencyResult.inconsistentCount,
      trustLevel: logicalConsistencyResult.trustLevel,
      recommendations: logicalConsistencyResult.recommendations,
    } : null,
    ioeCorrection: ioeResult ? {
      action: ioeResult.action,
      improved: ioeResult.improved,
      correctionCount: ioeResult.corrections.length,
      preConfidence: ioeResult.preConfidence.overallConfidence,
      postConfidence: ioeResult.postConfidence?.overallConfidence ?? null,
      escalationQuestions: ioeResult.escalationQuestions,
    } : null,
    selfCritique: selfCritiqueResult ? {
      initialQuality: selfCritiqueResult.initialQuality,
      finalQuality: selfCritiqueResult.finalQuality,
      totalImprovement: selfCritiqueResult.totalImprovement,
      converged: selfCritiqueResult.converged,
      remainingIssues: selfCritiqueResult.remainingIssues,
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
    depth: depthResult,
    internalState: internalStateResult,
    neighborhood: neighborhoodResult,
    verification: verificationResult,
    truthDirection: truthDirectionResult,
    logicalConsistency: logicalConsistencyResult,
    ioeCorrection: ioeResult,
    selfCritique: selfCritiqueResult,
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
    // "X is defined as Y" / "X refers to Y" / "X means Y" — definitional patterns
    { pattern: /\b([\w\s]{2,30}?)\s+(?:is defined as|refers to|means|is called)\s+["']?([^.!?\n]{3,80})["']?/gi, keyGroup: 1, valueGroup: 2 },
    // "there are N types of X" / "X includes: A, B, C" — enumerative facts
    { pattern: /\bthere are\s+(\d+)\s+([\w\s]{2,30})/gi, keyGroup: 2, valueGroup: 1 },
    // "X consists of Y" / "X is composed of Y"
    { pattern: /\b([\w\s]{2,30}?)\s+(?:consists? of|is composed of|includes?|contains?)\s+([^.!?\n]{3,80})/gi, keyGroup: 1, valueGroup: 2 },
    // "the key insight is X" / "the main point is X" — research insight patterns
    { pattern: /\b(?:the )?(?:key|main|critical|important|core)\s+(?:insight|point|finding|takeaway|observation)\s+(?:is|:)\s+([^.!?\n]{5,100})/gi, keyGroup: 0, valueGroup: 1 },
    // Numeric facts: "X is N%" / "X has N units"
    { pattern: /\b([\w\s]{2,25}?)\s+(?:is|has|was|were|had|averages?|equals?)\s+(\d+\.?\d*\s*%?[\w\s]{0,20})/gi, keyGroup: 1, valueGroup: 2 },
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
