import type {
  LogicalConsistencyResult,
  LogicalTransformation,
} from "../state/types.js";

/**
 * Logical Consistency under Transformations — inspired by
 * "SELFCHECKGPT: Zero-Resource Black-Box Hallucination Detection" and
 * "Chain-of-Verification Reduces Hallucination in Large Language Models".
 *
 * Evaluates whether a set of factual claims maintains logical consistency
 * when subjected to standard transformations:
 *
 *   1. Negation    — "X is Y" ↔ "X is not Y" should not both hold
 *   2. Conjunction — "X is A" ∧ "X is B" must be jointly possible
 *   3. Modus Ponens — "if A then B" ∧ "A" → must accept "B"
 *   4. Transitivity — "A > B" ∧ "B > C" → "A > C"
 *   5. Consistency  — no two claims should formally contradict
 *
 * The trust level framework:
 *   high   — all transformations pass, no contradictions
 *   medium — minor issues, some transformations fail
 *   low    — structural contradictions detected
 */

// ─── Relation Patterns for Extraction ───

const EQUALITY_PATTERNS = [
  /\b(\w[\w\s]+?)\s+(?:is|are|was|were)\s+(?:a|an|the)?\s*(\w[\w\s]+?)(?:\.|,|;|$)/i,
  /\b(\w[\w\s]+?)\s+(?:=|equals|equal to)\s+(\w[\w\s]+?)(?:\.|,|;|$)/i,
];

const COMPARISON_PATTERNS = [
  /\b(\w[\w\s]+?)\s+(?:is|are)\s+(?:greater|larger|bigger|higher|more|faster|better)\s+than\s+(\w[\w\s]+?)(?:\.|,|;|$)/i,
  /\b(\w[\w\s]+?)\s+(?:is|are)\s+(?:less|smaller|lower|slower|worse)\s+than\s+(\w[\w\s]+?)(?:\.|,|;|$)/i,
  /\b(\w[\w\s]+?)\s+(?:exceeds?|surpass(?:es)?|outperform)\s+(\w[\w\s]+?)(?:\.|,|;|$)/i,
];

const IMPLICATION_PATTERNS = [
  /\b(?:if|when|whenever)\s+(.+?)\s*[,;]\s*(?:then)?\s*(.+?)(?:\.|$)/i,
  /\b(.+?)\s+(?:implies|means|leads to|causes|results in)\s+(.+?)(?:\.|,|;|$)/i,
  /\b(?:because|since)\s+(.+?)\s*[,;]\s*(.+?)(?:\.|$)/i,
];

const NEGATION_PATTERN = /\b(?:not|no|don't|doesn't|isn't|aren't|wasn't|weren't|never|cannot|can't|won't)\b/i;

// ─── Core API ───

/**
 * Check logical consistency of a set of claims against known facts.
 * Applies formal transformations and detects contradictions.
 */
