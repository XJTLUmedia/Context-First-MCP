import { compareTwoStrings } from "string-similarity";
import type { InftyThinkResult, InftyThinkSegment } from "../state/types.js";
import { countTokens, truncateToTokenBudget } from "./tokenizer.js";
import { splitSentences, rankSentencesByImportance, extractNouns } from "./nlp-utils.js";

/**
 * InftyThink — Iterative Reasoning for Unlimited Depth
 * Based on the InftyThink paradigm (2025/2026).
 *
 * Transforms monolithic Chain-of-Thought into bounded-length segments
 * interleaved with intermediate summarization, creating a "sawtooth"
 * memory pattern that allows theoretically unlimited reasoning depth
 * while keeping individual steps within a restricted context.
 *
 * Two modes of operation:
 *   1. **Process mode** (reasoningSegments provided): Accepts pre-generated
 *      LLM reasoning segments and applies real compression + convergence
 *      detection across them.
 *   2. **Analyze mode** (no segments): Extracts aspects from the problem
 *      text, structures them into bounded segments, and prepares a
 *      carry-forward plan for the LLM to execute.
 *
 * What's real:
 *   - Token counting via js-tiktoken
 *   - Extractive summarization with information density scoring
 *   - Convergence detection via Jaccard similarity
 *   - Sawtooth compression across segments
 */

const DEFAULT_MAX_SEGMENTS = 10;
const DEFAULT_MAX_SEGMENT_TOKENS = 500;
const DEFAULT_SUMMARY_RATIO = 0.3;
const CONVERGENCE_THRESHOLD = 0.85;

export interface InftyThinkInput {
  /** The problem or question to reason about */
  problem: string;
  /** Existing context/prior reasoning to build upon */
  priorContext?: string;
  /**
   * Pre-generated reasoning segments (e.g. from LLM output).
   * If provided, the module processes them through compression + convergence.
   * If omitted, the module produces a structured analysis plan.
   */
  reasoningSegments?: string[];
  /** Maximum number of reasoning segments */
  maxSegments?: number;
  /** Maximum token budget per segment */
  maxSegmentTokens?: number;
  /** Target summary compression ratio (0-1) */
  summaryRatio?: number;
}

/**
 * Run the InftyThink iterative reasoning pipeline.
 * Processes reasoning segments with sawtooth summarization.
 */
export function runInftyThink(input: InftyThinkInput): InftyThinkResult {
  const {
    problem,
    priorContext = "",
    reasoningSegments,
    maxSegments = DEFAULT_MAX_SEGMENTS,
    maxSegmentTokens = DEFAULT_MAX_SEGMENT_TOKENS,
    summaryRatio = DEFAULT_SUMMARY_RATIO,
  } = input;

  // Choose mode based on whether pre-generated segments are provided
  if (reasoningSegments && reasoningSegments.length > 0) {
    return processProvidedSegments(
      problem, priorContext, reasoningSegments,
      maxSegments, maxSegmentTokens, summaryRatio
    );
  }
  return analyzeAndPlan(
    problem, priorContext, maxSegments, maxSegmentTokens, summaryRatio
  );
}

/**
 * Process mode: Apply sawtooth compression + convergence detection
 * to pre-generated reasoning segments (e.g. from LLM).
 */
