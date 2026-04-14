import type { MindEvolutionResult, EvolutionCandidate } from "../state/types.js";
import { compareTwoStrings } from "string-similarity";
import { splitSentences, tfidfCosineSimilarity, extractNouns, paraphraseText, removeFillers } from "./nlp-utils.js";

/**
 * Mind Evolution — Evolutionary Search for Reasoning Depth (2025)
 *
 * Introduces an evolutionary search strategy for test-time scaling.
 * Treats reasoning as an evolutionary process where the model generates,
 * recombines, and refines candidate responses across turns.
 *
 * This allows "broader" exploration of the solution space compared to
 * standard sequential revision, solving complex planning tasks with
 * high accuracy (over 98% in some benchmarks) within standard context.
 *
 * Key mechanics:
 *   - Population: Initial diverse set of candidate solutions
 *   - Fitness evaluation: Score each candidate against problem criteria
 *   - Selection: Keep top-performing candidates
 *   - Crossover: Recombine strong candidates to create offspring
 *   - Mutation/Refinement: Apply targeted improvements
 *   - Convergence: Stop when fitness plateaus or generation limit reached
 */

const DEFAULT_POPULATION_SIZE = 6;
const DEFAULT_MAX_GENERATIONS = 5;
const DEFAULT_SELECTION_RATIO = 0.5; // Keep top 50%
const DEFAULT_CROSSOVER_RATE = 0.6;
const DEFAULT_MUTATION_RATE = 0.3;
const CONVERGENCE_DELTA = 0.02;

export interface MindEvolutionInput {
  /** The problem to solve through evolutionary search */
  problem: string;
  /** Evaluation criteria for fitness scoring */
  criteria?: string[];
  /** Initial population size */
  populationSize?: number;
  /** Maximum number of generations */
  maxGenerations?: number;
  /** Selection ratio: fraction of population that survives */
  selectionRatio?: number;
  /** Seed responses — at least 1 required. The LLM generates candidates; this module evolves them. */
  seedResponses: string[];
}

/**
 * Run the Mind Evolution evolutionary search pipeline.
 * Generates, evaluates, recombines, and refines candidate solutions.
 */
export function runMindEvolution(input: MindEvolutionInput): MindEvolutionResult {
  const {
    problem,
    criteria = extractDefaultCriteria(problem),
    populationSize = DEFAULT_POPULATION_SIZE,
    maxGenerations = DEFAULT_MAX_GENERATIONS,
    selectionRatio = DEFAULT_SELECTION_RATIO,
    seedResponses,
  } = input;

  if (seedResponses.length === 0) {
    throw new Error("MindEvolution requires at least 1 seed response. The LLM generates candidates; this module evolves them.");
  }

  let population: EvolutionCandidate[] = [];
  const allCandidates: EvolutionCandidate[] = [];
  const fitnessProgression: number[] = [];
  let idCounter = 0;

  // Generation 0: Initialize population
  population = initializePopulation(
    problem,
    criteria,
    populationSize,
    seedResponses,
    () => `cand-${idCounter++}`
  );
  for (const cand of population) {
    allCandidates.push(cand);
  }
  fitnessProgression.push(Math.max(...population.map(c => c.fitness)));

  let converged = false;

  // Evolutionary loop
  for (let gen = 1; gen < maxGenerations; gen++) {
    // Selection: keep top candidates
    const survivors = selectFittest(population, selectionRatio);

    // Mark non-survivors
    for (const cand of population) {
      cand.survived = survivors.includes(cand);
    }

    // Crossover: recombine survivors to create offspring
    const offspring: EvolutionCandidate[] = [];
    const offspringCount = populationSize - survivors.length;

    for (let i = 0; i < offspringCount; i++) {
      const parent1 = survivors[i % survivors.length];
      const parent2 = survivors[(i + 1) % survivors.length];
      // Deterministic: use crossover for ~60% of offspring (based on index)
      const usesCrossover = (i + gen) % 5 < 3; // 3/5 = 0.6

      if (usesCrossover && parent1 !== parent2) {
        const child = crossover(parent1, parent2, gen, problem, criteria, `cand-${idCounter++}`);
        offspring.push(child);
      } else {
        // Mutation: modify a survivor
        const parent = survivors[i % survivors.length];
        const mutant = mutate(parent, gen, problem, criteria, `cand-${idCounter++}`);
        offspring.push(mutant);
      }
    }

    // Also refine some survivors (deterministic: ~30% based on index)
    for (let si = 0; si < survivors.length; si++) {
      if ((si + gen) % 3 === 0) { // ~1/3 ≈ 0.33
        const refined = refine(survivors[si], gen, problem, criteria, `cand-${idCounter++}`);
        offspring.push(refined);
      }
    }

    // New population: survivors + offspring (capped at populationSize)
    population = [...survivors, ...offspring].slice(0, populationSize);
    for (const cand of offspring) {
      allCandidates.push(cand);
    }

    const bestFitness = Math.max(...population.map(c => c.fitness));
    fitnessProgression.push(round(bestFitness));

    // Check convergence
    if (fitnessProgression.length >= 3) {
      const recent = fitnessProgression.slice(-3);
      const maxDelta = Math.max(
        Math.abs(recent[2] - recent[1]),
        Math.abs(recent[1] - recent[0])
      );
      if (maxDelta < CONVERGENCE_DELTA) {
        converged = true;
        break;
      }
    }
  }

  // Find best candidate
  const bestCandidate = population.reduce((best, cand) =>
    cand.fitness > best.fitness ? cand : best, population[0]);

  // Compute diversity score
  const diversityScore = computeDiversity(population);

  return {
    bestCandidate,
    allCandidates,
    finalAnswer: bestCandidate.response,
    totalGenerations: fitnessProgression.length,
    populationSize,
    fitnessProgression,
    converged,
    diversityScore: round(diversityScore),
    totalEvaluated: allCandidates.length,
  };
}