export function checkLogicalConsistency(
  claims: string[],
  knownFacts: string[] = []
): LogicalConsistencyResult {
  if (claims.length === 0) {
    return {
      consistencyScore: 1.0,
      transformations: [],
      consistentCount: 0,
      inconsistentCount: 0,
      inconsistencies: [],
      trustworthyWithoutVerification: true,
      trustLevel: "high",
      recommendations: ["No claims to analyze for logical consistency."],
    };
  }

  const allStatements = [...claims, ...knownFacts];
  const transformations: LogicalTransformation[] = [];
  const inconsistencies: Array<{ claim1: string; claim2: string; relationship: string; explanation: string }> = [];
  let consistentPairs = 0;
  let inconsistentPairs = 0;

  // 1. Negation consistency
  const negationResults = checkNegationConsistency(claims, knownFacts);
  transformations.push(...negationResults.transformations);
  inconsistencies.push(...negationResults.inconsistencies);
  consistentPairs += negationResults.consistent;
  inconsistentPairs += negationResults.inconsistent;

  // 2. Conjunction consistency
  const conjunctionResults = checkConjunctionConsistency(claims);
  transformations.push(...conjunctionResults.transformations);
  inconsistencies.push(...conjunctionResults.inconsistencies);
  consistentPairs += conjunctionResults.consistent;
  inconsistentPairs += conjunctionResults.inconsistent;

  // 3. Modus ponens
  const mpResults = checkModusPonens(allStatements);
  transformations.push(...mpResults.transformations);
  inconsistencies.push(...mpResults.inconsistencies);
  consistentPairs += mpResults.consistent;
  inconsistentPairs += mpResults.inconsistent;

  // 4. Transitivity
  const transResults = checkTransitivity(allStatements);
  transformations.push(...transResults.transformations);
  inconsistencies.push(...transResults.inconsistencies);
  consistentPairs += transResults.consistent;
  inconsistentPairs += transResults.inconsistent;

  // 5. Direct consistency check
  const directResults = checkDirectConsistency(claims, knownFacts);
  transformations.push(...directResults.transformations);
  inconsistencies.push(...directResults.inconsistencies);
  consistentPairs += directResults.consistent;
  inconsistentPairs += directResults.inconsistent;

  const totalPairs = consistentPairs + inconsistentPairs;
  const consistencyScore = totalPairs > 0
    ? round(consistentPairs / totalPairs)
    : 1.0;

  let trustLevel: "high" | "medium" | "low";
  if (consistencyScore >= 0.85 && inconsistencies.length === 0) {
    trustLevel = "high";
  } else if (consistencyScore >= 0.6 && inconsistencies.length <= 1) {
    trustLevel = "medium";
  } else {
    trustLevel = "low";
  }

  const recommendations = generateRecommendations(
    trustLevel, inconsistencies, transformations
  );

  return {
    consistencyScore,
    transformations,
    consistentCount: consistentPairs,
    inconsistentCount: inconsistentPairs,
    inconsistencies,
    trustworthyWithoutVerification: trustLevel === "high",
    trustLevel,
    recommendations,
  };
}

// ─── Transformation Checks ───

interface TransformResult {
  transformations: LogicalTransformation[];
  inconsistencies: Array<{ claim1: string; claim2: string; relationship: string; explanation: string }>;
  consistent: number;
  inconsistent: number;
}

function checkNegationConsistency(claims: string[], facts: string[]): TransformResult {
  const transformations: LogicalTransformation[] = [];
  const inconsistencies: Array<{ claim1: string; claim2: string; relationship: string; explanation: string }> = [];
  let consistent = 0;
  let inconsistent = 0;

  for (let i = 0; i < claims.length; i++) {
    const isNegated = NEGATION_PATTERN.test(claims[i]);

    for (let j = i + 1; j < claims.length; j++) {
      const jNegated = NEGATION_PATTERN.test(claims[j]);

      // If one is negated and they share topic, potential contradiction
      if (isNegated !== jNegated) {
        const iTopics = extractTopicWords(claims[i]);
        const jTopics = extractTopicWords(claims[j]);
        const shared = iTopics.filter(t => jTopics.includes(t));

        if (shared.length >= 2) {
          // Strip negation and compare
          const iStripped = stripNegation(claims[i]);
          const jStripped = stripNegation(claims[j]);
          const similarity = computeTokenSimilarity(iStripped, jStripped);

          if (similarity > 0.5) {
            inconsistent++;
            inconsistencies.push({
              claim1: claims[i],
              claim2: claims[j],
              relationship: "negation",
              explanation: `Negation contradiction: "${truncate(claims[i])}" vs "${truncate(claims[j])}"`,
            });
            transformations.push({
              type: "negation",
              original: claims[i],
              transformed: claims[j],
              expectedRelation: "consistent",
              actualRelation: "contradictory",
              isConsistent: false,
              confidence: Math.min(0.9, similarity),
            });
          } else {
            consistent++;
            transformations.push({
              type: "negation",
              original: claims[i],
              transformed: claims[j],
              expectedRelation: "consistent",
              actualRelation: "consistent",
              isConsistent: true,
              confidence: 0.8,
            });
          }
        }
      }
    }

    // Check against known facts
    for (const fact of facts) {
      const factNegated = NEGATION_PATTERN.test(fact);
      if (isNegated !== factNegated) {
        const cTopics = extractTopicWords(claims[i]);
        const fTopics = extractTopicWords(fact);
        const shared = cTopics.filter(t => fTopics.includes(t));

        if (shared.length >= 2) {
          inconsistent++;
          inconsistencies.push({
            claim1: claims[i],
            claim2: fact,
            relationship: "negation",
            explanation: `Claim "${truncate(claims[i])}" contradicts known fact "${truncate(fact)}"`,
          });
          transformations.push({
            type: "negation",
            original: claims[i],
            transformed: fact,
            expectedRelation: "consistent",
            actualRelation: "contradictory",
            isConsistent: false,
            confidence: 0.8,
          });
        }
      }
    }
  }

  return { transformations, inconsistencies, consistent, inconsistent };
}

