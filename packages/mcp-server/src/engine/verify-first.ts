import type { VerifyFirstResult, VerificationCheck } from "../state/types.js";

/**
 * Verify-First Strategy — inspired by
 * "Chain-of-Verification Reduces Hallucination in Large Language Models" (CoVe, Meta 2023).
 *
 * Instead of directly committing to an answer, this engine:
 *   1. Generates verification questions about the candidate answer
 *   2. Evaluates each question across 5 dimensions
 *   3. Computes a composite verification score
 *   4. Recommends accept/revise/reject based on verification outcome
 *
 * The 5 verification dimensions:
 *   - Factual grounding: Can the claim be traced to known facts?
 *   - Internal consistency: Does the answer contradict itself?
 *   - Completeness: Does the answer address all parts of the question?
 *   - Specificity: Are claims specific enough to be verifiable?
 *   - Source coherence: Do cited/implied sources exist and agree?
 */

// ─── Verification Question Templates ───

const VERIFICATION_TEMPLATES = [
  {
    dimension: "factual_grounding" as const,
    template: (claim: string) => `Can "${truncate(claim)}" be verified against known facts?`,
  },
  {
    dimension: "internal_consistency" as const,
    template: (claim: string) => `Does "${truncate(claim)}" contradict any other part of the response?`,
  },
  {
    dimension: "completeness" as const,
    template: (claim: string) => `Does "${truncate(claim)}" fully address the relevant aspects?`,
  },
  {
    dimension: "specificity" as const,
    template: (claim: string) => `Is "${truncate(claim)}" specific enough to be independently verified?`,
  },
  {
    dimension: "source_coherence" as const,
    template: (claim: string) => `Do the sources or evidence implied by "${truncate(claim)}" appear coherent?`,
  },
];

// ─── Pattern Banks ───

const SPECIFIC_PATTERNS = [
  /\b\d{4}\b/,                  // years
  /\b\d+\.?\d*\s*%/,            // percentages
  /\b\d+\.?\d*\s*(?:km|mi|m|ft|kg|lb|GB|MB|TB)\b/i, // measurements
  /\b(?:Dr\.|Prof\.|Mr\.|Mrs\.)\s+\w+/i,  // named persons
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/,   // proper nouns
  /\b(?:https?:\/\/|www\.)\S+/i,            // URLs
  /\b(?:ISBN|DOI|arXiv)\s*[:.]?\s*\S+/i,   // identifiers
];

const SOURCE_PATTERNS = [
  /\b(?:according to|based on|as (?:stated|described|reported) (?:in|by))\b/i,
  /\b(?:research|study|paper|article|survey|report|analysis)\s+(?:by|from|in|published)\b/i,
  /\b(?:source|reference|citation|footnote)\b/i,
];