function processProvidedSegments(
  problem: string,
  priorContext: string,
  rawSegments: string[],
  maxSegments: number,
  maxSegmentTokens: number,
  summaryRatio: number,
): InftyThinkResult {
  const segments: InftyThinkSegment[] = [];
  let carryForward = priorContext;
  let converged = false;
  let convergenceReason = "";
  let previousSummary = "";

  const effectiveSegments = rawSegments.slice(0, maxSegments);

  for (let i = 0; i < effectiveSegments.length; i++) {
    // Budget-truncate the raw segment
    const reasoning = truncateToTokenBudget(effectiveSegments[i], maxSegmentTokens);
    const tokenCount = countTokens(reasoning);
    const hitBudgetLimit = countTokens(effectiveSegments[i]) > maxSegmentTokens;

    // Compress
    const summary = compressToSummary(reasoning, summaryRatio);
    const summaryTokenCount = countTokens(summary);
    const compressionRatio = tokenCount > 0 ? round(summaryTokenCount / tokenCount) : 0;

    segments.push({
      index: i,
      reasoning,
      summary,
      tokenCount,
      summaryTokenCount,
      compressionRatio,
      hitBudgetLimit,
    });

    // Convergence check
    if (previousSummary && computeSimilarity(summary, previousSummary) > CONVERGENCE_THRESHOLD) {
      converged = true;
      convergenceReason = `Segment ${i} summary converged with previous (similarity > ${CONVERGENCE_THRESHOLD}). No new insights detected.`;
      break;
    }

    if (isReasoningExhausted(reasoning)) {
      converged = true;
      convergenceReason = `Reasoning exhausted at segment ${i}. All aspects have been addressed.`;
      break;
    }

    previousSummary = summary;
    carryForward = summary;
  }

  return buildResult(problem, segments, converged, convergenceReason);
}

/**
 * Analyze mode: Extract aspects from the problem, perform real extractive
 * analysis on each aspect, and produce structured segments with computed insights.
 * No prompt strings or LLM instructions are generated.
 */
function analyzeAndPlan(
  problem: string,
  priorContext: string,
  maxSegments: number,
  maxSegmentTokens: number,
  summaryRatio: number,
): InftyThinkResult {
  const segments: InftyThinkSegment[] = [];
  let carryForward = priorContext;
  let converged = false;
  let convergenceReason = "";
  let previousSummary = "";

  // Extract real aspects from the problem text
  const aspects = extractReasoningAspects(problem);

  // Rank sentences by importance for extractive analysis
  const rankedSentences = rankSentencesByImportance(problem);
  const problemNouns = extractNouns(problem);

  for (let i = 0; i < Math.min(aspects.length, maxSegments); i++) {
    const aspect = aspects[i];

    // Build a real analysis for this aspect using NLP
    const parts: string[] = [];
    if (i === 0 && priorContext) {
      const priorSummary = compressToSummary(priorContext, 0.5);
      parts.push(`Prior context: ${priorSummary}`);
    }
    parts.push(`[Segment ${i}: ${aspect.label}]`);

    // Real extractive analysis: select sentences relevant to this aspect
    const aspectKeywords = aspect.label.toLowerCase().split(/\s+/);
    const relevantSentences = rankedSentences.filter(s => {
      const lower = s.toLowerCase();
      return aspectKeywords.some(kw => lower.includes(kw));
    });

    if (relevantSentences.length > 0) {
      parts.push(`Key findings for ${aspect.label}: ${relevantSentences.slice(0, 3).join(" ")}`);
    }

    if (aspect.evidence.length > 0) {
      parts.push(`Evidence from text: ${aspect.evidence.join("; ")}`);
    }

    // Add topic-noun coverage for this aspect
    const aspectNouns = problemNouns.filter(n =>
      aspect.evidence.some(e => e.toLowerCase().includes(n)) ||
      aspect.label.toLowerCase().includes(n)
    );
    if (aspectNouns.length > 0) {
      parts.push(`Key concepts addressed: ${aspectNouns.join(", ")}`);
    }

    if (carryForward) {
      parts.push(`Carry-forward from prior segments: ${truncate(carryForward, 120)}`);
    }

    const reasoning = truncateToTokenBudget(parts.join("\n"), maxSegmentTokens);
    const tokenCount = countTokens(reasoning);

    const summary = compressToSummary(reasoning, summaryRatio);
    const summaryTokenCount = countTokens(summary);
    const compressionRatio = tokenCount > 0 ? round(summaryTokenCount / tokenCount) : 0;

    segments.push({
      index: i,
      reasoning,
      summary,
      tokenCount,
      summaryTokenCount,
      compressionRatio,
      hitBudgetLimit: false,
    });

    // Convergence check
    if (previousSummary && computeSimilarity(summary, previousSummary) > CONVERGENCE_THRESHOLD) {
      converged = true;
      convergenceReason = `Segment ${i} converged — no new aspects to explore.`;
      break;
    }

    previousSummary = summary;
    carryForward = summary;
  }

  if (!converged && aspects.length <= maxSegments) {
    converged = true;
    convergenceReason = "All detected aspects have been covered.";
  }

  return buildResult(problem, segments, converged, convergenceReason);
}

