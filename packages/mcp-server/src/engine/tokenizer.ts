import { encodingForModel } from "js-tiktoken";

/**
 * Shared tokenizer module using js-tiktoken for accurate GPT token counting.
 * Replaces all `estimateTokens(text) = Math.ceil(text.length / 4)` approximations
 * with real BPE tokenization.
 */

// Lazily initialized encoder — cl100k_base covers GPT-4 / GPT-3.5-turbo
let encoder: ReturnType<typeof encodingForModel> | null = null;

function getEncoder() {
  if (!encoder) {
    encoder = encodingForModel("gpt-4o");
  }
  return encoder;
}

/**
 * Count exact tokens using GPT tokenizer (cl100k_base).
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  return getEncoder().encode(text).length;
}

/**
 * Truncate text to fit within a token budget.
 * Returns the longest prefix that fits within maxTokens.
 */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const enc = getEncoder();
  const tokens = enc.encode(text);
  if (tokens.length <= maxTokens) return text;
  const truncated = tokens.slice(0, maxTokens);
  return enc.decode(truncated);
}
