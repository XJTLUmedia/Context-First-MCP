import type {
  GroundTruthEntry,
  TruthDirectionResult,
  TruthDirectionClaim,
} from "../state/types.js";
import { splitSentences, compareTwoStrings } from "./nlp-utils.js";

/**
 * Truth Direction Analysis — inspired by "Consistency and Generalization of Truth Directions in LLMs".
 *
 * Research shows that LLMs encode truthfulness as a distinct linear feature ("truth direction")
 * within their activation space. This module simulates truth direction detection using
 * text-level proxy features:
 *
 *   1. Fact Consistency — alignment with known facts in ground truth
 *   2. Linguistic Confidence — assertion strength without over-hedging
 *   3. Logical Coherence — internal consistency across claims
 *   4. Source Attribution — proper citation/reference behavior
 *
 * The "truth vector" represents the direction in feature space that separates
 * truthful from non-truthful outputs. Claims projecting positively onto this
 * direction are classified as truthful; deviations signal potential hallucination.
 */

// ─── Pattern Banks ───

const CONFIDENT_PATTERNS = [
  /\b(?:is|are|was|were|has been|will be)\b/i,
  /\b(?:confirmed|verified|established|proven|demonstrated)\b/i,
  /\b(?:shows|reveals|indicates|demonstrates|confirms)\b/i,
];

const HEDGING_PATTERNS = [
  /\b(?:maybe|perhaps|possibly|could be|might be|may be)\b/i,
  /\b(?:I think|I believe|I guess|it seems|appears to)\b/i,
  /\b(?:not entirely sure|hard to say|open to debate)\b/i,
];

const CONTRADICTION_MARKERS = [
  /\b(?:however|but|although|despite|nevertheless|on the other hand)\b/i,
  /\b(?:contrary to|in contrast|unlike|as opposed to)\b/i,
];

const SOURCE_PATTERNS = [
  /\b(?:according to|based on|as described in|per|citing)\b/i,
  /\b(?:research|study|paper|article|documentation|source)\b/i,
  /\b(?:arXiv|IEEE|ACM|NIPS|ICML|published)\b/i,
];

// ─── Claim Extraction ───

/**
 * Extract declarative claims from text (sentences that assert facts).
 */
function extractDeclarativeClaims(text: string): string[] {
  const sentences = splitSentences(text).filter(s => s.length > 15);

  return sentences.filter(s => {
    if (s.endsWith("?")) return false;
    return /\b(?:is|are|was|were|has|have|had|will|does|do|can)\b/i.test(s);
  });
}

// ─── Core API ───

/**
 * Analyze the truth direction of claims in a text against known ground truth.
 * Returns a truth vector, per-claim scores, and deviation warnings.
 */
export function analyzeTruthDirection(
  assistantOutput: string,
  groundTruth: Map<string, GroundTruthEntry>,
  priorOutputs: string[] = []
): TruthDirectionResult {
  const claims = extractDeclarativeClaims(assistantOutput);

  if (claims.length === 0) {
    return {
      overallAlignment: 1.0,
      claims: [],
      truthVector: {
        factConsistency: 0,
        linguisticConfidence: 0,
        logicalCoherence: 0,
        sourceAttribution: 0,
      },
      deviantClaims: [],
      interClaimConsistency: 1.0,
      coherentDirectionDetected: false,
      warnings: ["No declarative claims detected to analyze for truth direction."],
    };
  }

  // Compute the truth vector (feature weights for the truth direction)
  const truthVector = computeTruthVector(assistantOutput, groundTruth);

  // Project each claim onto the truth direction
  const claimResults: TruthDirectionClaim[] = claims.map(claim =>
    projectClaimOntoTruthDirection(claim, truthVector, groundTruth, claims, priorOutputs)
  );

  // Compute inter-claim consistency
  const interClaimConsistency = computeInterClaimConsistency(claimResults);

  // Identify deviant claims
  const deviantClaims = claimResults
    .filter(c => c.isDeviant)
    .map(c => c.claim);

  // Determine if a coherent truth direction was detected
  const scores = claimResults.map(c => c.truthDirectionScore);
  const scoreVariance = computeVariance(scores);
  const coherentDirectionDetected = scoreVariance < 0.15 && scores.length >= 2;

  // Overall alignment: average truth direction score, normalized to 0-1
  const overallAlignment = round(
    claimResults.reduce((s, c) => s + (c.truthDirectionScore + 1) / 2, 0) / claimResults.length
  );

  const warnings = generateWarnings(claimResults, overallAlignment, interClaimConsistency);

  return {
    overallAlignment,
    claims: claimResults,
    truthVector: {
      factConsistency: round(truthVector.factConsistency),
      linguisticConfidence: round(truthVector.linguisticConfidence),
      logicalCoherence: round(truthVector.logicalCoherence),
      sourceAttribution: round(truthVector.sourceAttribution),
    },
    deviantClaims,
    interClaimConsistency: round(interClaimConsistency),
    coherentDirectionDetected,
    warnings,
  };
}