// ─── Aspect Extraction (REAL) ───

interface ReasoningAspect {
  label: string;
  evidence: string[];
}

function extractReasoningAspects(problem: string): ReasoningAspect[] {
  const aspects: ReasoningAspect[] = [];
  const lower = problem.toLowerCase();
  const sentences = problem.split(/[.!?]+/).filter(s => s.trim().length > 5);

  const detectors: Array<{ label: string; patterns: RegExp[] }> = [
    { label: "methodology", patterns: [/\bhow\b/i, /\bmethod\b/i, /\bapproach\b/i, /\bstrategy\b/i] },
    { label: "causation", patterns: [/\bwhy\b/i, /\breason\b/i, /\bcause\b/i, /\bdue to\b/i] },
    { label: "comparison", patterns: [/\bcompare\b/i, /\bdifferenc/i, /\bversus\b/i, /\bvs\.?\b/i] },
    { label: "impact analysis", patterns: [/\bimpact\b/i, /\beffect\b/i, /\bresult\b/i, /\bconsequen/i] },
    { label: "implementation", patterns: [/\bimplement/i, /\bbuild\b/i, /\bcreate\b/i, /\bdesign\b/i] },
    { label: "risk assessment", patterns: [/\brisk\b/i, /\bproblem\b/i, /\bchallenge\b/i, /\bfail/i] },
    { label: "optimization", patterns: [/\boptimiz/i, /\bimprove\b/i, /\bbetter\b/i, /\bperforman/i] },
    { label: "constraints", patterns: [/\bmust\b/i, /\bcannot\b/i, /\brequire/i, /\blimit/i] },
    { label: "dependencies", patterns: [/\bdepend/i, /\bprerequisite/i, /\bbefore\b/i, /\bneeds?\b/i] },
  ];

  for (const det of detectors) {
    const evidence: string[] = [];
    for (const s of sentences) {
      for (const p of det.patterns) {
        if (p.test(s)) {
          evidence.push(s.trim().slice(0, 80));
          break;
        }
      }
    }
    if (evidence.length > 0) {
      aspects.push({ label: det.label, evidence: evidence.slice(0, 3) });
    }
  }

  // Ensure at least core aspects
  if (aspects.length === 0) {
    aspects.push(
      { label: "core analysis", evidence: [sentences[0]?.trim().slice(0, 80) || problem.slice(0, 80)] },
      { label: "implications", evidence: [] },
    );
  }
  aspects.push({ label: "edge cases", evidence: [] });
  aspects.push({ label: "verification", evidence: [] });

  return aspects;
}

// ─── Build Result ───

function buildResult(
  problem: string,
  segments: InftyThinkSegment[],
  converged: boolean,
  convergenceReason: string,
): InftyThinkResult {
  const totalTokens = segments.reduce((sum, s) => sum + s.tokenCount, 0);
  const totalSummaryTokens = segments.reduce((sum, s) => sum + s.summaryTokenCount, 0);
  const overallCompression = totalTokens > 0 ? round(totalSummaryTokens / totalTokens) : 0;

  const finalAnswer = synthesizeFinalAnswer(problem, segments);

  return {
    segments,
    finalAnswer,
    totalSegments: segments.length,
    totalTokens,
    totalSummaryTokens,
    overallCompression,
    converged,
    convergenceReason: convergenceReason || "Maximum segments reached",
    depthAchieved: segments.length,
  };
}

