/**
 * MemoryGate — FluxMem adaptive memory structure selection.
 *
 * Selects which memory structures to query based on interaction type.
 * Uses a probabilistic gate to fuse memories instead of relying
 * on simple similarity thresholds.
 */

import type { GateDecision, InteractionType } from "./types.js";

/** Classify the interaction type from query text */
export function classifyInteraction(query: string): InteractionType {
  const lower = query.toLowerCase();

  // Recall patterns
  if (
    /\b(remember|recall|earlier|previously|before|said|mentioned|told|we discussed)\b/.test(lower)
  ) {
    return "recall";
  }

  // Factual Q&A patterns
  if (
    /\b(what is|what are|how many|how much|when did|where is|who is|define|explain)\b/.test(lower)
  ) {
    return "factual_qa";
  }

  // Reasoning patterns
  if (
    /\b(why|because|therefore|however|although|if .+ then|compare|analyze|evaluate|reason)\b/.test(
      lower
    )
  ) {
    return "reasoning";
  }

  // Creative patterns
  if (
    /\b(create|design|imagine|generate|write|compose|invent|brainstorm|suggest)\b/.test(lower)
  ) {
    return "creative";
  }

  // Task execution patterns
  if (
    /\b(do|run|execute|implement|build|deploy|install|configure|fix|update|change|modify)\b/.test(
      lower
    )
  ) {
    return "task_execution";
  }

  // Default to multi-turn dialog
  return "multi_turn_dialog";
}

/**
 * Memory structure weights per interaction type.
 * Each row represents the probability weight for each memory structure.
 */
const STRUCTURE_WEIGHTS: Record<
  InteractionType,
  Record<string, number>
> = {
  factual_qa: {
    episodic: 0.2,
    semantic: 0.35,
    graph: 0.3,
    working: 0.1,
    scratchpad: 0.05,
  },
  reasoning: {
    episodic: 0.15,
    semantic: 0.3,
    graph: 0.35,
    working: 0.15,
    scratchpad: 0.05,
  },
  creative: {
    episodic: 0.1,
    semantic: 0.25,
    graph: 0.2,
    working: 0.25,
    scratchpad: 0.2,
  },
  multi_turn_dialog: {
    episodic: 0.15,
    semantic: 0.15,
    graph: 0.1,
    working: 0.35,
    scratchpad: 0.25,
  },
  task_execution: {
    episodic: 0.1,
    semantic: 0.2,
    graph: 0.15,
    working: 0.3,
    scratchpad: 0.25,
  },
  recall: {
    episodic: 0.4,
    semantic: 0.15,
    graph: 0.25,
    working: 0.1,
    scratchpad: 0.1,
  },
};

/** Fusion strategy selection based on interaction type */
function selectFusionStrategy(
  interactionType: InteractionType
): GateDecision["fusionStrategy"] {
  switch (interactionType) {
    case "factual_qa":
    case "recall":
      return "priority_cascade"; // Best match first, fallback to next
    case "reasoning":
      return "ensemble"; // Combine all sources for broader reasoning
    case "creative":
    case "multi_turn_dialog":
    case "task_execution":
      return "weighted_merge"; // Blend based on weights
  }
}

/**
 * Compute the gate decision: which memory structures to query and how to fuse.
 *
 * @param query - The user's query text
 * @param availableStructures - Which structures have data for this session
 * @param contextSignals - Optional signals (e.g., turn count, recent entropy)
 */
export function computeGateDecision(
  query: string,
  availableStructures: Set<string>,
  contextSignals?: {
    turnCount?: number;
    recentEntropy?: number;
    hasConflicts?: boolean;
    queryComplexity?: number;
  }
): GateDecision {
  const interactionType = classifyInteraction(query);
  const baseWeights = STRUCTURE_WEIGHTS[interactionType];

  // Adjust weights based on context signals
  const adjustedWeights = { ...baseWeights };

  if (contextSignals) {
    // High entropy → boost episodic (raw data) and graph (structured data)
    if (contextSignals.recentEntropy && contextSignals.recentEntropy > 0.6) {
      adjustedWeights.episodic *= 1.3;
      adjustedWeights.graph *= 1.2;
      adjustedWeights.working *= 0.7;
    }

    // Conflicts → boost semantic (consolidated truth) and graph
    if (contextSignals.hasConflicts) {
      adjustedWeights.semantic *= 1.4;
      adjustedWeights.graph *= 1.2;
    }

    // Long conversation → boost episodic and semantic over working
    if (contextSignals.turnCount && contextSignals.turnCount > 20) {
      adjustedWeights.episodic *= 1.2;
      adjustedWeights.semantic *= 1.3;
      adjustedWeights.working *= 0.8;
      adjustedWeights.scratchpad *= 0.6;
    }

    // Complex query → boost ensemble structures
    if (contextSignals.queryComplexity && contextSignals.queryComplexity > 0.7) {
      adjustedWeights.semantic *= 1.2;
      adjustedWeights.graph *= 1.3;
    }
  }

  // Normalize and filter by availability
  const selectedStructures: GateDecision["selectedStructures"] = [];
  let totalWeight = 0;

  for (const [structure, weight] of Object.entries(adjustedWeights)) {
    if (availableStructures.has(structure) && weight > 0) {
      selectedStructures.push({
        structure: structure as GateDecision["selectedStructures"][0]["structure"],
        weight,
      });
      totalWeight += weight;
    }
  }

  // Normalize weights to sum to 1
  if (totalWeight > 0) {
    for (const entry of selectedStructures) {
      entry.weight /= totalWeight;
    }
  }

  // Sort by weight descending
  selectedStructures.sort((a, b) => b.weight - a.weight);

  const fusionStrategy = selectFusionStrategy(interactionType);

  // Confidence based on how many structures are available and weights spread
  const confidence = Math.min(
    1.0,
    (selectedStructures.length / 5) * 0.5 +
      (selectedStructures[0]?.weight ?? 0) * 0.5
  );

  return {
    selectedStructures,
    interactionType,
    confidence,
    fusionStrategy,
  };
}
