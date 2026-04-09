import type {
  GroundTruthEntry,
  ConflictEntry,
  HistoryEntry,
  AbstentionResult,
} from "../state/types.js";

const AMBIGUITY_INDICATORS = [
  /\b(?:something|stuff|things|etc|whatever)\b/i,
  /\b(?:maybe|perhaps|possibly|probably|might)\b/i,
  /\b(?:good|nice|better|best|great|proper)\b/i,
  /\b(?:some|few|several|many|lot|bunch)\b/i,
  /\b(?:soon|later|eventually|quickly|fast)\b/i,
  /\b(?:simple|easy|basic|standard|normal)\b/i,
  /\b(?:like|similar|kind of|sort of|ish)\b/i,
];

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * RLAAR (Reinforcement Learning-Augmented Abstention Reasoning) pattern.
 * Computes confidence across 5 dimensions to decide if the system should abstain.
 */
export function checkAbstention(
  claim: string,
  state: Map<string, GroundTruthEntry>,
  requiredKeys: string[],
  conflicts: ConflictEntry[],
  history: HistoryEntry[],
  threshold: number = 0.6
): AbstentionResult {
  const missingInfo: string[] = [];
  const suggestedQuestions: string[] = [];

  // Dimension 1: State Completeness
  const stateCompleteness = computeStateCompleteness(
    state,
    requiredKeys,
    missingInfo,
    suggestedQuestions
  );

  // Dimension 2: Recency
  const recency = computeRecency(state, requiredKeys, suggestedQuestions);

  // Dimension 3: Contradiction-Free
  const contradictionFree = computeContradictionFree(
    conflicts,
    requiredKeys,
    suggestedQuestions
  );

  // Dimension 4: Ambiguity-Free
  const ambiguityFree = computeAmbiguityFree(claim);

  // Dimension 5: Source Quality
  const sourceQuality = computeSourceQuality(
    state,
    requiredKeys,
    suggestedQuestions
  );

  const confidence = round(
    (stateCompleteness + recency + contradictionFree + ambiguityFree + sourceQuality) / 5
  );

  const shouldAbstain = confidence < threshold;

  return {
    shouldAbstain,
    confidence,
    dimensions: {
      stateCompleteness: round(stateCompleteness),
      recency: round(recency),
      contradictionFree: round(contradictionFree),
      ambiguityFree: round(ambiguityFree),
      sourceQuality: round(sourceQuality),
    },
    missingInfo: [...new Set(missingInfo)],
    suggestedQuestions: [...new Set(suggestedQuestions)].slice(0, 5),
  };
}

/**
 * Dimension 1: What proportion of required keys are present in state?
 */
function computeStateCompleteness(
  state: Map<string, GroundTruthEntry>,
  requiredKeys: string[],
  missingInfo: string[],
  suggestedQuestions: string[]
): number {
  if (requiredKeys.length === 0) return 1;

  let present = 0;
  for (const key of requiredKeys) {
    if (state.has(key)) {
      present++;
    } else {
      missingInfo.push(`Missing state key: "${key}"`);
      suggestedQuestions.push(`What is the value of "${key}"?`);
    }
  }

  return present / requiredKeys.length;
}

/**
 * Dimension 2: How recent are the relevant state entries?
 * Newer = higher score. Entries older than 1 hour score 0.
 */
function computeRecency(
  state: Map<string, GroundTruthEntry>,
  requiredKeys: string[],
  suggestedQuestions: string[]
): number {
  const relevantKeys = requiredKeys.filter((k) => state.has(k));
  if (relevantKeys.length === 0) return 0;

  const now = Date.now();
  let totalScore = 0;

  for (const key of relevantKeys) {
    const entry = state.get(key)!;
    const ageMs = now - entry.lockedAt.getTime();

    if (ageMs > ONE_HOUR_MS) {
      totalScore += 0;
      suggestedQuestions.push(`"${key}" was set over an hour ago. Is it still accurate?`);
    } else {
      // Linear decay: 1.0 at 0 age, 0.0 at 1 hour
      totalScore += 1 - ageMs / ONE_HOUR_MS;
    }
  }

  return totalScore / relevantKeys.length;
}

/**
 * Dimension 3: Are there unresolved conflicts for the required keys?
 */
function computeContradictionFree(
  conflicts: ConflictEntry[],
  requiredKeys: string[],
  suggestedQuestions: string[]
): number {
  if (requiredKeys.length === 0) return 1;

  const conflictingKeys = new Set<string>();
  for (const conflict of conflicts) {
    if (requiredKeys.includes(conflict.key)) {
      conflictingKeys.add(conflict.key);
    }
  }

  if (conflictingKeys.size > 0) {
    for (const key of conflictingKeys) {
      suggestedQuestions.push(
        `There is a conflict on "${key}". Can you clarify the current correct value?`
      );
    }
  }

  return 1 - conflictingKeys.size / requiredKeys.length;
}

/**
 * Dimension 4: How ambiguous is the claim itself?
 * Reuses the same ambiguity indicator pattern from validator.ts.
 */
function computeAmbiguityFree(claim: string): number {
  let ambiguityScore = 0;
  for (const pattern of AMBIGUITY_INDICATORS) {
    if (pattern.test(claim)) {
      ambiguityScore += 0.15;
    }
  }
  return Math.max(0, 1 - Math.min(1, ambiguityScore));
}

/**
 * Dimension 5: Proportion of "user-confirmed" sources vs "inferred" among required keys.
 */
function computeSourceQuality(
  state: Map<string, GroundTruthEntry>,
  requiredKeys: string[],
  suggestedQuestions: string[]
): number {
  const relevantKeys = requiredKeys.filter((k) => state.has(k));
  if (relevantKeys.length === 0) return 0;

  let confirmedCount = 0;
  for (const key of relevantKeys) {
    const entry = state.get(key)!;
    const source = entry.source.toLowerCase();

    if (
      source.includes("user") ||
      source.includes("confirmed") ||
      source === "user-confirmed"
    ) {
      confirmedCount++;
    } else {
      suggestedQuestions.push(
        `"${key}" was set via "${entry.source}". Can you confirm this is correct?`
      );
    }
  }

  return confirmedCount / relevantKeys.length;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