// ─── Truth Vector Computation ───

interface TruthVector {
  factConsistency: number;
  linguisticConfidence: number;
  logicalCoherence: number;
  sourceAttribution: number;
}

function computeTruthVector(
  text: string,
  groundTruth: Map<string, GroundTruthEntry>
): TruthVector {
  return {
    factConsistency: computeFactConsistencyFeature(text, groundTruth),
    linguisticConfidence: computeLinguisticConfidenceFeature(text),
    logicalCoherence: computeLogicalCoherenceFeature(text),
    sourceAttribution: computeSourceAttributionFeature(text),
  };
}

function computeFactConsistencyFeature(
  text: string,
  groundTruth: Map<string, GroundTruthEntry>
): number {
  if (groundTruth.size === 0) return 0;

  const textLower = text.toLowerCase();
  let totalAlignment = 0;
  let checked = 0;

  for (const [key, entry] of groundTruth) {
    const keyParts = key.toLowerCase().replace(/[_-]/g, " ").split(/\s+/);
    const mentions = keyParts.some(p => p.length > 2 && textLower.includes(p));
    if (!mentions) continue;

    checked++;
    const valueStr = String(entry.value).toLowerCase();

    // Direct substring containment (strongest signal)
    if (textLower.includes(valueStr)) {
      totalAlignment += 1.0;
      continue;
    }

    // Extract sentences relevant to this fact for focused comparison
    const sentences = splitSentences(text);
    const relevantSentences = sentences.filter(s =>
      keyParts.some(p => p.length > 2 && s.toLowerCase().includes(p))
    );

    if (relevantSentences.length === 0) continue;

    // Best Dice match at sentence level for paraphrased values
    const bestAlignment = Math.max(
      ...relevantSentences.map(s => compareTwoStrings(s.toLowerCase(), valueStr))
    );
    totalAlignment += bestAlignment;
  }

  return checked > 0 ? totalAlignment / checked : 0;
}

function computeLinguisticConfidenceFeature(text: string): number {
  let confidentMatches = 0;
  let hedgingMatches = 0;

  for (const p of CONFIDENT_PATTERNS) {
    const matches = text.match(new RegExp(p.source, "gi"));
    if (matches) confidentMatches += matches.length;
  }
  for (const p of HEDGING_PATTERNS) {
    const matches = text.match(new RegExp(p.source, "gi"));
    if (matches) hedgingMatches += matches.length;
  }

  const total = confidentMatches + hedgingMatches;
  if (total === 0) return 0.5;
  return confidentMatches / total;
}

function computeLogicalCoherenceFeature(text: string): number {
  const sentences = splitSentences(text).filter(s => s.length > 10);
  if (sentences.length <= 1) return 0.8;

  let contradictions = 0;
  for (const p of CONTRADICTION_MARKERS) {
    const matches = text.match(new RegExp(p.source, "gi"));
    if (matches) contradictions += matches.length;
  }

  // Controlled contradictions (logical flow) are fine; excessive = incoherence
  const density = contradictions / sentences.length;
  return Math.max(0, 1 - density * 2);
}

function computeSourceAttributionFeature(text: string): number {
  let sourceMatches = 0;
  for (const p of SOURCE_PATTERNS) {
    if (p.test(text)) sourceMatches++;
  }
  return Math.min(1, sourceMatches / 3);
}

// ─── Claim Projection ───

