import type {
  NCBResult,
  NCBPerturbation,
} from "../state/types.js";

/**
 * Neighbor-Consistency Belief (NCB) — inspired by
 * "Illusions of Confidence? Diagnosing LLM Truthfulness via Neighborhood Consistency".
 *
 * Instead of checking a single answer, NCB evaluates how robust a model's "belief" is
 * when its internal knowledge is perturbed or viewed from different logical angles.
 *
 * The conceptual neighborhood includes:
 *   1. Paraphrases — same meaning, different wording
 *   2. Implications — logical consequences of the stated claim
 *   3. Negations — opposite of the claim
 *   4. Thematic shifts — related but different topic angles
 *   5. Specificity changes — more specific or more general restatements
 *
 * High NCB score = genuine knowledge (robust across perturbations)
 * Low NCB score = brittle surface pattern (breaks under perturbation)
 */

// ─── Core API ───

/**
 * Measure Neighbor-Consistency Belief for a response.
 * Generates perturbations and evaluates consistency across the conceptual neighborhood.
 */
export function checkNeighborhoodConsistency(
  originalQuery: string,
  response: string,
  knownFacts: string[] = []
): NCBResult {
  const perturbations = generatePerturbations(originalQuery, response);
  const evaluatedPerturbations = perturbations.map(p =>
    evaluatePerturbation(p, response, knownFacts)
  );

  const ncbScore = computeNCBScore(evaluatedPerturbations);
  const { brittleAreas, robustAreas } = identifyAreas(evaluatedPerturbations, response);

  const coherentCount = evaluatedPerturbations.filter(p => p.isCoherent).length;
  const totalCount = evaluatedPerturbations.length;

  let verdict: "robust" | "brittle" | "mixed";
  if (ncbScore >= 0.7) {
    verdict = "robust";
  } else if (ncbScore <= 0.4) {
    verdict = "brittle";
  } else {
    verdict = "mixed";
  }

  const genuineKnowledgeConfidence = computeGenuineKnowledgeConfidence(
    ncbScore, evaluatedPerturbations
  );

  const recommendations = generateRecommendations(
    verdict, brittleAreas, ncbScore, evaluatedPerturbations
  );

  return {
    originalResponse: response,
    ncbScore: round(ncbScore),
    perturbations: evaluatedPerturbations,
    brittleAreas,
    robustAreas,
    verdict,
    genuineKnowledgeConfidence: round(genuineKnowledgeConfidence),
    recommendations,
  };
}

// ─── Perturbation Generation ───

function generatePerturbations(query: string, response: string): NCBPerturbation[] {
  const perturbations: NCBPerturbation[] = [];

  // 1. Paraphrase: rephrase the query
  perturbations.push({
    type: "paraphrase",
    perturbedText: generateParaphrase(query),
    expectedConsistency: "high",
    actualConsistency: 0,
    isCoherent: false,
  });

  // 2. Implication: what logically follows from the response
  perturbations.push({
    type: "implication",
    perturbedText: generateImplication(response),
    expectedConsistency: "high",
    actualConsistency: 0,
    isCoherent: false,
  });

  // 3. Negation: opposite of the query
  perturbations.push({
    type: "negation",
    perturbedText: generateNegation(query),
    expectedConsistency: "low",
    actualConsistency: 0,
    isCoherent: false,
  });

  // 4. Thematic shift: related but different angle
  perturbations.push({
    type: "thematic_shift",
    perturbedText: generateThematicShift(query),
    expectedConsistency: "medium",
    actualConsistency: 0,
    isCoherent: false,
  });

  // 5. Specificity change: more specific version
  perturbations.push({
    type: "specificity_change",
    perturbedText: generateSpecificityChange(query),
    expectedConsistency: "medium",
    actualConsistency: 0,
    isCoherent: false,
  });

  return perturbations;
}

function generateParaphrase(query: string): string {
  // Apply systematic word substitutions to create a paraphrase
  const substitutions: [RegExp, string][] = [
    [/\bwhat is\b/gi, "describe"],
    [/\bdescribe\b/gi, "explain"],
    [/\bexplain\b/gi, "what is"],
    [/\bhow does\b/gi, "in what way does"],
    [/\bwhy does\b/gi, "what causes"],
    [/\bwhen\b/gi, "at what point"],
    [/\busing\b/gi, "utilizing"],
    [/\bimplement\b/gi, "build"],
    [/\bcreate\b/gi, "construct"],
    [/\bshould\b/gi, "is it recommended to"],
  ];

  let paraphrased = query;
  for (const [pattern, replacement] of substitutions) {
    const before = paraphrased;
    paraphrased = paraphrased.replace(pattern, replacement);
    if (paraphrased !== before) break; // Apply at most one substitution
  }

  if (paraphrased === query) {
    paraphrased = `Rephrase: ${query}`;
  }

  return paraphrased;
}