const HEDGE_PATTERNS = [
  /\b(?:maybe|perhaps|possibly|probably|might|could|appears|seems)\b/i,
  /\b(?:I think|I believe|it's thought|generally|typically|often)\b/i,
  /\b(?:some|most|many|few|approximately|roughly|about)\b/i,
];

const STRONG_CLAIM_PATTERNS = [
  /\b(?:always|never|every|all|none|no one|everyone|definitely|certainly|absolutely)\b/i,
  /\b(?:proven|guaranteed|impossible|must|shall)\b/i,
];

// ─── Core API ───

/**
 * Apply verification-first strategy to a candidate answer.
 * Evaluates across 5 dimensions before recommending acceptance.
 */
export function verifyFirst(
  candidateAnswer: string,
  question: string,
  context: string[] = [],
  knownFacts: string[] = []
): VerifyFirstResult {
  const claims = extractVerifiableClaims(candidateAnswer);

  if (claims.length === 0) {
    return {
      candidateAnswer,
      verificationScore: 0.5,
      checks: [],
      shouldAccept: false,
      suggestedImprovements: ["No verifiable claims detected. Answer may be too vague."],
      fixEffort: "medium",
      alternativeFramings: [],
      verificationCheaperThanRegeneration: true,
    };
  }

  // Run internal per-claim checks
  const claimChecks: ClaimCheckResult[] = claims.map(claim =>
    runClaimCheck(claim, question, context, knownFacts, candidateAnswer)
  );

  // Compute dimension scores (average across all claims)
  const dimensionScores = computeDimensionScores(claimChecks);

  // Overall verification score
  const verificationScore = round(
    0.25 * dimensionScores.factualGrounding +
    0.25 * dimensionScores.internalConsistency +
    0.20 * dimensionScores.completeness +
    0.15 * dimensionScores.specificity +
    0.15 * dimensionScores.sourceCoherence
  );

  // Convert to per-dimension VerificationCheck objects
  const dimensionMap: Array<{ dimension: VerificationCheck["dimension"]; key: keyof DimensionScores }> = [
    { dimension: "factual_support", key: "factualGrounding" },
    { dimension: "internal_coherence", key: "internalConsistency" },
    { dimension: "completeness", key: "completeness" },
    { dimension: "specificity", key: "specificity" },
    { dimension: "relevance", key: "sourceCoherence" },
  ];

  const checks: VerificationCheck[] = dimensionMap.map(({ dimension, key }) => {
    const score = round(dimensionScores[key]);
    const issues: string[] = [];
    for (const c of claimChecks) {
      if (c[key] < 0.5) {
        issues.push(`Claim "${truncate(c.claim, 50)}" scored ${round(c[key])} on ${dimension}`);
      }
    }
    return { dimension, score, issues, passes: score >= 0.5 };
  });

  const shouldAccept = verificationScore >= 0.75;

  // Generate improvement suggestions
  const suggestedImprovements = generateImprovements(claimChecks, dimensionScores);

  const fixEffort: VerifyFirstResult["fixEffort"] =
    verificationScore >= 0.6 ? "low" :
    verificationScore >= 0.4 ? "medium" : "high";

  return {
    candidateAnswer,
    verificationScore,
    checks,
    shouldAccept,
    suggestedImprovements,
    fixEffort,
    alternativeFramings: [],
    verificationCheaperThanRegeneration: true,
  };
}

// ─── Claim Extraction ───

function extractVerifiableClaims(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  return sentences.filter(s => {
    if (s.endsWith("?")) return false;
    // Must be declarative
    return /\b(?:is|are|was|were|has|have|had|will|does|do|can)\b/i.test(s);
  });
}

// ─── Internal Types ───

interface ClaimCheckResult {
  claim: string;
  factualGrounding: number;
  internalConsistency: number;
  completeness: number;
  specificity: number;
  sourceCoherence: number;
  passed: boolean;
}

// ─── Verification Checks ───

function runClaimCheck(
  claim: string,
  question: string,
  context: string[],
  knownFacts: string[],
  fullAnswer: string
): ClaimCheckResult {
  const factualGrounding = checkFactualGrounding(claim, knownFacts, context);
  const internalConsistency = checkInternalConsistency(claim, fullAnswer);
  const completeness = checkCompleteness(claim, question);
  const specificity = checkSpecificity(claim);
  const sourceCoherence = checkSourceCoherence(claim);

  const passed = (factualGrounding + internalConsistency + completeness +
                  specificity + sourceCoherence) / 5 >= 0.5;

  return {
    claim,
    factualGrounding: round(factualGrounding),
    internalConsistency: round(internalConsistency),
    completeness: round(completeness),
    specificity: round(specificity),
    sourceCoherence: round(sourceCoherence),
    passed,
  };
}

function checkFactualGrounding(
  claim: string,
  knownFacts: string[],
  context: string[]
): number {
  const claimTokens = tokenize(claim);
  let maxAlignment = 0;

  const sources = [...knownFacts, ...context];
  for (const source of sources) {
    const sourceTokens = new Set(tokenize(source));
    const overlap = claimTokens.filter(t => sourceTokens.has(t)).length;
    const alignment = claimTokens.length > 0 ? overlap / claimTokens.length : 0;
    maxAlignment = Math.max(maxAlignment, alignment);
  }

  // Bonus for specific claims (specificity indicates groundedness)
  const specificBonus = SPECIFIC_PATTERNS.some(p => p.test(claim)) ? 0.1 : 0;

  return sources.length === 0 ? 0.3 : Math.min(1, maxAlignment + specificBonus);
}

function checkInternalConsistency(claim: string, fullAnswer: string): number {
  const otherSentences = fullAnswer
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim() !== claim && s.length > 10);

  if (otherSentences.length === 0) return 1.0;

  const claimNeg = /\b(?:not|no|don't|doesn't|isn't|aren't|never|without)\b/i.test(claim);
  const claimTopics = extractTopicWords(claim);

  for (const other of otherSentences) {
    const otherNeg = /\b(?:not|no|don't|doesn't|isn't|aren't|never|without)\b/i.test(other);
    const otherTopics = extractTopicWords(other);
    const shared = claimTopics.filter(t => otherTopics.includes(t));

    if (shared.length >= 2 && claimNeg !== otherNeg) {
      // Potential contradiction
      return 0.2;
    }
  }

  return 0.9;
}

