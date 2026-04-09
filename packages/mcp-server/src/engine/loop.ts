import type { SessionStore } from "../state/store.js";
import type { ToolCatalog } from "../registry/catalog.js";
import type { UnifiedLoopResult, UnifiedLoopStage } from "../state/types.js";
import { refineConversation } from "./refiner.js";
import { detectConflicts } from "./detector.js";
import { checkAmbiguity } from "./validator.js";
import { computeEntropy } from "./entropy.js";
import { checkAbstention } from "./abstention.js";
import { discoverTools } from "./discovery.js";

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
    currentInput,
    claim,
    discoveryQuery,
    lookbackTurns = 5,
    entropyThreshold = 0.6,
    abstentionThreshold = 0.6,
  } = input;

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

  // --- Stage 8: SYNTHESIS ---
  let action: UnifiedLoopResult["action"] = "proceed";
  let summary = "";

  if (abstentionResult?.shouldAbstain) {
    action = "abstain";
    summary = `Low confidence (${(abstentionResult.confidence * 100).toFixed(0)}%). ${abstentionResult.suggestedQuestions.length} clarifying questions suggested.`;
  } else if (entropyResult?.spikeDetected) {
    action = "reset";
    summary = `Entropy spike detected (composite: ${entropyResult.metrics.compositeScore.toFixed(2)}). Context reset recommended.`;
  } else if (ambiguityResult?.isAmbiguous || conflictsResult?.hasConflicts) {
    action = "clarify";
    const parts: string[] = [];
    if (ambiguityResult?.isAmbiguous) parts.push(`ambiguity score ${ambiguityResult.score.toFixed(2)}`);
    if (conflictsResult?.hasConflicts) parts.push(`${conflictsResult.conflicts.length} conflict(s) detected`);
    summary = `Clarification needed: ${parts.join(", ")}.`;
  } else {
    action = "proceed";
    const completedStages = stages.filter(s => s.status === "completed").length;
    summary = `All ${completedStages} stages passed. Context is healthy.`;
  }

  return {
    sessionId,
    action,
    summary,
    stages,
    recap: recapResult,
    conflicts: conflictsResult,
    ambiguity: ambiguityResult,
    entropy: entropyResult,
    abstention: abstentionResult,
    discovery: discoveryResult,
    timestamp: new Date(),
  };
}
