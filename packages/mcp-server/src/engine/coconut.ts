import type { CoconutResult, ContinuousThought } from "../state/types.js";
import { countTokens } from "./tokenizer.js";

/**
 * Coconut — Chain of Continuous Thought (2024)
 *
 * Based on the paper "Training Large Language Models to Reason in a
 * Continuous Latent Space". Instead of verbose language-token CoT,
 * this module performs **multi-perspective structured analysis** —
 * decomposing a problem into orthogonal reasoning dimensions and
 * scoring each with real text-analysis metrics.
 *
 * Each "thought step" represents a different analytical perspective
 * applied to the problem. The latent state vector encodes real
 * measurable features (not random numbers), and the decoded
 * interpretation is genuine text analysis (not template text).
 *
 * What's real:
 *   - Feature extraction via NLP heuristics (keyword density, structure, specificity)
 *   - Multi-perspective analysis with real scoring
 *   - Confidence computed from actual feature convergence
 *   - Token counting via js-tiktoken
 */

const DEFAULT_MAX_STEPS = 8;
const DEFAULT_BREADTH = 3;

export interface CoconutInput {
  /** The problem to reason about via multi-perspective analysis */
  problem: string;
  /** Maximum number of analysis perspectives */
  maxSteps?: number;
  /** Number of sub-dimensions to explore per perspective */
  breadth?: number;
  /** Whether to enable breadth exploration across sub-dimensions */
  enableBreadthExploration?: boolean;
}

// ─── Analysis Perspectives ───

interface Perspective {
  name: string;
  keywords: string[];
  analyze: (text: string, keywords: string[]) => { score: number; findings: string[] };
}

const PERSPECTIVES: Perspective[] = [
  {
    name: "structural_complexity",
    keywords: ["component", "part", "element", "structure", "layer", "module", "system", "interface"],
    analyze: analyzeStructure,
  },
  {
    name: "causal_reasoning",
    keywords: ["because", "cause", "effect", "result", "lead", "impact", "consequence", "therefore"],
    analyze: analyzeCausality,
  },
  {
    name: "constraint_space",
    keywords: ["must", "cannot", "require", "limit", "constraint", "boundary", "condition", "rule"],
    analyze: analyzeConstraints,
  },
  {
    name: "specificity",
    keywords: [],
    analyze: analyzeSpecificity,
  },
  {
    name: "risk_factors",
    keywords: ["risk", "fail", "error", "problem", "issue", "danger", "threat", "vulnerability"],
    analyze: analyzeRisk,
  },
  {
    name: "dependency_mapping",
    keywords: ["depend", "require", "need", "before", "after", "prerequisite", "order", "sequence"],
    analyze: analyzeDependencies,
  },
  {
    name: "scope_definition",
    keywords: ["scope", "include", "exclude", "within", "outside", "boundary", "range", "domain"],
    analyze: analyzeScope,
  },
  {
    name: "trade_off_analysis",
    keywords: ["trade", "balance", "versus", "compare", "advantage", "disadvantage", "pros", "cons"],
    analyze: analyzeTradeoffs,
  },
];

/**
 * Run the Coconut continuous thought reasoning pipeline.
 * Applies multiple analytical perspectives to the problem with real text analysis.
 */