function generateImplication(response: string): string {
  const sentences = response.split(/(?<=[.!?])\s+/).filter(s => s.length > 10);
  if (sentences.length === 0) return `If the above is true, then what follows?`;

  const firstClaim = sentences[0];
  // Generate a logical implication of the first claim
  const words = firstClaim.split(/\s+/);
  if (words.length > 5) {
    return `Given that ${firstClaim.replace(/\.$/, "")}, what are the implications?`;
  }
  return `If ${firstClaim.replace(/\.$/, "")}, then what follows?`;
}

function generateNegation(query: string): string {
  const negated = query
    .replace(/\bis\b/gi, "is not")
    .replace(/\bare\b/gi, "are not")
    .replace(/\bcan\b/gi, "cannot")
    .replace(/\bshould\b/gi, "should not")
    .replace(/\bwill\b/gi, "will not")
    .replace(/\bdoes\b/gi, "does not");

  if (negated === query) {
    return `What if the opposite of "${query}" were true?`;
  }
  return negated;
}

function generateThematicShift(query: string): string {
  const topics = extractTopics(query);
  if (topics.length > 0) {
    return `How does ${topics[0]} relate to adjacent concepts in this domain?`;
  }
  return `From a different perspective: ${query}`;
}

function generateSpecificityChange(query: string): string {
  const topics = extractTopics(query);
  if (topics.length > 0) {
    return `Specifically regarding ${topics[0]}, what are the exact details and constraints?`;
  }
  return `In precise terms: ${query}`;
}

// ─── Perturbation Evaluation ───

function evaluatePerturbation(
  perturbation: NCBPerturbation,
  response: string,
  knownFacts: string[]
): NCBPerturbation {
  const consistency = computeConsistencyScore(perturbation, response, knownFacts);

  let isCoherent: boolean;
  switch (perturbation.expectedConsistency) {
    case "high":
      isCoherent = consistency >= 0.5;
      break;
    case "low":
      // For negation, we expect LOW consistency — if response is robust,
      // the negated version should clearly not match
      isCoherent = consistency <= 0.5;
      break;
    case "medium":
    default:
      isCoherent = consistency >= 0.3 && consistency <= 0.9;
      break;
  }

  return {
    ...perturbation,
    actualConsistency: round(consistency),
    isCoherent,
  };
}

function computeConsistencyScore(
  perturbation: NCBPerturbation,
  response: string,
  knownFacts: string[]
): number {
  const responseTokens = new Set(tokenize(response));
  const perturbedTokens = tokenize(perturbation.perturbedText);

  // Token overlap between perturbation and response
  const overlap = perturbedTokens.filter(t => responseTokens.has(t)).length;
  const overlapRatio = perturbedTokens.length > 0
    ? overlap / perturbedTokens.length
    : 0;

  // Fact alignment: do known facts support consistency?
  let factSupport = 0.5;
  if (knownFacts.length > 0) {
    const responseLower = response.toLowerCase();
    const supportedFacts = knownFacts.filter(f =>
      f.toLowerCase().split(/\s+/).some(w => w.length > 3 && responseLower.includes(w))
    );
    factSupport = supportedFacts.length / knownFacts.length;
  }

  // Semantic similarity via token jaccard
  const perturbedSet = new Set(perturbedTokens);
  const union = new Set([...responseTokens, ...perturbedSet]);
  const intersection = [...responseTokens].filter(t => perturbedSet.has(t));
  const jaccard = union.size > 0 ? intersection.length / union.size : 0;

  // Composition based on perturbation type
  switch (perturbation.type) {
    case "paraphrase":
      return 0.4 * overlapRatio + 0.3 * jaccard + 0.3 * factSupport;
    case "implication":
      return 0.3 * overlapRatio + 0.4 * factSupport + 0.3 * jaccard;
    case "negation":
      // For negation, high overlap is BAD (means response doesn't distinguish)
      return overlapRatio;
    case "thematic_shift":
      return 0.5 * jaccard + 0.5 * factSupport;
    case "specificity_change":
      return 0.4 * overlapRatio + 0.3 * jaccard + 0.3 * factSupport;
    default:
      return 0.33 * overlapRatio + 0.33 * jaccard + 0.34 * factSupport;
  }
}

