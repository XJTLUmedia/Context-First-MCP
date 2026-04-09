import type { AmbiguityResult, VerificationResult, HistoryEntry, HistorySummary } from "../state/types.js";

/**
 * Heuristic-based validator for ambiguity checking and execution verification.
 */

// ─── Ambiguity Checking ───

const AMBIGUITY_INDICATORS = [
  { pattern: /\b(?:something|stuff|things|etc|whatever)\b/i, weight: 0.15, area: "Vague language" },
  { pattern: /\b(?:maybe|perhaps|possibly|probably|might)\b/i, weight: 0.1, area: "Uncertain intent" },
  { pattern: /\b(?:good|nice|better|best|great|proper)\b/i, weight: 0.08, area: "Subjective criteria without definition" },
  { pattern: /\b(?:some|few|several|many|lot|bunch)\b/i, weight: 0.08, area: "Unquantified amount" },
  { pattern: /\b(?:soon|later|eventually|quickly|fast)\b/i, weight: 0.1, area: "Unspecified timeline" },
  { pattern: /\b(?:simple|easy|basic|standard|normal)\b/i, weight: 0.08, area: "Undefined complexity level" },
  { pattern: /\b(?:like|similar|kind of|sort of|ish)\b/i, weight: 0.1, area: "Approximate reference" },
];