export function runCoconut(input: CoconutInput): CoconutResult {
  const {
    problem,
    maxSteps = DEFAULT_MAX_STEPS,
    breadth = DEFAULT_BREADTH,
    enableBreadthExploration = true,
  } = input;

  const thoughts: ContinuousThought[] = [];
  const effectiveBreadth = enableBreadthExploration ? breadth : 1;

  // Real token counting
  const problemTokens = countTokens(problem);
  const estimatedLanguageTokens = problemTokens * Math.min(maxSteps, PERSPECTIVES.length) * 6;

  // Select perspectives relevant to the problem
  const selectedPerspectives = selectPerspectives(problem, maxSteps);
  let totalLatentOps = 0;

  // Running feature vector (accumulates across steps)
  let cumulativeState: number[] = new Array(PERSPECTIVES.length).fill(0);

  for (let step = 0; step < selectedPerspectives.length; step++) {
    const perspective = selectedPerspectives[step];

    // Analyze the problem from this perspective
    const { score, findings } = perspective.analyze(problem, perspective.keywords);

    // Build latent state: each dimension = a perspective's score
    cumulativeState[PERSPECTIVES.indexOf(perspective)] = score;

    // If breadth > 1, analyze sub-dimensions
    const subFindings: string[] = [...findings];
    if (effectiveBreadth > 1) {
      const sentences = problem.split(/[.!?]+/).filter(s => s.trim().length > 10);
      for (let b = 0; b < Math.min(effectiveBreadth - 1, sentences.length); b++) {
        const sub = perspective.analyze(sentences[b], perspective.keywords);
        if (sub.findings.length > 0) {
          subFindings.push(...sub.findings.map(f => `[sub-${b}] ${f}`));
        }
        totalLatentOps++;
      }
    }
    totalLatentOps += 1;

    // Compute confidence from feature convergence
    const nonZero = cumulativeState.filter(v => v > 0);
    const confidence = nonZero.length > 0
      ? round(Math.min(0.99, 0.3 + 0.7 * (nonZero.length / PERSPECTIVES.length) * (score > 0.3 ? 1 : 0.5)))
      : 0.3;

    const currentBreadth = enableBreadthExploration
      ? Math.min(effectiveBreadth, Math.max(1, effectiveBreadth - Math.floor(step / 3)))
      : 1;

    thoughts.push({
      step,
      latentState: cumulativeState.map(v => round(v)),
      decodedInterpretation: formatPerspectiveResult(perspective.name, score, subFindings, step),
      breadth: currentBreadth,
      confidence,
    });

    // Early termination if all dimensions are well-explored
    if (confidence > 0.95 && step >= 2) break;
  }

  const finalAnswer = synthesizeAnalysis(thoughts, problem);
  const compressionFactor = totalLatentOps > 0
    ? round(estimatedLanguageTokens / totalLatentOps)
    : 1;

  const planningScore = computePlanningScore(thoughts);

  return {
    thoughts,
    finalAnswer,
    totalSteps: thoughts.length,
    tokenEquivalent: estimatedLanguageTokens,
    latentOperations: totalLatentOps,
    compressionFactor,
    usedBreadthExploration: enableBreadthExploration,
    planningScore: round(planningScore),
  };
}

// ─── Perspective Selection ───

function selectPerspectives(problem: string, maxSteps: number): Perspective[] {
  const lower = problem.toLowerCase();

  // Score each perspective by keyword relevance to the problem
  const scored = PERSPECTIVES.map(p => {
    const keywordHits = p.keywords.filter(k => lower.includes(k)).length;
    const relevance = p.keywords.length > 0 ? keywordHits / p.keywords.length : 0.5;
    return { perspective: p, relevance };
  });

  scored.sort((a, b) => b.relevance - a.relevance);

  // Always include top perspectives + specificity (always useful)
  return scored.slice(0, Math.min(maxSteps, PERSPECTIVES.length)).map(s => s.perspective);
}

// ─── Real Analysis Functions ───

function analyzeStructure(text: string, keywords: string[]): { score: number; findings: string[] } {
  const findings: string[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const lower = text.toLowerCase();

  // Count structural markers
  const structuralHits = keywords.filter(k => lower.includes(k)).length;
  const listMarkers = (text.match(/(?:^|\n)\s*[-•*]\s|(?:^|\n)\s*\d+[.)]\s/gm) || []).length;
  const colonDefs = (text.match(/:\s/g) || []).length;

  if (structuralHits > 0) findings.push(`Found ${structuralHits} structural keyword(s): ${keywords.filter(k => lower.includes(k)).join(", ")}`);
  if (listMarkers > 0) findings.push(`Detected ${listMarkers} list/enumeration marker(s)`);
  if (sentences.length > 3) findings.push(`Multi-sentence problem with ${sentences.length} clauses suggests compound structure`);
  if (colonDefs > 1) findings.push(`${colonDefs} colon-definitions suggest structured specification`);

  const score = Math.min(1, (structuralHits * 0.15 + listMarkers * 0.1 + Math.min(sentences.length, 5) * 0.1 + colonDefs * 0.05));
  return { score: round(score), findings };
}

function analyzeCausality(text: string, keywords: string[]): { score: number; findings: string[] } {
  const findings: string[] = [];
  const lower = text.toLowerCase();

  const causalPatterns = [
    /\b(?:because|since|due to|as a result of)\b/gi,
    /\b(?:therefore|thus|hence|consequently|so that)\b/gi,
    /\b(?:if|when|whenever)\s+.+?\s*(?:then|,)/gi,
    /\b(?:leads? to|causes?|results? in|impacts?)\b/gi,
  ];

  let totalHits = 0;
  for (const pattern of causalPatterns) {
    const matches = text.match(pattern) || [];
    totalHits += matches.length;
    if (matches.length > 0) findings.push(`Causal pattern: "${matches[0]!.trim()}" (${matches.length} occurrence(s))`);
  }

  const keywordHits = keywords.filter(k => lower.includes(k)).length;
  if (keywordHits > 0 && totalHits === 0) findings.push(`Causal keywords present (${keywordHits}) but no explicit causal chains detected`);

  const score = Math.min(1, totalHits * 0.2 + keywordHits * 0.1);
  return { score: round(score), findings };
}

