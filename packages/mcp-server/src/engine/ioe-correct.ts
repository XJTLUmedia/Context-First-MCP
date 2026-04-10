import type {
  GroundTruthEntry,
  IoEResult,
  IoEConfidenceAssessment,
  IoECorrection,
} from "../state/types.js";

/**
 * If-or-Else (IoE) Confidence-Based Self-Correction — inspired by
 * "If LLMs Are the Answer, What is the Question?" and related work on
 * intrinsic self-evaluation prompting.
 *
 * Instead of blindly auto-correcting, IoE:
 *   1. Assesses confidence in the original response using proxy signals
 *   2. Only triggers correction when confidence is genuinely low
 *   3. For high-confidence responses, accepts them directly
 *   4. For low-confidence responses, generates targeted corrections
 *   5. Can escalate to human review when confidence is ambiguous
 *
 * This avoids the "over-correction" problem where self-correction
 * changes correct answers to incorrect ones.
 */

// ─── Confidence Signal Banks ───

const HIGH_CONFIDENCE_PATTERNS = [
  /\b(?:definitely|certainly|absolutely|clearly|undoubtedly)\b/i,
  /\b(?:proven|established|confirmed|well-known|standard)\b/i,
  /\b(?:according to|based on evidence|research shows|data indicates)\b/i,
  /\b(?:is|are|was|were)\s+(?:exactly|precisely|specifically)\b/i,
];

const LOW_CONFIDENCE_PATTERNS = [
  /\b(?:I think|I believe|I guess|I suppose|it seems)\b/i,
  /\b(?:maybe|perhaps|possibly|could be|might be)\b/i,
  /\b(?:not sure|uncertain|unclear|I don't know|hard to say)\b/i,
  /\b(?:approximately|roughly|around|about|or so)\b/i,
  /\b(?:if I recall|to the best of my knowledge|I may be wrong)\b/i,
];

const FACTUAL_RISK_PATTERNS = [
  /\b(?:founded in|born in|died in|invented by|discovered by)\s+\d/i,  // date facts
  /\b(?:capital of|population of|located in|situated)\b/i,             // geo facts
  /\b(?:awarded|received|won)\s+(?:the|a)\b/i,                         // event facts
  /\b(?:first|largest|smallest|oldest|tallest|fastest)\b/i,           // superlative claims
];

// ─── Core API ───

/**
 * Assess confidence and conditionally self-correct a response.
 * Returns accept (high confidence), correct (low confidence + fixable),
 * or escalate (ambiguous confidence).
 */
export function ioeSelfCorrect(
  response: string,
  groundTruth: Map<string, GroundTruthEntry>,
  question: string = "",
  priorAttempts: string[] = []
): IoEResult {
  // Step 1: Assess confidence
  const confidenceAssessment = assessConfidence(response, groundTruth, question);

  // Step 2: Determine action
  let action: "accept" | "correct" | "escalate";
  let corrections: IoECorrection[] = [];
  let correctedResponse: string | null = null;

  if (confidenceAssessment.overallConfidence >= 0.75) {
    action = "accept";
  } else if (confidenceAssessment.overallConfidence <= 0.4) {
    action = "correct";
    corrections = generateCorrections(response, groundTruth, confidenceAssessment);
    correctedResponse = applyCorrections(response, corrections);
  } else {
    // Ambiguous confidence — check if we've already tried correcting
    if (priorAttempts.length >= 2) {
      action = "escalate";
    } else {
      action = "correct";
      corrections = generateCorrections(response, groundTruth, confidenceAssessment);
      correctedResponse = applyCorrections(response, corrections);
    }
  }

  const finalResponse = correctedResponse ?? response;
  const postConfidence = correctedResponse !== null
    ? assessConfidence(correctedResponse, groundTruth, question)
    : null;
  const improved = postConfidence !== null && postConfidence.overallConfidence > confidenceAssessment.overallConfidence;
  const escalationQuestions = action === "escalate"
    ? generateEscalationQuestions(response, question, confidenceAssessment)
    : [];

  return {
    originalResponse: response,
    finalResponse,
    action,
    preConfidence: confidenceAssessment,
    postConfidence,
    corrections,
    improved,
    escalationQuestions,
    correctionIterations: action === "correct" ? 1 : 0,
  };
}

// ─── Confidence Assessment ───

function assessConfidence(
  response: string,
  groundTruth: Map<string, GroundTruthEntry>,
  question: string
): IoEConfidenceAssessment {
  const linguisticConfidence = computeLinguisticConfidence(response);
  const factualRiskLevel = computeFactualRisk(response);
  const groundTruthAlignment = computeGroundTruthAlignment(response, groundTruth);
  const selfConsistency = computeResponseConsistency(response);
  const questionRelevance = computeQuestionRelevance(response, question);

  // Map 5 internal scores to 3 type fields
  const knowledgeConfidence = round(0.6 * groundTruthAlignment + 0.4 * (1 - factualRiskLevel));
  const reasoningConfidence = round(0.6 * selfConsistency + 0.4 * questionRelevance);

  // Weighted combination
  const overallConfidence = round(
    0.20 * linguisticConfidence +
    0.20 * (1 - factualRiskLevel) +
    0.25 * groundTruthAlignment +
    0.20 * selfConsistency +
    0.15 * questionRelevance
  );

  const level: IoEConfidenceAssessment["level"] =
    overallConfidence >= 0.75 ? "high" : overallConfidence <= 0.4 ? "low" : "medium";

  return {
    linguisticConfidence: round(linguisticConfidence),
    knowledgeConfidence,
    reasoningConfidence,
    overallConfidence,
    level,
  };
}

function computeLinguisticConfidence(response: string): number {
  let highCount = 0;
  let lowCount = 0;

  for (const p of HIGH_CONFIDENCE_PATTERNS) {
    const matches = response.match(new RegExp(p.source, "gi"));
    if (matches) highCount += matches.length;
  }
  for (const p of LOW_CONFIDENCE_PATTERNS) {
    const matches = response.match(new RegExp(p.source, "gi"));
    if (matches) lowCount += matches.length;
  }

  const total = highCount + lowCount;
  if (total === 0) return 0.5;
  return highCount / total;
}

function computeFactualRisk(response: string): number {
  // Count high-risk factual claims (dates, names, superlatives, etc.)
  let riskCount = 0;
  for (const p of FACTUAL_RISK_PATTERNS) {
    const matches = response.match(new RegExp(p.source, "gi"));
    if (matches) riskCount += matches.length;
  }

  const sentences = response.split(/(?<=[.!?])\s+/).length;
  const riskDensity = sentences > 0 ? riskCount / sentences : 0;
  return Math.min(1, riskDensity);
}

function computeGroundTruthAlignment(
  response: string,
  groundTruth: Map<string, GroundTruthEntry>
): number {
  if (groundTruth.size === 0) return 0.5;

  const responseLower = response.toLowerCase();
  let alignedFacts = 0;
  let checkedFacts = 0;

  for (const [key, entry] of groundTruth) {
    const keyParts = key.toLowerCase().replace(/[_-]/g, " ").split(/\s+/);
    const mentionsTopic = keyParts.some(p => p.length > 2 && responseLower.includes(p));
    if (!mentionsTopic) continue;

    checkedFacts++;
    const valueStr = String(entry.value).toLowerCase();
    const valueTokens = valueStr.split(/\s+/).filter(v => v.length > 2);
    const matched = valueTokens.filter(v => responseLower.includes(v)).length;
    const alignment = valueTokens.length > 0 ? matched / valueTokens.length : 0;

    if (alignment > 0.3) alignedFacts++;
  }

  return checkedFacts > 0 ? alignedFacts / checkedFacts : 0.5;
}

function computeResponseConsistency(response: string): number {
  const sentences = response
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (sentences.length <= 1) return 0.9;

  let contradictions = 0;
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) {
      if (detectContradiction(sentences[i], sentences[j])) {
        contradictions++;
      }
    }
  }

  const pairCount = (sentences.length * (sentences.length - 1)) / 2;
  return pairCount > 0 ? Math.max(0, 1 - contradictions / pairCount * 3) : 0.9;
}

