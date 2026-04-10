import natural from "natural";
import type { GroundTruthEntry, HistoryEntry, EntropyMetrics } from "../state/types.js";

const tokenizer = new natural.WordTokenizer();

const HEDGE_PHRASES = [
  "maybe",
  "perhaps",
  "possibly",
  "i think",
  "not sure",
  "it depends",
  "might",
  "could be",
  "arguably",
  "presumably",
];

/**
 * Compute proxy entropy metrics from recent LLM outputs.
 * Implements the ERGO (Entropy-Regulated Generative Oracle) pattern.
 */
export function computeEntropy(
  outputs: string[],
  groundTruth: Map<string, GroundTruthEntry>,
  history: HistoryEntry[]
): EntropyMetrics {
  const lexicalDiversity = computeLexicalDiversity(outputs);
  const contradictionDensity = computeContradictionDensity(outputs, groundTruth);
  const hedgeWordFrequency = computeHedgeFrequency(outputs);
  const repetitionScore = computeRepetitionScore(outputs, history);

  // Composite: higher = more entropy (bad)
  const compositeScore = Math.max(
    0,
    Math.min(
      1,
      0.25 * (1 - lexicalDiversity) +
        0.25 * contradictionDensity +
        0.25 * hedgeWordFrequency +
        0.25 * repetitionScore
    )
  );

  return {
    lexicalDiversity: round(lexicalDiversity),
    contradictionDensity: round(contradictionDensity),
    hedgeWordFrequency: round(hedgeWordFrequency),
    repetitionScore: round(repetitionScore),
    compositeScore: round(compositeScore),
  };
}

/**
 * Lexical diversity = unique tokens / total tokens across recent outputs.
 * Higher diversity = lower entropy contribution.
 */
function computeLexicalDiversity(outputs: string[]): number {
  const allText = outputs.join(" ");
  const tokens = tokenize(allText);
  if (tokens.length === 0) return 0;
  const unique = new Set(tokens);
  return unique.size / tokens.length;
}

/**
 * Count assertions in outputs that contradict ground truth.
 * Uses simple keyword-value co-occurrence heuristic.
 */
function computeContradictionDensity(
  outputs: string[],
  groundTruth: Map<string, GroundTruthEntry>
): number {
  if (groundTruth.size === 0 || outputs.length === 0) return 0;

  const allText = outputs.join(" ");
  const sentences = splitSentences(allText);
  if (sentences.length === 0) return 0;

  let contradictions = 0;

  for (const [key, entry] of groundTruth) {
    const valueStr = String(entry.value).toLowerCase();
    const keyLower = key.toLowerCase();

    for (const sentence of sentences) {
      const sentLower = sentence.toLowerCase();

      // Check if sentence references this key or its value
      const mentionsKey =
        sentLower.includes(keyLower) ||
        sentLower.includes(valueStr) ||
        keyLower.split(/[_\s-]+/).some((part) => part.length > 2 && sentLower.includes(part));

      if (!mentionsKey) continue;

      // Check for negation patterns
      const negationPatterns = [
        new RegExp(`\\b(?:not|no|don'?t|won'?t|shouldn'?t|never|without)\\b[^.]*${escapeRegex(valueStr)}`, "i"),
        new RegExp(`\\b(?:instead of|rather than|unlike)\\b[^.]*${escapeRegex(valueStr)}`, "i"),
      ];

      if (negationPatterns.some((p) => p.test(sentence))) {
        contradictions++;
      }
    }
  }

  return Math.min(1, contradictions / sentences.length);
}

/**
 * Count hedge phrases as a fraction of total sentences.
 */
function computeHedgeFrequency(outputs: string[]): number {
  const allText = outputs.join(" ");
  const sentences = splitSentences(allText);
  if (sentences.length === 0) return 0;

  let hedgeCount = 0;
  for (const sentence of sentences) {
    const sentLower = sentence.toLowerCase();
    if (HEDGE_PHRASES.some((phrase) => sentLower.includes(phrase))) {
      hedgeCount++;
    }
  }

  return Math.min(1, hedgeCount / sentences.length);
}

/**
 * Compute 3-gram overlap ratio between the last output and previous outputs.
 * High overlap = repetitive = high entropy.
 */
function computeRepetitionScore(
  outputs: string[],
  history: HistoryEntry[]
): number {
  if (outputs.length === 0) return 0;

  const lastOutput = outputs[outputs.length - 1];
  const lastNgrams = computeNgrams(lastOutput, 3);
  if (lastNgrams.size === 0) return 0;

  // Compare against previous outputs and assistant history
  const previousTexts = [
    ...outputs.slice(0, -1),
    ...history
      .filter((h) => h.role === "assistant")
      .slice(-5)
      .map((h) => h.content),
  ];

  if (previousTexts.length === 0) return 0;

  const previousNgrams = new Set<string>();
  for (const text of previousTexts) {
    for (const ngram of computeNgrams(text, 3)) {
      previousNgrams.add(ngram);
    }
  }

  if (previousNgrams.size === 0) return 0;

  let overlap = 0;
  for (const ngram of lastNgrams) {
    if (previousNgrams.has(ngram)) {
      overlap++;
    }
  }

  return Math.min(1, overlap / lastNgrams.size);
}

// ─── Utilities ───

function tokenize(text: string): string[] {
  return tokenizer.tokenize(text.toLowerCase()) ?? [];
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function computeNgrams(text: string, n: number): Set<string> {
  const tokens = tokenize(text);
  const ngramArrays = natural.NGrams.ngrams(tokens, n);
  return new Set(ngramArrays.map((g: string[]) => g.join(" ")));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