function checkCompleteness(claim: string, question: string): number {
  const questionTopics = extractTopicWords(question);
  if (questionTopics.length === 0) return 0.5;

  const claimTokens = new Set(tokenize(claim));
  const addressed = questionTopics.filter(t => claimTokens.has(t)).length;
  return questionTopics.length > 0 ? addressed / questionTopics.length : 0.5;
}

function checkSpecificity(claim: string): number {
  let specificityScore = 0.3; // baseline

  // Check for specific patterns
  for (const pattern of SPECIFIC_PATTERNS) {
    if (pattern.test(claim)) specificityScore += 0.15;
  }

  // Penalize hedging
  for (const pattern of HEDGE_PATTERNS) {
    if (pattern.test(claim)) specificityScore -= 0.1;
  }

  // Bonus for strong claims (they're at least specific, even if risky)
  for (const pattern of STRONG_CLAIM_PATTERNS) {
    if (pattern.test(claim)) specificityScore += 0.05;
  }

  // Longer claims tend to be more specific
  const words = claim.split(/\s+/).length;
  if (words > 15) specificityScore += 0.1;
  if (words > 25) specificityScore += 0.1;

  return Math.max(0, Math.min(1, specificityScore));
}

function checkSourceCoherence(claim: string): number {
  let score = 0.5; // neutral

  const hasSourceAttribution = SOURCE_PATTERNS.some(p => p.test(claim));
  if (hasSourceAttribution) {
    score += 0.3;
    // Check if source seems real (has proper noun structure)
    if (/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(claim)) {
      score += 0.1;
    }
    // Has year reference
    if (/\b(?:19|20)\d{2}\b/.test(claim)) {
      score += 0.1;
    }
  }

  return Math.min(1, score);
}

// ─── Dimension Score Aggregation ───

interface DimensionScores {
  factualGrounding: number;
  internalConsistency: number;
  completeness: number;
  specificity: number;
  sourceCoherence: number;
}

function computeDimensionScores(checks: ClaimCheckResult[]): DimensionScores {
  if (checks.length === 0) {
    return {
      factualGrounding: 0.5,
      internalConsistency: 1.0,
      completeness: 0.5,
      specificity: 0,
      sourceCoherence: 0.5,
    };
  }

  return {
    factualGrounding: avg(checks.map(c => c.factualGrounding)),
    internalConsistency: avg(checks.map(c => c.internalConsistency)),
    completeness: avg(checks.map(c => c.completeness)),
    specificity: avg(checks.map(c => c.specificity)),
    sourceCoherence: avg(checks.map(c => c.sourceCoherence)),
  };
}

// ─── Improvement Generation ───

function generateImprovements(
  checks: ClaimCheckResult[],
  scores: DimensionScores
): string[] {
  const improvements: string[] = [];

  if (scores.factualGrounding < 0.5) {
    improvements.push("Add factual evidence or citations to ground claims.");
  }
  if (scores.internalConsistency < 0.7) {
    improvements.push("Resolve internal contradictions between claims.");
  }
  if (scores.completeness < 0.5) {
    improvements.push("Ensure all aspects of the question are addressed.");
  }
  if (scores.specificity < 0.4) {
    improvements.push("Make claims more specific and verifiable with concrete details.");
  }
  if (scores.sourceCoherence < 0.5) {
    improvements.push("Verify cited sources and ensure proper attribution.");
  }

  const failedClaims = checks.filter(c => !c.passed);
  if (failedClaims.length > 0) {
    improvements.push(
      `${failedClaims.length} claim(s) failed verification. Review: ${
        failedClaims.map(c => `"${truncate(c.claim, 50)}"`).join(", ")
      }`
    );
  }

  return improvements;
}

// ─── Utilities ───

function extractTopicWords(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "this", "that", "these",
    "those", "it", "its", "and", "or", "but", "not", "no", "with",
    "from", "for", "to", "of", "in", "on", "at", "by", "as",
  ]);
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !stopWords.has(w));
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
}

function avg(values: number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function truncate(text: string, maxLen = 60): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
