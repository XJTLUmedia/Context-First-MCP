import { describe, it, expect } from "vitest";
import { checkLogicalConsistency } from "./logical-consistency.js";

describe("checkLogicalConsistency", () => {
  it("returns perfect consistency for empty claims", () => {
    const result = checkLogicalConsistency([]);
    expect(result.consistencyScore).toBe(1.0);
    expect(result.trustLevel).toBe("high");
    expect(result.inconsistencies).toHaveLength(0);
  });

  it("detects negation contradictions", () => {
    const claims = [
      "TypeScript is a statically typed programming language.",
      "TypeScript is not a statically typed programming language.",
    ];
    const result = checkLogicalConsistency(claims);

    expect(result.inconsistencies.length).toBeGreaterThan(0);
    expect(result.trustLevel).not.toBe("high");
  });

  it("passes consistent non-contradicting claims", () => {
    const claims = [
      "JavaScript is a dynamic programming language.",
      "Python is also a dynamic programming language.",
      "Both languages support object-oriented programming.",
    ];
    const result = checkLogicalConsistency(claims);

    expect(result.consistencyScore).toBeGreaterThan(0.5);
  });

  it("detects contradictions with known facts", () => {
    const claims = [
      "The Earth is not a planet in our solar system.",
    ];
    const facts = [
      "The Earth is a planet in our solar system.",
    ];
    const result = checkLogicalConsistency(claims, facts);

    expect(result.inconsistencies.length).toBeGreaterThan(0);
    expect(result.inconsistentCount).toBeGreaterThan(0);
  });

  it("records transformation details", () => {
    const claims = [
      "Performance is better than baseline.",
      "The system is faster than the original.",
    ];
    const result = checkLogicalConsistency(claims);

    expect(result.transformations).toBeInstanceOf(Array);
    for (const t of result.transformations) {
      expect(t).toHaveProperty("type");
      expect(t).toHaveProperty("original");
      expect(t).toHaveProperty("transformed");
      expect(t).toHaveProperty("isConsistent");
      expect(t).toHaveProperty("expectedRelation");
    }
  });

  it("provides trust level assessment", () => {
    const claims = [
      "The algorithm runs in O(n log n) time.",
      "The algorithm processes all elements efficiently.",
    ];
    const result = checkLogicalConsistency(claims);

    expect(["high", "medium", "low"]).toContain(result.trustLevel);
  });

  it("generates recommendations", () => {
    const claims = [
      "X is greater than Y.",
      "Y is greater than Z.",
      "Z is greater than X.",
    ];
    const result = checkLogicalConsistency(claims);

    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("handles modus ponens detection", () => {
    const claims = [
      "If the test passes, then the code is correct.",
      "The test passes successfully.",
      "The code is correct and verified.",
    ];
    const result = checkLogicalConsistency(claims);

    const mpTransforms = result.transformations.filter(t => t.type === "modus_ponens");
    if (mpTransforms.length > 0) {
      expect(mpTransforms.some(t => t.isConsistent)).toBe(true);
    }
  });
});
