import type { DepthResult, DepthSection } from "../state/types.js";

/**
 * Depth Quality Monitor — inspired by arXiv:2512.20662
 * (Quantifying Laziness, Decoding Suboptimality, and Context Degradation).
 *
 * Detects the "breadth-over-depth" laziness pattern: LLMs generating many
 * topic headers with minimal elaboration per section. This is the primary
 * cause of shallow output in long-form research generation.
 *
 * Key metrics:
 *   - Section detection via heading/structure heuristics
 *   - Words per section (depth signal)
 *   - Detail density (specific terms, numbers, examples)
 *   - Breadth vs depth ratio (laziness indicator)
 */

const MIN_DEPTH_WORDS = 80;
const MIN_DEPTH_SENTENCES = 3;
const DETAIL_TERM_PATTERNS = [
  /\b\d+\.?\d*%?\b/,                     // Numbers and percentages
  /\b(?:e\.g\.|i\.e\.|for example|for instance|such as|specifically)\b/i,
  /\b(?:because|therefore|consequently|thus|hence|as a result)\b/i,
  /\b(?:according to|research shows|studies indicate|data suggests)\b/i,
  /\b(?:first|second|third|finally|moreover|furthermore|additionally)\b/i,
  /\b(?:however|although|despite|nevertheless|conversely|in contrast)\b/i,
  /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/,  // Proper nouns (named concepts)
];

/**
 * Analyze the depth quality of assistant output.
 * Returns a DepthResult with section-level analysis and elaboration directives.
 */
export function analyzeDepth(
  assistantOutput: string,
  minDepthWords: number = MIN_DEPTH_WORDS,
  minDepthSentences: number = MIN_DEPTH_SENTENCES
): DepthResult {
  if (!assistantOutput || assistantOutput.trim().length === 0) {
    return {
      depthScore: 1.0,
      breadthScore: 0,
      isLazy: false,
      sectionCount: 0,
      avgWordsPerSection: 0,
      shallowSections: [],
      elaborationDirectives: [],
      recommendation: "No output to analyze.",
    };
  }

  const sections = detectSections(assistantOutput);

  if (sections.length === 0) {
    // No sections detected — treat entire output as a single section
    const totalWords = countWords(assistantOutput);
    const totalSentences = countSentences(assistantOutput);
    const density = computeDetailDensity(assistantOutput);

    return {
      depthScore: totalWords >= minDepthWords ? round(Math.min(1, totalWords / (minDepthWords * 3))) : round(totalWords / minDepthWords),
      breadthScore: 0,
      isLazy: false,
      sectionCount: 1,
      avgWordsPerSection: totalWords,
      shallowSections: [],
      elaborationDirectives: totalWords < minDepthWords
        ? ["The entire response needs more elaboration. Provide specific examples, data points, and deeper analysis."]
        : [],
      recommendation: totalWords < minDepthWords
        ? "Output lacks depth. Elaborate with specific details, examples, and analysis."
        : "Output depth is acceptable for a single-section response.",
    };
  }

  // Analyze each section
  const analyzedSections: DepthSection[] = sections.map(section => {
    const wordCount = countWords(section.content);
    const sentenceCount = countSentences(section.content);
    const detailDensity = computeDetailDensity(section.content);
    const isShallow = wordCount < minDepthWords || sentenceCount < minDepthSentences;

    return {
      heading: section.heading,
      wordCount,
      sentenceCount,
      detailDensity,
      isShallow,
    };
  });

  const shallowSections = analyzedSections.filter(s => s.isShallow);
  const totalWords = analyzedSections.reduce((sum, s) => sum + s.wordCount, 0);
  const avgWordsPerSection = totalWords / analyzedSections.length;

  // Breadth score: how many topics are covered (normalized)
  const breadthScore = round(Math.min(1, analyzedSections.length / 10));

  // Depth score: composite of per-section depth
  const sectionDepthScores = analyzedSections.map(s => {
    const wordScore = Math.min(1, s.wordCount / (minDepthWords * 2));
    const sentenceScore = Math.min(1, s.sentenceCount / (minDepthSentences * 2));
    const densityScore = s.detailDensity;
    return 0.4 * wordScore + 0.3 * sentenceScore + 0.3 * densityScore;
  });
  const depthScore = round(
    sectionDepthScores.reduce((a, b) => a + b, 0) / sectionDepthScores.length
  );

  // Laziness detection: high breadth + low depth = lazy
  const isLazy = breadthScore > 0.4 && depthScore < 0.5 && shallowSections.length > analyzedSections.length * 0.4;

  // Generate elaboration directives
  const elaborationDirectives: string[] = [];
  for (const section of shallowSections.slice(0, 8)) {
    const needs: string[] = [];
    if (section.wordCount < minDepthWords) {
      needs.push(`expand from ${section.wordCount} to at least ${minDepthWords} words`);
    }
    if (section.sentenceCount < minDepthSentences) {
      needs.push(`add more explanatory sentences (currently ${section.sentenceCount})`);
    }
    if (section.detailDensity < 0.3) {
      needs.push("include specific examples, data points, or evidence");
    }
    elaborationDirectives.push(
      `Section "${section.heading}": ${needs.join("; ")}.`
    );
  }

  // Overall recommendation
  let recommendation: string;
  if (isLazy) {
    recommendation =
      `Output exhibits laziness pattern: ${analyzedSections.length} sections detected but ${shallowSections.length} are shallow ` +
      `(avg ${Math.round(avgWordsPerSection)} words/section). ` +
      `Each section needs deeper elaboration with specific details, examples, data, and analysis. ` +
      `Do NOT add more topics — instead, deeply elaborate each existing section.`;
  } else if (shallowSections.length > 0) {
    recommendation =
      `${shallowSections.length} of ${analyzedSections.length} sections need more depth. ` +
      `Focus elaboration on: ${shallowSections.map(s => `"${s.heading}"`).join(", ")}.`;
  } else {
    recommendation = "Output depth is satisfactory across all sections.";
  }

  return {
    depthScore,
    breadthScore,
    isLazy,
    sectionCount: analyzedSections.length,
    avgWordsPerSection: round(avgWordsPerSection),
    shallowSections,
    elaborationDirectives,
    recommendation,
  };
}