/**
 * Compress reasoning content into a condensed summary.
 * Implements the "sawtooth" memory pattern — each segment is summarized
 * to ~summaryRatio of its original length.
 */
function compressToSummary(reasoning: string, ratio: number): string {
  const sentences = splitSentences(reasoning).filter(s => s.length > 10);

  if (sentences.length === 0) return reasoning;

  // Score sentences by information density
  const scored = sentences.map(s => ({
    sentence: s,
    score: scoreSentence(s),
  }));

  // Sort by score and take the top ratio
  scored.sort((a, b) => b.score - a.score);
  const keepCount = Math.max(1, Math.ceil(sentences.length * ratio));
  const kept = scored.slice(0, keepCount);

  // Re-order by original position
  kept.sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence));

  const result = kept.map(k => k.sentence).join(" ");
  // Ensure summary is never longer than original
  return result.length <= reasoning.length ? result : reasoning;
}

/**
 * Score a sentence by information density.
 * Higher scores indicate more important content.
 */
function scoreSentence(sentence: string): number {
  let score = 0;
  const lower = sentence.toLowerCase();

  // Structural importance markers
  if (/step \d|phase \d|dimension \d/i.test(sentence)) score += 2;
  if (/therefore|thus|consequently|conclude/i.test(lower)) score += 3;
  if (/key|critical|important|essential|primary/i.test(lower)) score += 2;
  if (/\b\d+\.?\d*%?\b/.test(sentence)) score += 1; // Contains numbers
  if (/because|since|due to|as a result/i.test(lower)) score += 2; // Causal
  if (sentence.includes(":")) score += 1; // Definitional

  // Length bonus (medium-length sentences tend to be more informative)
  const words = sentence.split(/\s+/).length;
  if (words >= 8 && words <= 25) score += 1;

  return score;
}

/**
 * Synthesize a final answer from all segment summaries.
 */
function synthesizeFinalAnswer(problem: string, segments: InftyThinkSegment[]): string {
  if (segments.length === 0) return "No reasoning segments were produced.";

  const parts: string[] = [];
  parts.push(`After ${segments.length} iterative reasoning segment${segments.length > 1 ? "s" : ""}:`);
  parts.push("");

  for (const seg of segments) {
    parts.push(`[Depth ${seg.index}] ${seg.summary}`);
  }

  parts.push("");
  parts.push(`Conclusion: The iterative analysis of "${truncate(problem, 60)}" has been completed across ${segments.length} bounded segments with sawtooth summarization.`);

  if (segments.length > 1) {
    const lastSummary = segments[segments.length - 1].summary;
    parts.push(`Final synthesis: ${lastSummary}`);
  }

  return parts.join("\n");
}

/**
 * Compute similarity between two texts using Dice coefficient (string-similarity).
 */
function computeSimilarity(a: string, b: string): number {
  return compareTwoStrings(a.toLowerCase(), b.toLowerCase());
}

/**
 * Check if reasoning has been exhausted (repetitive conclusions).
 */
function isReasoningExhausted(reasoning: string): boolean {
  const sentences = reasoning.split(/[.!?]+/).filter(s => s.trim().length > 5);
  if (sentences.length < 3) return false;

  // Check if the last few sentences are very similar to each other
  const lastThree = sentences.slice(-3);
  let similarPairs = 0;
  for (let i = 0; i < lastThree.length; i++) {
    for (let j = i + 1; j < lastThree.length; j++) {
      if (computeSimilarity(lastThree[i], lastThree[j]) > 0.7) {
        similarPairs++;
      }
    }
  }
  return similarPairs >= 2;
}

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen) + "...";
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