function checkConjunctionConsistency(claims: string[]): TransformResult {
  const transformations: LogicalTransformation[] = [];
  const inconsistencies: Array<{ claim1: string; claim2: string; relationship: string; explanation: string }> = [];
  let consistent = 0;
  let inconsistent = 0;

  // Check if any pair of claims about the same subject has incompatible predicates
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const iRelations = extractRelations(claims[i]);
      const jRelations = extractRelations(claims[j]);

      for (const iRel of iRelations) {
        for (const jRel of jRelations) {
          // Same subject, different predicate
          if (
            computeTokenSimilarity(iRel.subject, jRel.subject) > 0.6 &&
            computeTokenSimilarity(iRel.predicate, jRel.predicate) < 0.3
          ) {
            // Might be complementary (fine) or contradictory (bad)
            const isContradictory = arePredicatesContradictory(iRel.predicate, jRel.predicate);

            if (isContradictory) {
              inconsistent++;
              inconsistencies.push({
                claim1: claims[i],
                claim2: claims[j],
                relationship: "conjunction",
                explanation: `Conjunction conflict: "${truncate(claims[i])}" ∧ "${truncate(claims[j])}" has contradictory predicates`,
              });
              transformations.push({
                type: "conjunction",
                original: `${claims[i]} ∧ ${claims[j]}`,
                transformed: `Subject "${iRel.subject}" cannot be both "${iRel.predicate}" and "${jRel.predicate}"`,
                expectedRelation: "consistent",
                actualRelation: "contradictory",
                isConsistent: false,
                confidence: 0.8,
              });
            } else {
              consistent++;
            }
          }
        }
      }
    }
  }

  if (transformations.length === 0 && claims.length > 1) {
    consistent++;
    transformations.push({
      type: "conjunction",
      original: `${claims.length} claims`,
      transformed: "Joint evaluation",
      expectedRelation: "consistent",
      actualRelation: "consistent",
      isConsistent: true,
      confidence: 0.8,
    });
  }

  return { transformations, inconsistencies, consistent, inconsistent };
}

function checkModusPonens(statements: string[]): TransformResult {
  const transformations: LogicalTransformation[] = [];
  const inconsistencies: Array<{ claim1: string; claim2: string; relationship: string; explanation: string }> = [];
  let consistent = 0;
  let inconsistent = 0;

  // Find if→then patterns and check if consequences hold
  for (const stmt of statements) {
    for (const pattern of IMPLICATION_PATTERNS) {
      const match = stmt.match(pattern);
      if (!match) continue;

      const antecedent = match[1].trim().toLowerCase();
      const consequent = match[2].trim().toLowerCase();

      // Check if antecedent is claimed as true in other statements
      const antecedentHeld = statements.some(s =>
        s !== stmt && computeTokenSimilarity(s.toLowerCase(), antecedent) > 0.4
      );

      if (antecedentHeld) {
        // Check if consequent is also present
        const consequentHeld = statements.some(s =>
          s !== stmt && computeTokenSimilarity(s.toLowerCase(), consequent) > 0.3
        );

        if (consequentHeld) {
          consistent++;
          transformations.push({
            type: "implication",
            original: `If "${truncate(antecedent)}" then "${truncate(consequent)}"`,
            transformed: `Antecedent holds → consequent is present`,
            expectedRelation: "consistent",
            actualRelation: "consistent",
            isConsistent: true,
            confidence: 0.8,
          });
        } else {
          // Check if consequent is explicitly denied
          const consequentDenied = statements.some(s => {
            const sLower = s.toLowerCase();
            return NEGATION_PATTERN.test(s) &&
              computeTokenSimilarity(sLower, consequent) > 0.3;
          });

          if (consequentDenied) {
            inconsistent++;
            inconsistencies.push({
              claim1: `If "${truncate(antecedent)}" then "${truncate(consequent)}"`,
              claim2: `"${truncate(consequent)}" is denied`,
              relationship: "implication",
              explanation: `Modus ponens violated: "${truncate(antecedent)}" is claimed, implying "${truncate(consequent)}", but consequent is denied`,
            });
            transformations.push({
              type: "implication",
              original: `If "${truncate(antecedent)}" then "${truncate(consequent)}"`,
              transformed: "Antecedent holds but consequent is denied",
              expectedRelation: "consistent",
              actualRelation: "contradictory",
              isConsistent: false,
              confidence: 0.8,
            });
          }
        }
      }
    }
  }

  return { transformations, inconsistencies, consistent, inconsistent };
}