/**
 * Initialize the first generation of candidate solutions from seed responses.
 * If fewer seeds than population size, creates variations by restructuring existing seeds.
 */
function initializePopulation(
  problem: string,
  criteria: string[],
  size: number,
  seeds: string[],
  genId: () => string
): EvolutionCandidate[] {
  const population: EvolutionCandidate[] = [];

  // Include seed responses
  for (const seed of seeds.slice(0, size)) {
    const fitness = evaluateFitness(seed, problem, criteria);
    population.push({
      id: genId(),
      generation: 0,
      response: seed,
      fitness: round(fitness),
      parentIds: [],
      mutationType: "initial",
      survived: true,
    });
  }

  // Fill remaining slots with variations derived from existing seeds
  let seedIdx = 0;
  while (population.length < size) {
    const baseSeed = seeds[seedIdx % seeds.length];
    const variation = createVariation(baseSeed, problem, seedIdx);
    const fitness = evaluateFitness(variation, problem, criteria);

    population.push({
      id: genId(),
      generation: 0,
      response: variation,
      fitness: round(fitness),
      parentIds: [],
      mutationType: "initial",
      survived: true,
    });
    seedIdx++;
  }

  return population;
}

/**
 * Create a variation of an existing seed by restructuring its content.
 * Uses NLP-aware operations: topic grouping, paraphrasing, filler removal.
 */
function createVariation(seed: string, problem: string, index: number): string {
  const sentences = splitSentences(seed);
  if (sentences.length <= 1) return seed;

  const strategy = index % 4;

  switch (strategy) {
    case 0: {
      // Topic-clustered reorder: group sentences by shared nouns with the problem
      const problemNouns = new Set(extractNouns(problem));
      const relevant: string[] = [];
      const background: string[] = [];
      for (const s of sentences) {
        const sNouns = extractNouns(s);
        const overlap = sNouns.filter(n => problemNouns.has(n)).length;
        if (overlap > 0) relevant.push(s);
        else background.push(s);
      }
      return [...relevant, ...background].join(" ");
    }
    case 1: {
      // Paraphrase: apply synonym substitution + voice change via compromise
      return paraphraseText(seed);
    }
    case 2: {
      // Tighten: remove filler words and low-relevance sentences
      const cleaned = removeFillers(seed);
      const cleanedSentences = splitSentences(cleaned);
      if (cleanedSentences.length <= 2) return cleaned;
      // Drop the sentence least relevant to the problem
      let minSim = Infinity;
      let minIdx = 0;
      for (let i = 0; i < cleanedSentences.length; i++) {
        const sim = tfidfCosineSimilarity(cleanedSentences[i], problem);
        if (sim < minSim) { minSim = sim; minIdx = i; }
      }
      const result = [...cleanedSentences];
      result.splice(minIdx, 1);
      return result.join(" ");
    }
    case 3:
    default: {
      // Emphasis shift: move the most problem-relevant sentence to the front
      let maxSim = -1;
      let maxIdx = 0;
      for (let i = 0; i < sentences.length; i++) {
        const sim = tfidfCosineSimilarity(sentences[i], problem);
        if (sim > maxSim) { maxSim = sim; maxIdx = i; }
      }
      if (maxIdx === 0) return seed;
      const reordered = [sentences[maxIdx], ...sentences.filter((_, i) => i !== maxIdx)];
      return reordered.join(" ");
    }
  }
}