// ─── Section Detection ───

interface RawSection {
  heading: string;
  content: string;
}

/**
 * Detect content sections using heading patterns.
 * Supports: markdown headings, numbered sections, bold headings, bullet outlines.
 */
function detectSections(text: string): RawSection[] {
  const lines = text.split("\n");
  const sections: RawSection[] = [];
  let currentHeading = "";
  let currentContent: string[] = [];

  const headingPatterns = [
    /^#{1,4}\s+(.+)/,                           // Markdown headings: # Title, ## Subtitle
    /^(\d+\.)\s+\*?\*?(.+?)\*?\*?\s*$/,        // Numbered: 1. Title or 1. **Title**
    /^\*\*(.+?)\*\*\s*$/,                        // Bold only line: **Title**
    /^[-•]\s+\*?\*?(.+?)\*?\*?:?\s*$/,         // Bullet heading: - **Topic**: or • Topic
    /^([A-Z][A-Za-z\s]{3,50}):$/,               // Capitalized with colon: Topic Name:
  ];

  for (const line of lines) {
    let isHeading = false;
    let headingText = "";

    for (const pattern of headingPatterns) {
      const match = line.trim().match(pattern);
      if (match) {
        headingText = (match[2] || match[1]).replace(/\*\*/g, "").trim();
        if (headingText.length > 2 && headingText.length < 100) {
          isHeading = true;
          break;
        }
      }
    }

    if (isHeading) {
      // Save previous section
      if (currentHeading && currentContent.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join("\n").trim(),
        });
      }
      currentHeading = headingText;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentHeading && currentContent.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join("\n").trim(),
    });
  }

  return sections;
}

// ─── Metrics ───

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

function countSentences(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  return sentences.length;
}

/**
 * Compute detail density: ratio of "specific" content markers to total sentences.
 * High density = output uses examples, data, causal reasoning, references.
 */
function computeDetailDensity(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length === 0) return 0;

  let detailedSentences = 0;
  for (const sentence of sentences) {
    const hasDetail = DETAIL_TERM_PATTERNS.some(p => p.test(sentence));
    if (hasDetail) detailedSentences++;
  }

  return round(detailedSentences / sentences.length);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