function checkTransitivity(statements: string[]): TransformResult {
  const transformations: LogicalTransformation[] = [];
  const inconsistencies: Array<{ claim1: string; claim2: string; relationship: string; explanation: string }> = [];
  let consistent = 0;
  let inconsistent = 0;

  // Extract comparison relations and check transitivity
  const comparisons: { a: string; b: string; relation: string }[] = [];

  for (const stmt of statements) {
    for (const pattern of COMPARISON_PATTERNS) {
      const match = stmt.match(pattern);
      if (!match) continue;
      comparisons.push({
        a: match[1].trim().toLowerCase(),
        b: match[2].trim().toLowerCase(),
        relation: stmt.includes("less") || stmt.includes("smaller") ||
                  stmt.includes("lower") || stmt.includes("slower") ? "less" : "greater",
      });
    }
  }

  // Check transitive closure: if A > B and B > C, then A > C
  for (let i = 0; i < comparisons.length; i++) {
    for (let j = 0; j < comparisons.length; j++) {
      if (i === j) continue;

      const { a: aI, b: bI, relation: relI } = comparisons[i];
      const { a: aJ, b: bJ, relation: relJ } = comparisons[j];

      // Check if bI ≈ aJ (chain)
      if (computeTokenSimilarity(bI, aJ) > 0.7 && relI === relJ) {
        // A > B and B > C → check if A > C is consistent
        const reverseExists = comparisons.some(
          c => computeTokenSimilarity(c.a, bJ) > 0.7 &&
               computeTokenSimilarity(c.b, aI) > 0.7 &&
               c.relation === relI
        );

        if (reverseExists) {
          inconsistent++;
          inconsistencies.push({
            claim1: `${aI} ${relI} ${bI} ${relI} ${bJ}`,
            claim2: `${bJ} ${relI} ${aI}`,
            relationship: "transitivity",
            explanation: `Transitivity violation: "${aI}" ${relI} "${bI}" ${relI} "${bJ}", but "${bJ}" ${relI} "${aI}" also claimed`,
          });
          transformations.push({
            type: "implication",
            original: `${aI} ${relI} ${bI} ${relI} ${bJ}`,
            transformed: `${bJ} ${relI} ${aI} (cycle detected)`,
            expectedRelation: "consistent",
            actualRelation: "contradictory",
            isConsistent: false,
            confidence: 0.8,
          });
        } else {
          consistent++;
          transformations.push({
            type: "implication",
            original: `${aI} ${relI} ${bI}; ${aJ} ${relI} ${bJ}`,
            transformed: `Transitive: ${aI} ${relI} ${bJ}`,
            expectedRelation: "consistent",
            actualRelation: "consistent",
            isConsistent: true,
            confidence: 0.8,
          });
        }
      }
    }
  }

  return { transformations, inconsistencies, consistent, inconsistent };
}

