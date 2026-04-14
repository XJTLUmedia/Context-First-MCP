import type {
  NCBResult,
  NCBPerturbation,
} from "../state/types.js";
import {
  splitSentences,
  tfidfCosineSimilarity,
  extractNouns,
  paraphraseText,
  extractEntities,
  compareTwoStrings,
} from "./nlp-utils.js";

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

  const ncbScore = computeNCBScore(evaluatedPerturbations, knownFacts, response);
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
    // Use NLP-based paraphrasing instead of a prompt string
    paraphrased = paraphraseText(query);
  }

  // If still unchanged, apply a structural transformation
  if (paraphrased === query) {
    const sentences = splitSentences(query);
    if (sentences.length > 1) {
      paraphrased = sentences.reverse().join(" ");
    } else {
      // Last resort: prepend topic framing
      const nouns = extractNouns(query);
      paraphrased = nouns.length > 0
        ? `Regarding ${nouns[0]}, ${query.charAt(0).toLowerCase()}${query.slice(1)}`
        : query;
    }
  }

  return paraphrased;
}

function generateImplication(response: string): string {
  const sentences = splitSentences(response);
  if (sentences.length === 0) return response;

  // Pick the most assertive sentence (first claim)
  const firstClaim = sentences[0];
  const nouns = extractNouns(firstClaim);

  if (nouns.length >= 2) {
    // Construct a logical implication: "If [noun1], then [noun2] follows"
    return `If ${nouns[0]} holds, then ${nouns.slice(1).join(" and ")} would follow from the stated reasoning.`;
  }
  if (nouns.length === 1) {
    return `The presence of ${nouns[0]} implies related downstream effects in this context.`;
  }
  // Fallback: Extract the core assertion and restate as consequence
  const core = firstClaim.replace(/\.$/, "");
  return `As a consequence of the above, ${core.charAt(0).toLowerCase()}${core.slice(1)}.`;
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
  const nouns = extractNouns(query);
  const entities = extractEntities(query);
  const allEntities = [...entities.people, ...entities.places, ...entities.organizations];

  if (allEntities.length > 0 && nouns.length > 0) {
    // Shift from entity focus to broader topic
    return `The role of ${nouns[0]} in the broader context beyond ${allEntities[0]}.`;
  }
  if (nouns.length >= 2) {
    // Shift focus from first noun to second noun
    return `Considering ${nouns[1]} rather than ${nouns[0]} as the primary factor in this context.`;
  }
  if (nouns.length === 1) {
    return `The broader context surrounding ${nouns[0]} and its adjacent domains.`;
  }
  return `From a different perspective: ${query}`;
}

function generateSpecificityChange(query: string): string {
  const nouns = extractNouns(query);
  const entities = extractEntities(query);
  const allEntities = [...entities.people, ...entities.places, ...entities.organizations];

  if (nouns.length > 0 && allEntities.length > 0) {
    // Make more specific by combining topic with entity
    return `The specific constraints and measurable details of ${nouns[0]} as it applies to ${allEntities[0]}.`;
  }
  if (nouns.length >= 2) {
    // Narrow scope to the intersection of two topics
    return `The precise relationship between ${nouns[0]} and ${nouns[1]}, including quantitative boundaries and defined constraints.`;
  }
  if (nouns.length === 1) {
    return `The exact parameters, defined boundaries, and measurable criteria of ${nouns[0]}.`;
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
  // Blend TF-IDF (good for long text) with Dice coefficient (good for short text)
  const tfidfSim = tfidfCosineSimilarity(perturbation.perturbedText, response);
  const diceSim = compareTwoStrings(
    perturbation.perturbedText.toLowerCase(),
    response.toLowerCase()
  );
  const textSim = 0.6 * tfidfSim + 0.4 * diceSim;

  // Fact alignment: do known facts support consistency?
  let factSupport = 0.3; // Lower default — absence of facts is a penalty
  if (knownFacts.length > 0) {
    const factSims = knownFacts.map(f => {
      const ftfidf = tfidfCosineSimilarity(f, response);
      const fdice = compareTwoStrings(f.toLowerCase(), response.toLowerCase());
      return 0.5 * ftfidf + 0.5 * fdice;
    });
    factSupport = factSims.reduce((a, b) => a + b, 0) / knownFacts.length;
  }

  // Composition based on perturbation type
  switch (perturbation.type) {
    case "paraphrase":
      return 0.6 * textSim + 0.4 * factSupport;
    case "implication":
      return 0.4 * textSim + 0.6 * factSupport;
    case "negation":
      // For negation, high similarity is BAD (means response doesn't distinguish)
      return textSim;
    case "thematic_shift":
      return 0.5 * textSim + 0.5 * factSupport;
    case "specificity_change":
      return 0.5 * textSim + 0.5 * factSupport;
    default:
      return 0.5 * textSim + 0.5 * factSupport;
  }
}

// ─── Area Identification ───

function identifyAreas(
  perturbations: NCBPerturbation[],
  response: string
): { brittleAreas: string[]; robustAreas: string[] } {
  const brittleAreas: string[] = [];
  const robustAreas: string[] = [];

  const sentences = splitSentences(response).filter(s => s.length > 10);
  const topics = extractNouns(response);

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

function computeNCBScore(
  perturbations: NCBPerturbation[],
  knownFacts: string[],
  response: string
): number {
  if (perturbations.length === 0) return 1.0;

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
    // Use continuous score: how well did the perturbation meet expectations?
    let score: number;
    if (p.expectedConsistency === "high") {
      score = p.actualConsistency; // Higher is better
    } else if (p.expectedConsistency === "low") {
      score = 1 - p.actualConsistency; // Lower consistency is better for negations
    } else {
      // Medium: penalize extremes
      score = 1 - Math.abs(p.actualConsistency - 0.5) * 2;
    }
    weightedSum += score * weight;
    totalWeight += weight;
  }

  let base = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

  // Fact-grounding bonus: responses backed by known facts are more trustworthy
  if (knownFacts.length > 0) {
    const factSims = knownFacts.map(f => {
      const tSim = tfidfCosineSimilarity(f, response);
      const dSim = compareTwoStrings(f.toLowerCase(), response.toLowerCase());
      return 0.5 * tSim + 0.5 * dSim;
    });
    const avgFactSim = factSims.reduce((a, b) => a + b, 0) / factSims.length;
    base += avgFactSim * 0.2; // Up to +0.2 for strong fact grounding
  }

  return Math.max(0, Math.min(1, base));
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

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