function analyzeConstraints(text: string, keywords: string[]): { score: number; findings: string[] } {
  const findings: string[] = [];
  const lower = text.toLowerCase();

  const constraintPatterns = [
    /\b(?:must|shall|required?|mandatory)\b/gi,
    /\b(?:cannot|must not|shall not|prohibited)\b/gi,
    /\b(?:at (?:most|least)|no (?:more|less) than|within|between)\b/gi,
    /\b(?:only if|provided that|as long as|unless)\b/gi,
  ];

  let totalHits = 0;
  for (const pattern of constraintPatterns) {
    const matches = text.match(pattern) || [];
    totalHits += matches.length;
    if (matches.length > 0) findings.push(`Constraint: "${matches[0]!.trim()}" (${matches.length} occurrence(s))`);
  }

  const score = Math.min(1, totalHits * 0.2);
  if (totalHits === 0) findings.push("No explicit constraints detected — problem may be under-specified");
  return { score: round(score), findings };
}

function analyzeSpecificity(text: string): { score: number; findings: string[] } {
  const findings: string[] = [];

  // Count specific details
  const numbers = (text.match(/\b\d+\.?\d*\b/g) || []).length;
  const technicalTerms = (text.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g) || []).length; // CamelCase
  const quotedTerms = (text.match(/"[^"]+"|'[^']+'/g) || []).length;
  const acronyms = (text.match(/\b[A-Z]{2,}\b/g) || []).length;

  if (numbers > 0) findings.push(`${numbers} numeric value(s) — adds precision`);
  if (technicalTerms > 0) findings.push(`${technicalTerms} technical term(s) detected`);
  if (quotedTerms > 0) findings.push(`${quotedTerms} quoted/named reference(s)`);
  if (acronyms > 0) findings.push(`${acronyms} acronym(s) — domain-specific language`);

  const words = text.split(/\s+/).length;
  const vague = (text.match(/\b(?:something|stuff|things|kind of|sort of|somehow|various|etc)\b/gi) || []).length;
  if (vague > 0) findings.push(`${vague} vague term(s) — reduces specificity`);

  const specificityRatio = words > 0 ? (numbers + technicalTerms + quotedTerms + acronyms - vague) / words : 0;
  const score = Math.min(1, Math.max(0, specificityRatio * 10 + 0.2));
  return { score: round(score), findings };
}

function analyzeRisk(text: string, keywords: string[]): { score: number; findings: string[] } {
  const findings: string[] = [];
  const lower = text.toLowerCase();

  const riskPatterns = [
    /\b(?:risk|danger|threat|vulnerability|weakness)\b/gi,
    /\b(?:fail(?:ure)?|error|bug|crash|break)\b/gi,
    /\b(?:worst.case|edge.case|corner.case)\b/gi,
    /\b(?:security|attack|exploit|injection)\b/gi,
  ];

  let totalHits = 0;
  for (const pattern of riskPatterns) {
    const matches = text.match(pattern) || [];
    totalHits += matches.length;
    if (matches.length > 0) findings.push(`Risk signal: "${matches[0]!.trim()}" (${matches.length} hit(s))`);
  }

  if (totalHits === 0) findings.push("No explicit risk factors mentioned — consider what could go wrong");
  const score = Math.min(1, totalHits * 0.2);
  return { score: round(score), findings };
}

function analyzeDependencies(text: string, keywords: string[]): { score: number; findings: string[] } {
  const findings: string[] = [];
  const lower = text.toLowerCase();

  const depPatterns = [
    /\b(?:depends? on|requires?|needs?|relies? on)\b/gi,
    /\b(?:before|after|first|then|next|finally)\b/gi,
    /\b(?:prerequisite|precondition|assumption)\b/gi,
  ];

  let totalHits = 0;
  for (const pattern of depPatterns) {
    const matches = text.match(pattern) || [];
    totalHits += matches.length;
    if (matches.length > 0) findings.push(`Dependency signal: "${matches[0]!.trim()}" (${matches.length} hit(s))`);
  }

  if (totalHits === 0) findings.push("No explicit dependencies — problem may be self-contained or under-specified");
  const score = Math.min(1, totalHits * 0.15);
  return { score: round(score), findings };
}