function checkDirectConsistency(claims: string[], facts: string[]): TransformResult {
  const transformations: LogicalTransformation[] = [];
  const inconsistencies: Array<{ claim1: string; claim2: string; relationship: string; explanation: string }> = [];
  let consistent = 0;
  let inconsistent = 0;

  for (const claim of claims) {
    for (const fact of facts) {
      const similarity = computeTokenSimilarity(claim.toLowerCase(), fact.toLowerCase());
      if (similarity < 0.3) continue; // Unrelated

      const claimTopics = extractTopicWords(claim);
      const factTopics = extractTopicWords(fact);
      const shared = claimTopics.filter(t => factTopics.includes(t));

      if (shared.length < 2) continue;

      // Check if claim aligns or contradicts the fact
      const claimNeg = NEGATION_PATTERN.test(claim);
      const factNeg = NEGATION_PATTERN.test(fact);

      if (claimNeg !== factNeg) {
        inconsistent++;
        inconsistencies.push({
          claim1: claim,
          claim2: fact,
          relationship: "consistency",
          explanation: `Claim "${truncate(claim)}" contradicts fact "${truncate(fact)}"`,
        });
        transformations.push({
          type: "biconditional",
          original: claim,
          transformed: fact,
          expectedRelation: "consistent",
          actualRelation: "contradictory",
          isConsistent: false,
          confidence: Math.min(0.9, similarity),
        });
      } else if (similarity > 0.5) {
        consistent++;
        transformations.push({
          type: "biconditional",
          original: claim,
          transformed: fact,
          expectedRelation: "consistent",
          actualRelation: "consistent",
          isConsistent: true,
          confidence: Math.min(0.9, similarity),
        });
      }
    }
  }

  return { transformations, inconsistencies, consistent, inconsistent };
}

// ─── Relation Extraction ───

interface Relation {
  subject: string;
  predicate: string;
}

function extractRelations(text: string): Relation[] {
  const relations: Relation[] = [];
  for (const pattern of EQUALITY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      relations.push({
        subject: match[1].trim().toLowerCase(),
        predicate: match[2].trim().toLowerCase(),
      });
    }
  }
  return relations;
}

function arePredicatesContradictory(a: string, b: string): boolean {
  // Check for antonym pairs
  const antonymPairs = [
    ["true", "false"], ["correct", "incorrect"], ["right", "wrong"],
    ["valid", "invalid"], ["possible", "impossible"], ["complete", "incomplete"],
    ["present", "absent"], ["increase", "decrease"], ["positive", "negative"],
    ["before", "after"], ["inside", "outside"], ["above", "below"],
    ["more", "less"], ["greater", "smaller"], ["higher", "lower"],
    ["faster", "slower"], ["better", "worse"],
  ];

  const aTokens = tokenize(a);
  const bTokens = tokenize(b);

  for (const [x, y] of antonymPairs) {
    if (
      (aTokens.includes(x) && bTokens.includes(y)) ||
      (aTokens.includes(y) && bTokens.includes(x))
    ) {
      return true;
    }
  }

  return false;
}

// ─── Recommendation Generation ───

function generateRecommendations(
  trustLevel: string,
  inconsistencies: Array<{ claim1: string; claim2: string; relationship: string; explanation: string }>,
  transformations: LogicalTransformation[]
): string[] {
  const recs: string[] = [];

  if (trustLevel === "low") {
    recs.push(
      "Low trust level detected. Claims contain structural contradictions that undermine reliability."
    );
  }

  if (inconsistencies.length > 0) {
    recs.push(
      `${inconsistencies.length} contradiction(s) found. Resolve these before relying on the claims.`
    );
  }

  const failedImplication = transformations.filter(t => t.type === "implication" && !t.isConsistent);
  if (failedImplication.length > 0) {
    recs.push(
      "Logical implication violations detected — the model claims premises but denies their necessary conclusions."
    );
    if (failedImplication.some(t => t.transformed.includes("cycle"))) {
      recs.push(
        "Circular comparison chains detected — rankings or orderings are logically impossible."
      );
    }
  }

  if (recs.length === 0) {
    recs.push("Claims pass all logical consistency checks at the current inspection depth.");
  }

  return recs;
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

function stripNegation(text: string): string {
  return text
    .replace(/\b(?:not|no|don't|doesn't|isn't|aren't|wasn't|weren't|never|cannot|can't|won't)\s*/gi, "")
    .trim();
}

function computeTokenSimilarity(a: string, b: string): number {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 && bTokens.size === 0) return 1;
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  const intersection = [...aTokens].filter(t => bTokens.has(t)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union > 0 ? intersection / union : 0;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
}

function truncate(text: string, maxLen = 80): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