// ─── Area Identification ───

function identifyAreas(
  perturbations: NCBPerturbation[],
  response: string
): { brittleAreas: string[]; robustAreas: string[] } {
  const brittleAreas: string[] = [];
  const robustAreas: string[] = [];

  const sentences = response.split(/(?<=[.!?])\s+/).filter(s => s.length > 10);
  const topics = extractTopics(response);

  for (const p of perturbations) {
    const topicStr = topics.length > 0 ? topics[0] : "general content";
    if (!p.isCoherent) {
      brittleAreas.push(
        `Response under ${p.type} perturbation: expected ${p.expectedConsistency} consistency but got ${p.actualConsistency.toFixed(2)}`
      );
    } else {
      robustAreas.push(
        `Response robust under ${p.type}: consistency ${p.actualConsistency.toFixed(2)}`
      );
    }
  }

  return {
    brittleAreas: [...new Set(brittleAreas)],
    robustAreas: [...new Set(robustAreas)],
  };
}

// ─── NCB Score Computation ───

function computeNCBScore(perturbations: NCBPerturbation[]): number {
  if (perturbations.length === 0) return 1.0;

  const coherentCount = perturbations.filter(p => p.isCoherent).length;
  const baseScore = coherentCount / perturbations.length;

  // Weight by perturbation type importance
  const typeWeights: Record<string, number> = {
    paraphrase: 1.5,     // Most important: paraphrase should be consistent
    implication: 1.2,     // Logical implications should hold
    negation: 1.3,        // Must distinguish true from false
    thematic_shift: 0.8,  // Less critical
    specificity_change: 1.0,
  };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const p of perturbations) {
    const weight = typeWeights[p.type] ?? 1.0;
    weightedSum += (p.isCoherent ? 1 : 0) * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : baseScore;
}

// ─── Genuine Knowledge Confidence ───

function computeGenuineKnowledgeConfidence(
  ncbScore: number,
  perturbations: NCBPerturbation[]
): number {
  // High NCB + correct negation handling = genuine knowledge
  const negation = perturbations.find(p => p.type === "negation");
  const paraphrase = perturbations.find(p => p.type === "paraphrase");

  let boost = 0;
  if (negation?.isCoherent) boost += 0.1; // Correctly handled negation
  if (paraphrase?.isCoherent) boost += 0.1; // Stable under paraphrase

  return Math.min(1, ncbScore + boost);
}

// ─── Recommendation Generation ───

function generateRecommendations(
  verdict: string,
  brittleAreas: string[],
  ncbScore: number,
  perturbations: NCBPerturbation[]
): string[] {
  const recs: string[] = [];

  if (verdict === "brittle") {
    recs.push(
      "Response appears to be based on surface patterns rather than genuine knowledge. Consider requesting explicit evidence or sources."
    );
  }

  if (verdict === "mixed") {
    recs.push(
      "Response shows inconsistent knowledge — some aspects are robust while others are brittle. Verify the brittle areas with ground truth."
    );
  }

  const failedParaphrase = perturbations.find(
    p => p.type === "paraphrase" && !p.isCoherent
  );
  if (failedParaphrase) {
    recs.push(
      "Response is not stable under paraphrase — the same question worded differently may yield contradictory answers."
    );
  }

  const failedNegation = perturbations.find(
    p => p.type === "negation" && !p.isCoherent
  );
  if (failedNegation) {
    recs.push(
      "Response does not properly distinguish the original claim from its negation — hallucination risk."
    );
  }

  if (ncbScore < 0.3) {
    recs.push(
      "Very low NCB score. The model likely lacks genuine understanding of this topic. Request human verification."
    );
  }

  if (recs.length === 0) {
    recs.push("Response appears to reflect genuine knowledge with consistent beliefs across the conceptual neighborhood.");
  }

  return recs;
}

// ─── Utilities ───

function extractTopics(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "this", "that", "these",
    "those", "it", "its", "and", "or", "but", "not", "no", "with",
    "from", "for", "to", "of", "in", "on", "at", "by", "as", "what",
    "how", "why", "when", "where", "which", "who", "whom",
  ]);

  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w));
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
