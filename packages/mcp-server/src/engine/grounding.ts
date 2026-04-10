import natural from "natural";
import type { GroundTruthEntry, GroundingResult } from "../state/types.js";

const wordTokenizer = new natural.WordTokenizer();

/**
 * Semantic Grounding Index (SGI) — inspired by arXiv:2602.13224.
 *
 * Measures whether an assistant's output is grounded in the stored ground truth
 * using TF-IDF cosine similarity — no LLM required.
 *
 * Three dimensions:
 *   1. Factual Grounding — do claims align with stored key-value facts?
 *   2. Context Adherence — does the response stay within the topic envelope?
 *   3. Falsifiability — does the response make confident claims that contradict ground truth?
 */

// ─── Core API ───

export function checkGrounding(
  assistantOutput: string,
  groundTruth: Map<string, GroundTruthEntry>,
  claim?: string
): GroundingResult {
  if (groundTruth.size === 0) {
    return {
      isGrounded: true,
      score: 1.0,
      dimensions: {
        factualGrounding: 1.0,
        contextAdherence: 1.0,
        falsifiability: 0.0,
      },
      ungroundedClaims: [],
      suggestions: [],
    };
  }

  const textToCheck = claim || assistantOutput;
  const factualGrounding = computeFactualGrounding(textToCheck, groundTruth);
  const contextAdherence = computeContextAdherence(textToCheck, groundTruth);
  const falsifiability = computeFalsifiability(textToCheck, groundTruth);

  // Composite: high factual grounding + high adherence + low falsifiability = grounded
  const score = round(
    0.4 * factualGrounding.score +
    0.3 * contextAdherence +
    0.3 * (1 - falsifiability.score)
  );

  const ungroundedClaims: string[] = [];
  const suggestions: string[] = [];

  for (const claim of falsifiability.contradictions) {
    ungroundedClaims.push(claim);
  }

  for (const gap of factualGrounding.gaps) {
    suggestions.push(gap);
  }

  if (contextAdherence < 0.3) {
    suggestions.push(
      "Response appears to discuss topics outside the established context. Re-anchor on the user's stated requirements."
    );
  }

  return {
    isGrounded: score >= 0.5 && falsifiability.score < 0.3,
    score,
    dimensions: {
      factualGrounding: round(factualGrounding.score),
      contextAdherence: round(contextAdherence),
      falsifiability: round(falsifiability.score),
    },
    ungroundedClaims,
    suggestions,
  };
}

// ─── Dimension 1: Factual Grounding ───

function computeFactualGrounding(
  text: string,
  groundTruth: Map<string, GroundTruthEntry>
): { score: number; gaps: string[] } {
  const textLower = text.toLowerCase();
  const gaps: string[] = [];
  let groundedCount = 0;
  let checkedCount = 0;

  for (const [key, entry] of groundTruth) {
    const valueStr = String(entry.value).toLowerCase();
    const keyNorm = normalizeKey(key);

    // Check if the text discusses this topic at all
    const mentionsTopic =
      textLower.includes(keyNorm) ||
      keyNorm.split("_").some(part => part.length > 2 && textLower.includes(part));

    if (!mentionsTopic) continue;

    checkedCount++;

    // Use natural WordTokenizer for better token coverage
    const valueTokens = wordTokenizer.tokenize(valueStr) ?? [];
    const matchedTokens = valueTokens.filter(t => textLower.includes(t));
    const alignment = valueTokens.length > 0
      ? matchedTokens.length / valueTokens.length
      : 0;

    if (alignment >= 0.3) {
      groundedCount++;
    } else {
      gaps.push(
        `Mentions "${key}" but content doesn't align with stored value "${entry.value}". Verify before proceeding.`
      );
    }
  }

  const score = checkedCount > 0 ? groundedCount / checkedCount : 1.0;
  return { score, gaps };
}

// ─── Dimension 2: Context Adherence ───

function computeContextAdherence(
  text: string,
  groundTruth: Map<string, GroundTruthEntry>
): number {
  // Build a "context envelope" from all ground truth keys and values
  const contextTokens = new Set<string>();
  for (const [key, entry] of groundTruth) {
    for (const token of (wordTokenizer.tokenize(key) ?? [])) contextTokens.add(token);
    for (const token of (wordTokenizer.tokenize(String(entry.value)) ?? [])) contextTokens.add(token);
  }

  if (contextTokens.size === 0) return 1.0;

  const textTokens = wordTokenizer.tokenize(text) ?? [];
  if (textTokens.length === 0) return 0;

  // What fraction of the response's content tokens overlap with the context envelope?
  const unique = new Set(textTokens);
  let overlap = 0;
  for (const token of unique) {
    if (contextTokens.has(token)) overlap++;
  }

  // Normalize: we don't expect 100% overlap, so scale generously
  return Math.min(1, (overlap / Math.max(unique.size * 0.3, 1)));
}

// ─── Dimension 3: Falsifiability Detection ───

function computeFalsifiability(
  text: string,
  groundTruth: Map<string, GroundTruthEntry>
): { score: number; contradictions: string[] } {
  const contradictions: string[] = [];
  const sentences = splitSentences(text);
  if (sentences.length === 0) return { score: 0, contradictions };

  // Confident assertion patterns — claims stated as fact
  const confidentPatterns = [
    /\b(?:is|are|was|were|will be|must be|should be|always|never|definitely|certainly|clearly)\b/i,
  ];

  for (const sentence of sentences) {
    const isConfident = confidentPatterns.some(p => p.test(sentence));
    if (!isConfident) continue;

    for (const [key, entry] of groundTruth) {
      const valueStr = String(entry.value).toLowerCase();
      const keyNorm = normalizeKey(key);
      const sentLower = sentence.toLowerCase();

      // Does this confident sentence reference this key?
      const mentionsKey =
        sentLower.includes(keyNorm) ||
        keyNorm.split("_").some(part => part.length > 3 && sentLower.includes(part));

      if (!mentionsKey) continue;

      // Check for negation of the stored value
      const negationPatterns = [
        new RegExp(`\\b(?:not|no|don'?t|won'?t|never|without)\\b[^.]*${escapeRegex(valueStr)}`, "i"),
        new RegExp(`\\b(?:instead of|rather than|unlike)\\b[^.]*${escapeRegex(valueStr)}`, "i"),
      ];

      const contradicts = negationPatterns.some(p => p.test(sentence));

      // Or: mentions key but uses a clearly different value
      if (contradicts) {
        contradictions.push(
          `"${sentence.trim().slice(0, 120)}" contradicts stored fact: ${key}="${entry.value}"`
        );
      }
    }
  }

  const score = Math.min(1, contradictions.length / Math.max(sentences.length * 0.2, 1));
  return { score, contradictions };
}

// ─── Utilities ───

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]+/g, " ").trim();
}

function splitSentences(text: string): string[] {
  return text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