/**
 * Evaluate fitness of a candidate response against problem criteria.
 * Uses TF-IDF cosine similarity for relevance and criteria coverage.
 */
function evaluateFitness(response: string, problem: string, criteria: string[]): number {
  let score = 0;
  let maxScore = 0;

  // Relevance: TF-IDF cosine similarity between problem and response
  const relevanceSim = tfidfCosineSimilarity(problem, response);
  score += relevanceSim * 3;
  maxScore += 3;

  // Depth: longer, more detailed responses score higher (to a point)
  const wordCount = response.split(/\s+/).length;
  score += Math.min(2, wordCount / 50);
  maxScore += 2;

  // Structure: presence of logical structure
  if (/\bstep \d|first|second|third|phase/i.test(response)) score += 1.5;
  maxScore += 1.5;

  // Specificity: concrete details vs vague language
  const specificTerms = (response.match(/\b\d+\.?\d*%?\b/g) || []).length;
  score += Math.min(1.5, specificTerms * 0.5);
  maxScore += 1.5;

  // Criteria coverage via TF-IDF similarity
  for (const criterion of criteria) {
    const criterionSim = tfidfCosineSimilarity(criterion, response);
    score += criterionSim * (2 / criteria.length);
    maxScore += 2 / criteria.length;
  }

  // Logical coherence markers
  if (/\b(?:because|therefore|thus|hence|consequently)\b/i.test(response)) score += 1;
  maxScore += 1;

  // Not too repetitive
  const sentences = splitSentences(response);
  const uniqueStarts = new Set(sentences.map(s => s.trim().split(/\s+/).slice(0, 3).join(" ").toLowerCase()));
  const repetitionPenalty = sentences.length > 0
    ? 1 - (uniqueStarts.size / sentences.length) : 0;
  score -= repetitionPenalty;

  return Math.max(0, Math.min(1, score / maxScore));
}

/**
 * Select the fittest candidates from the population.
 */
function selectFittest(population: EvolutionCandidate[], ratio: number): EvolutionCandidate[] {
  const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
  const keepCount = Math.max(2, Math.ceil(population.length * ratio));
  return sorted.slice(0, keepCount);
}

/**
 * Crossover: combine two parent candidates by selecting the most relevant
 * sentences from each, using TF-IDF similarity to the problem.
 */
function crossover(
  parent1: EvolutionCandidate,
  parent2: EvolutionCandidate,
  generation: number,
  problem: string,
  criteria: string[],
  id: string
): EvolutionCandidate {
  const sentences1 = splitSentences(parent1.response);
  const sentences2 = splitSentences(parent2.response);

  // Score every sentence by relevance to the problem
  const scored: Array<{ text: string; sim: number }> = [];
  for (const s of sentences1) {
    scored.push({ text: s, sim: tfidfCosineSimilarity(s, problem) });
  }
  for (const s of sentences2) {
    // Avoid near-duplicate sentences from the other parent
    const isDupe = scored.some(existing => compareTwoStrings(existing.text.toLowerCase(), s.toLowerCase()) > 0.8);
    if (!isDupe) {
      scored.push({ text: s, sim: tfidfCosineSimilarity(s, problem) });
    }
  }

  // Take the top sentences by relevance, capped at a reasonable length
  scored.sort((a, b) => b.sim - a.sim);
  const targetLen = Math.max(sentences1.length, sentences2.length);
  const selected = scored.slice(0, targetLen).map(s => s.text);

  const response = selected.join(" ");
  const fitness = evaluateFitness(response, problem, criteria);

  return {
    id,
    generation,
    response,
    fitness: round(fitness),
    parentIds: [parent1.id, parent2.id],
    mutationType: "crossover",
    survived: true,
  };
}