const SPECIFICITY_INDICATORS = [
  { pattern: /\b\d+\b/, weight: -0.1 }, // Numbers = more specific
  { pattern: /["'][\w\s]+["']/, weight: -0.1 }, // Quoted strings = more specific
  { pattern: /\b(?:must|shall|exactly|precisely|specifically)\b/i, weight: -0.15 },
  { pattern: /\b(?:by|before|after|on|at)\s+\d/, weight: -0.1 }, // Dates/times
  { pattern: /\b(?:using|with|via|through)\s+\w+/i, weight: -0.05 }, // Tool/method references
];

function generateClarifyingQuestions(requirement: string, areas: string[]): string[] {
  const questions: string[] = [];
  const questionsMap: Record<string, string> = {
    "Vague language": "Could you specify exactly what you mean? What specific items or features are included?",
    "Uncertain intent": "Is this a firm requirement or still open for discussion?",
    "Subjective criteria without definition": "How would you measure or define this quality? What specific criteria should be met?",
    "Unquantified amount": "Can you provide a specific number or range?",
    "Unspecified timeline": "What is the specific deadline or timeframe?",
    "Undefined complexity level": "What does this level of complexity look like in concrete terms?",
    "Approximate reference": "Can you point to a specific example or provide exact specifications?",
  };

  for (const area of areas) {
    const question = questionsMap[area];
    if (question) questions.push(question);
  }

  // Generic questions based on content analysis
  if (requirement.length < 30) {
    questions.push("This requirement seems very brief. Can you provide more detail about the expected behavior?");
  }
  if (!/\b(?:when|if|unless|except)\b/i.test(requirement)) {
    questions.push("Are there any conditions or edge cases to consider?");
  }
  if (!/\b(?:error|fail|invalid|wrong|missing)\b/i.test(requirement)) {
    questions.push("What should happen when something goes wrong? What are the error cases?");
  }

  return [...new Set(questions)].slice(0, 5);
}

export function checkAmbiguity(requirement: string, context?: string): AmbiguityResult {
  const fullText = context ? `${requirement}\n${context}` : requirement;
  let score = 0.3; // baseline
  const underspecifiedAreas: string[] = [];

  for (const indicator of AMBIGUITY_INDICATORS) {
    if (indicator.pattern.test(fullText)) {
      score += indicator.weight;
      underspecifiedAreas.push(indicator.area);
    }
  }

  for (const indicator of SPECIFICITY_INDICATORS) {
    if (indicator.pattern.test(fullText)) {
      score += indicator.weight;
    }
  }

  score = Math.max(0, Math.min(1, score));
  const uniqueAreas = [...new Set(underspecifiedAreas)];

  return {
    isAmbiguous: score > 0.5,
    score: Math.round(score * 100) / 100,
    clarifyingQuestions: generateClarifyingQuestions(requirement, uniqueAreas),
    underspecifiedAreas: uniqueAreas,
  };
}

// ─── Execution Verification ───

const FAILURE_INDICATORS = [
  /\berror\b/i,
  /\bfailed\b/i,
  /\bexception\b/i,
  /\btimeout\b/i,
  /\bdenied\b/i,
  /\bnot found\b/i,
  /\b404\b/,
  /\b500\b/,
  /\b403\b/,
  /\bundefined\b/i,
  /\bnull\b/i,
  /\bEACCES\b/,
  /\bENOENT\b/,
  /\bECONNREFUSED\b/,
  /\bpermission denied\b/i,
  /\bstack trace\b/i,
  /\bTraceback\b/,
];

const SUCCESS_INDICATORS = [
  /\b(?:success|succeeded|completed|done|created|updated|saved|written)\b/i,
  /\b200\b/,
  /\b201\b/,
  /\b204\b/,
  /\bok\b/i,
];

export function verifyExecution(
  goal: string,
  output: string,
  expectedIndicators?: string[]
): VerificationResult {
  const issues: string[] = [];
  const matchedIndicators: string[] = [];
  const missedIndicators: string[] = [];
  let confidence = 0.5; // neutral baseline

  // Check for failure indicators
  for (const pattern of FAILURE_INDICATORS) {
    if (pattern.test(output)) {
      issues.push(`Potential failure detected: output matches "${pattern.source}"`);
      confidence -= 0.15;
    }
  }

  // Check for success indicators
  for (const pattern of SUCCESS_INDICATORS) {
    if (pattern.test(output)) {
      confidence += 0.1;
    }
  }

  // Check expected indicators
  if (expectedIndicators && expectedIndicators.length > 0) {
    for (const indicator of expectedIndicators) {
      if (output.toLowerCase().includes(indicator.toLowerCase())) {
        matchedIndicators.push(indicator);
        confidence += 0.15;
      } else {
        missedIndicators.push(indicator);
        confidence -= 0.1;
        issues.push(`Expected indicator not found in output: "${indicator}"`);
      }
    }
  }

  // Check if output is empty
  if (!output || output.trim().length === 0) {
    issues.push("Output is empty — the operation may have produced no result");
    confidence -= 0.3;
  }

  // Check goal-output alignment via keyword overlap
  const goalTokens = new Set(
    goal.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
  );
  const outputTokens = new Set(
    output.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
  );
  const overlap = [...goalTokens].filter((t) => outputTokens.has(t));
  if (goalTokens.size > 0 && overlap.length === 0) {
    issues.push("Output has no keyword overlap with the stated goal — may not address the intended action");
    confidence -= 0.15;
  }

  confidence = Math.max(0, Math.min(1, confidence));

  return {
    isVerified: confidence >= 0.6 && issues.length === 0,
    confidence: Math.round(confidence * 100) / 100,
    issues,
    matchedIndicators,
    missedIndicators,
  };
}

// ─── History Summary ───

export function summarizeHistory(
  history: HistoryEntry[],
  maxTokens: number = 500
): HistorySummary {
  if (history.length === 0) {
    return {
      summary: "No conversation history.",
      totalTurns: 0,
      keyDecisions: [],
      openQuestions: [],
      topicProgression: [],
    };
  }

  const maxTurn = Math.max(...history.map((h) => h.turn));

  // Extract decisions
  const decisionPatterns = [
    /\b(?:decided|confirmed|agreed|chose|selected|going with|will use|let'?s go with)\b/i,
    /\b(?:approved|locked in|committed to|the plan is)\b/i,
  ];
  const keyDecisions: string[] = [];
  for (const entry of history) {
    const sentences = entry.content.split(/[.!?]+/).filter((s) => s.trim());
    for (const sentence of sentences) {
      if (decisionPatterns.some((p) => p.test(sentence))) {
        const trimmed = sentence.trim();
        if (trimmed.length > 10 && trimmed.length < 200) {
          keyDecisions.push(`[Turn ${entry.turn}] ${trimmed}`);
        }
      }
    }
  }

  // Extract open questions
  const openQuestions: string[] = [];
  for (const entry of history.slice(-10)) {
    const questions = entry.content.match(/[^.!]*\?/g);
    if (questions) {
      for (const q of questions) {
        const trimmed = q.trim();
        if (trimmed.length > 10 && trimmed.length < 200) {
          openQuestions.push(`[Turn ${entry.turn}] ${trimmed}`);
        }
      }
    }
  }

  // Topic progression via keyword extraction per segment
  const segmentSize = Math.max(1, Math.ceil(history.length / 4));
  const topicProgression: string[] = [];
  for (let i = 0; i < history.length; i += segmentSize) {
    const segment = history.slice(i, i + segmentSize);
    const wordFreq = new Map<string, number>();
    for (const entry of segment) {
      const words = entry.content.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      for (const word of words) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }
    const topWords = [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([w]) => w);
    if (topWords.length > 0) {
      const turnRange = `${segment[0].turn}-${segment[segment.length - 1].turn}`;
      topicProgression.push(`Turns ${turnRange}: ${topWords.join(", ")}`);
    }
  }

  // Build compressed summary
  const userMessages = history.filter((h) => h.role === "user");
  const summaryParts: string[] = [];
  summaryParts.push(`${history.length} messages across ${maxTurn} turns.`);

  const recentUser = userMessages.slice(-3);
  for (const msg of recentUser) {
    const truncated = msg.content.length > 100 ? msg.content.slice(0, 100) + "..." : msg.content;
    summaryParts.push(`[Turn ${msg.turn}] ${truncated}`);
  }

  // Rough token limiting (1 token ≈ 4 chars)
  let summary = summaryParts.join("\n");
  const estimatedTokens = summary.length / 4;
  if (estimatedTokens > maxTokens) {
    summary = summary.slice(0, maxTokens * 4) + "\n[...truncated]";
  }

  return {
    summary,
    totalTurns: maxTurn,
    keyDecisions: [...new Set(keyDecisions)].slice(0, 8),
    openQuestions: [...new Set(openQuestions)].slice(0, 5),
    topicProgression,
  };
}