function computeQuestionRelevance(response: string, question: string): number {
  if (!question) return 0.5;

  const qTokens = tokenize(question);
  const rTokens = new Set(tokenize(response));

  if (qTokens.length === 0) return 0.5;
  const relevant = qTokens.filter(t => rTokens.has(t)).length;
  return relevant / qTokens.length;
}

function detectContradiction(a: string, b: string): boolean {
  const aNeg = /\b(?:not|no|don't|doesn't|isn't|aren't|never|without|cannot)\b/i.test(a);
  const bNeg = /\b(?:not|no|don't|doesn't|isn't|aren't|never|without|cannot)\b/i.test(b);

  if (aNeg === bNeg) return false;

  const aTopics = extractTopicWords(a);
  const bTopics = extractTopicWords(b);
  const shared = aTopics.filter(t => bTopics.includes(t));
  return shared.length >= 2;
}

// ─── Correction Generation ───

function generateCorrections(
  response: string,
  groundTruth: Map<string, GroundTruthEntry>,
  assessment: IoEConfidenceAssessment
): IoECorrection[] {
  const corrections: IoECorrection[] = [];
  const sentences = response
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();

    // Check each ground truth entry
    for (const [key, entry] of groundTruth) {
      const keyParts = key.toLowerCase().replace(/[_-]/g, " ").split(/\s+/);
      const mentionsTopic = keyParts.some(p => p.length > 2 && sentenceLower.includes(p));
      if (!mentionsTopic) continue;

      const valueStr = String(entry.value).toLowerCase();
      const valueInSentence = sentenceLower.includes(valueStr);

      if (!valueInSentence) {
        // Sentence mentions the topic but NOT the correct value
        // Check if it mentions a DIFFERENT value
        const isWrongValue = hasAlternativeValue(sentenceLower, key, entry);

        if (isWrongValue) {
          corrections.push({
            target: key,
            original: sentence,
            corrected: `[Correction needed: "${key}" should reference "${entry.value}"]`,
            reason: `Ground truth for "${key}" is "${entry.value}" but response states something different`,
            confidenceImprovement: round(1 - assessment.overallConfidence),
          });
        }
      }
    }

    // Check for low-confidence hedging on checkable claims
    if (assessment.linguisticConfidence < 0.3) {
      const hasRiskyFact = FACTUAL_RISK_PATTERNS.some(p => p.test(sentence));
      if (hasRiskyFact) {
        corrections.push({
          target: truncate(sentence, 30),
          original: sentence,
          corrected: `[Low confidence factual claim: verify "${truncate(sentence, 60)}" before accepting]`,
          reason: "Factual claim made with low linguistic confidence",
          confidenceImprovement: round(1 - assessment.knowledgeConfidence),
        });
      }
    }
  }

  return corrections;
}