/**
 * Mutate: apply an NLP-aware text transformation to a candidate.
 * Uses paraphrasing, filler removal, and relevance-based pruning.
 */
function mutate(
  parent: EvolutionCandidate,
  generation: number,
  problem: string,
  criteria: string[],
  id: string
): EvolutionCandidate {
  const sentences = splitSentences(parent.response);

  let response: string;
  const mutationKind = generation % 3;

  if (sentences.length <= 1) {
    // Single sentence: paraphrase it
    response = paraphraseText(parent.response);
  } else if (mutationKind === 0) {
    // Paraphrase: synonym substitution + voice change via compromise
    response = paraphraseText(parent.response);
  } else if (mutationKind === 1) {
    // Prune: remove the sentence least relevant to the problem
    let minSim = Infinity;
    let minIdx = 0;
    for (let i = 0; i < sentences.length; i++) {
      const sim = tfidfCosineSimilarity(sentences[i], problem);
      if (sim < minSim) { minSim = sim; minIdx = i; }
    }
    const pruned = [...sentences];
    if (pruned.length > 2) pruned.splice(minIdx, 1);
    response = pruned.join(" ");
  } else {
    // Tighten: remove fillers and hedge words
    response = removeFillers(parent.response);
  }

  const fitness = evaluateFitness(response, problem, criteria);

  return {
    id,
    generation,
    response,
    fitness: round(fitness),
    parentIds: [parent.id],
    mutationType: "random",
    survived: true,
  };
}

/**
 * Refine: apply targeted improvement to a high-fitness candidate.
 * Removes redundancy via TF-IDF similarity, tightens prose, removes fillers.
 */
function refine(
  parent: EvolutionCandidate,
  generation: number,
  problem: string,
  criteria: string[],
  id: string
): EvolutionCandidate {
  const sentences = splitSentences(parent.response);

  let response: string;
  if (sentences.length > 2) {
    // Remove the most redundant sentence: highest avg TF-IDF similarity to other sentences
    let maxAvgSim = -1;
    let redundantIdx = 0;
    for (let i = 0; i < sentences.length; i++) {
      let totalSim = 0;
      for (let j = 0; j < sentences.length; j++) {
        if (i === j) continue;
        totalSim += tfidfCosineSimilarity(sentences[i], sentences[j]);
      }
      const avgSim = totalSim / (sentences.length - 1);
      if (avgSim > maxAvgSim) { maxAvgSim = avgSim; redundantIdx = i; }
    }
    const trimmed = [...sentences];
    trimmed.splice(redundantIdx, 1);
    // Also remove fillers from the result
    response = removeFillers(trimmed.join(" "));
  } else {
    // Short text: just remove fillers
    response = removeFillers(parent.response);
  }

  const fitness = evaluateFitness(response, problem, criteria);

  return {
    id,
    generation,
    response,
    fitness: round(fitness),
    parentIds: [parent.id],
    mutationType: "refine",
    survived: true,
  };
}

/**
 * Compute diversity of the current population using pairwise Dice distance.
 * Uses string-similarity's compareTwoStrings (Dice coefficient) for each pair.
 */
function computeDiversity(population: EvolutionCandidate[]): number {
  if (population.length < 2) return 0;

  let totalDistance = 0;
  let pairs = 0;

  for (let i = 0; i < population.length; i++) {
    for (let j = i + 1; j < population.length; j++) {
      const similarity = compareTwoStrings(
        population[i].response.toLowerCase(),
        population[j].response.toLowerCase()
      );
      totalDistance += 1 - similarity;
      pairs++;
    }
  }

  return pairs > 0 ? totalDistance / pairs : 0;
}

/**
 * Extract default evaluation criteria from the problem statement.
 */
function extractDefaultCriteria(problem: string): string[] {
  const criteria: string[] = ["relevance", "correctness", "completeness"];
  const lower = problem.toLowerCase();

  if (lower.includes("plan") || lower.includes("design")) criteria.push("feasibility");
  if (lower.includes("compare") || lower.includes("trade")) criteria.push("balance");
  if (lower.includes("optimize") || lower.includes("efficient")) criteria.push("efficiency");
  if (lower.includes("safe") || lower.includes("risk")) criteria.push("safety");
  if (lower.includes("creative") || lower.includes("novel")) criteria.push("originality");

  return criteria;
}

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen) + "...";
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