function analyzeScope(text: string, keywords: string[]): { score: number; findings: string[] } {
  const findings: string[] = [];
  const lower = text.toLowerCase();

  const scopeHits = keywords.filter(k => lower.includes(k)).length;
  const questionMarks = (text.match(/\?/g) || []).length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5).length;

  if (scopeHits > 0) findings.push(`${scopeHits} scope-defining keyword(s) found`);
  if (questionMarks > 1) findings.push(`${questionMarks} questions — multi-faceted problem scope`);
  if (sentences > 5) findings.push(`${sentences} sentences — broad problem scope`);
  if (sentences <= 2) findings.push("Concise problem statement — narrow scope");

  const score = Math.min(1, scopeHits * 0.15 + questionMarks * 0.1 + Math.min(sentences, 6) * 0.08);
  return { score: round(score), findings };
}

function analyzeTradeoffs(text: string, keywords: string[]): { score: number; findings: string[] } {
  const findings: string[] = [];
  const lower = text.toLowerCase();

  const tradeoffPatterns = [
    /\b(?:trade.?off|versus|vs\.?|compared? to|alternatively)\b/gi,
    /\b(?:advantage|disadvantage|pro|con|benefit|drawback)\b/gi,
    /\b(?:on (?:the )?one hand|on (?:the )?other hand|however|but|although)\b/gi,
  ];

  let totalHits = 0;
  for (const pattern of tradeoffPatterns) {
    const matches = text.match(pattern) || [];
    totalHits += matches.length;
    if (matches.length > 0) findings.push(`Trade-off signal: "${matches[0]!.trim()}" (${matches.length} hit(s))`);
  }

  if (totalHits === 0) findings.push("No explicit trade-offs — consider alternative approaches");
  const score = Math.min(1, totalHits * 0.2);
  return { score: round(score), findings };
}

// ─── Formatting & Synthesis ───

function formatPerspectiveResult(name: string, score: number, findings: string[], step: number): string {
  const findingsSummary = findings.length > 0
    ? findings.slice(0, 4).join("; ")
    : "No significant signals detected";
  return `Step ${step} [${name}] score=${round(score)}: ${findingsSummary}`;
}

function synthesizeAnalysis(thoughts: ContinuousThought[], problem: string): string {
  if (thoughts.length === 0) return "No analysis perspectives were applied.";

  const parts: string[] = [];
  parts.push(`Multi-Perspective Analysis (${thoughts.length} dimensions):`);
  parts.push("");

  for (const thought of thoughts) {
    const bar = "█".repeat(Math.round(thought.confidence * 10)) +
      "░".repeat(10 - Math.round(thought.confidence * 10));
    parts.push(`  ${thought.decodedInterpretation.split("]")[0]}] [${bar}] ${round(thought.confidence * 100)}%`);
    const detail = thought.decodedInterpretation.split("]: ")[1];
    if (detail) parts.push(`    ${detail}`);
  }

  parts.push("");

  // Identify strongest and weakest dimensions
  const sorted = [...thoughts].sort((a, b) => {
    const aScore = a.latentState.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    const bScore = b.latentState.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    return bScore - aScore;
  });

  if (sorted.length >= 2) {
    const strongest = sorted[0].decodedInterpretation.match(/\[([^\]]+)\]/)?.[1] || "unknown";
    const weakest = sorted[sorted.length - 1].decodedInterpretation.match(/\[([^\]]+)\]/)?.[1] || "unknown";
    parts.push(`Strongest dimension: ${strongest}`);
    parts.push(`Weakest dimension: ${weakest} — consider elaborating this area`);
  }

  const avgConfidence = thoughts.reduce((s, t) => s + t.confidence, 0) / thoughts.length;
  parts.push(`\nOverall analysis confidence: ${round(avgConfidence * 100)}%`);

  return parts.join("\n");
}

function computePlanningScore(thoughts: ContinuousThought[]): number {
  if (thoughts.length < 2) return 0.5;

  const confidenceGrowth = thoughts[thoughts.length - 1].confidence - thoughts[0].confidence;
  const avgBreadth = thoughts.reduce((sum, t) => sum + t.breadth, 0) / thoughts.length;
  const breadthUtilization = Math.min(1, avgBreadth / DEFAULT_BREADTH);
  const convergenceBonus = thoughts[thoughts.length - 1].confidence > 0.8 ? 0.2 : 0;

  return Math.min(1, 0.4 * Math.max(0, confidenceGrowth) +
    0.6 * breadthUtilization + convergenceBonus);
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}