function hasAlternativeValue(
  sentenceLower: string,
  key: string,
  entry: GroundTruthEntry
): boolean {
  const correctValue = String(entry.value).toLowerCase();
  const correctTokens = correctValue.split(/\s+/).filter(t => t.length > 2);

  // If the sentence has number/date and ground truth has number/date,
  // check if they differ
  const sentenceNumbers: string[] = sentenceLower.match(/\b\d+\.?\d*\b/g) ?? [];
  const correctNumbers: string[] = correctValue.match(/\b\d+\.?\d*\b/g) ?? [];

  if (correctNumbers.length > 0 && sentenceNumbers.length > 0) {
    return !sentenceNumbers.some(n => correctNumbers.includes(n));
  }

  // Generic: insufficient overlap with correct value
  const matchCount = correctTokens.filter(t => sentenceLower.includes(t)).length;
  return correctTokens.length > 0 && matchCount / correctTokens.length < 0.3;
}

// ─── Correction Application ───

function applyCorrections(response: string, corrections: IoECorrection[]): string {
  if (corrections.length === 0) return response;

  let corrected = response;
  for (const correction of corrections) {
    // Append corrections as annotations rather than modifying in-place
    // to preserve the original for comparison
  }

  const correctionSummary = corrections
    .map(c => `• ${c.reason}`)
    .join("\n");

  return `${response}\n\n--- Self-Correction Notes ---\n${correctionSummary}`;
}

// ─── Over-Correction Risk ───

function computeOverCorrectionRisk(
  assessment: IoEConfidenceAssessment,
  priorAttempts: number
): number {
  let risk = 0;

  // High confidence but still correcting = over-correction risk
  if (assessment.overallConfidence > 0.6) risk += 0.3;
  if (assessment.overallConfidence > 0.7) risk += 0.2;

  // Multiple prior correction attempts increase risk
  risk += priorAttempts * 0.15;

  // If linguistic confidence is high but factual risk is also high,
  // the model might be confidently wrong — correction is warranted
  if (assessment.linguisticConfidence > 0.7 && assessment.knowledgeConfidence < 0.5) {
    risk -= 0.2;
  }

  return Math.max(0, Math.min(1, risk));
}

// ─── Recommendation Generation ───

function generateRecommendations(
  action: string,
  assessment: IoEConfidenceAssessment,
  corrections: IoECorrection[],
  overCorrectionRisk: number
): string[] {
  const recs: string[] = [];

  switch (action) {
    case "accept":
      recs.push("Response confidence is high. Accepting without correction.");
      break;
    case "correct":
      recs.push(
        `Response confidence is low (${assessment.overallConfidence.toFixed(2)}). ${corrections.length} correction(s) suggested.`
      );
      break;
    case "escalate":
      recs.push(
        "Confidence is ambiguous after multiple correction attempts. Escalating to human review."
      );
      break;
  }

  if (overCorrectionRisk > 0.5) {
    recs.push(
      `Warning: over-correction risk is ${(overCorrectionRisk * 100).toFixed(0)}%. Verify corrections don't degrade accuracy.`
    );
  }

  if (assessment.knowledgeConfidence < 0.4) {
    recs.push(
      "High factual risk: response contains many verifiable claims (dates, names, numbers). Manual verification recommended."
    );
  }

  if (assessment.reasoningConfidence < 0.5) {
    recs.push(
      "Internal contradictions detected within the response. Self-consistency is low."
    );
  }

  return recs;
}

// ─── Escalation Questions ───

function generateEscalationQuestions(
  response: string,
  question: string,
  assessment: IoEConfidenceAssessment
): string[] {
  const questions: string[] = [];

  if (assessment.knowledgeConfidence < 0.5) {
    questions.push("Can you verify the factual claims in this response against a trusted source?");
  }
  if (assessment.reasoningConfidence < 0.5) {
    questions.push("Does the reasoning in this response contain any logical inconsistencies?");
  }
  if (question) {
    questions.push(`Does this response adequately address: "${truncate(question, 80)}"?`);
  }
  if (questions.length === 0) {
    questions.push("Please review this response for accuracy and completeness.");
  }

  return questions;
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

function truncate(text: string, maxLen = 60): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