function projectClaimOntoTruthDirection(
  claim: string,
  truthVector: TruthVector,
  groundTruth: Map<string, GroundTruthEntry>,
  allClaims: string[],
  priorOutputs: string[]
): TruthDirectionClaim {
  // Compute per-claim features
  const f1 = computeFactConsistencyFeature(claim, groundTruth);
  const f2 = computeLinguisticConfidenceFeature(claim);
  const f3 = computeLogicalCoherenceFeature(claim);
  const f4 = computeSourceAttributionFeature(claim);

  // Project onto truth direction: dot product with truth vector
  const projection =
    f1 * (truthVector.factConsistency + 0.3) +
    f2 * (truthVector.linguisticConfidence + 0.3) +
    f3 * (truthVector.logicalCoherence + 0.3) +
    f4 * (truthVector.sourceAttribution + 0.3);

  // Normalize to -1 to 1 range
  const maxProjection = 4 * 1.3; // theoretical max
  const truthDirectionScore = round((projection / maxProjection) * 2 - 1);

  // Cross-claim consistency
  const crossClaimConsistency = computeCrossClaimConsistency(claim, allClaims, priorOutputs);

  // Deviation: claim deviates if its score is far from the mean
  const claimScores = allClaims.map(c => {
    const cf = computeLinguisticConfidenceFeature(c);
    return cf;
  });
  const meanScore = avg(claimScores);
  const deviationMagnitude = round(Math.abs(f2 - meanScore));
  const isDeviant = deviationMagnitude > 0.3 || truthDirectionScore < -0.2;

  return {
    claim,
    truthDirectionScore,
    crossClaimConsistency: round(crossClaimConsistency),
    deviationMagnitude,
    isDeviant,
  };
}

function computeCrossClaimConsistency(
  claim: string,
  allClaims: string[],
  priorOutputs: string[]
): number {
  let consistentPairs = 0;
  let totalPairs = 0;

  const allTexts = [...allClaims, ...priorOutputs];
  for (const other of allTexts) {
    if (other === claim) continue;
    // Use Dice coefficient to check topical overlap
    const similarity = compareTwoStrings(claim.toLowerCase(), other.toLowerCase());
    if (similarity < 0.15) continue; // unrelated texts, skip

    totalPairs++;
    // Check if both are asserting compatible things
    const claimNeg = /\b(?:not|no|don't|doesn't|isn't|aren't|never|without)\b/i.test(claim);
    const otherNeg = /\b(?:not|no|don't|doesn't|isn't|aren't|never|without)\b/i.test(other);

    if (claimNeg === otherNeg) {
      consistentPairs++;
    } else {
      // Deeper check: high similarity + opposing polarity = real contradiction
      if (similarity > 0.4) {
        // Real contradiction — don't count as consistent
      } else {
        consistentPairs += 0.7; // Different topics, less concerning
      }
    }
  }

  return totalPairs > 0 ? consistentPairs / totalPairs : 0.8;
}

// ─── Inter-Claim Consistency ───

function computeInterClaimConsistency(claims: TruthDirectionClaim[]): number {
  if (claims.length <= 1) return 1.0;

  const scores = claims.map(c => c.truthDirectionScore);
  const mean = avg(scores);
  const deviations = scores.map(s => Math.abs(s - mean));
  const avgDeviation = avg(deviations);

  // Low deviation = high consistency
  return Math.max(0, 1 - avgDeviation * 2);
}

// ─── Warning Generation ───

function generateWarnings(
  claims: TruthDirectionClaim[],
  overall: number,
  consistency: number
): string[] {
  const warnings: string[] = [];

  if (overall < 0.4) {
    warnings.push("Overall truth direction alignment is low — output may contain hallucinations.");
  }

  const deviantCount = claims.filter(c => c.isDeviant).length;
  if (deviantCount > 0) {
    warnings.push(
      `${deviantCount} claim(s) deviate significantly from the detected truth direction.`
    );
  }

  if (consistency < 0.5) {
    warnings.push(
      "Low inter-claim consistency suggests the model is not maintaining a coherent truth direction."
    );
  }

  const negativeClaims = claims.filter(c => c.truthDirectionScore < 0);
  if (negativeClaims.length > claims.length * 0.3) {
    warnings.push(
      "Multiple claims project negatively onto the truth direction — high hallucination risk."
    );
  }

  return warnings;
}

// ─── Utilities ───

function avg(values: number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function computeVariance(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = avg(values);
  return avg(values.map(v => (v - mean) ** 2));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
