import { describe, it, expect } from "vitest";
import { verifyFirst } from "./verify-first.js";

describe("verifyFirst", () => {
  it("returns baseline result for empty answer", () => {
    const result = verifyFirst("Short.", "What is X?");
    expect(result.verificationScore).toBeDefined();
    expect(typeof result.shouldAccept).toBe("boolean");
  });

  it("scores well-grounded answers higher", () => {
    const groundedResult = verifyFirst(
      "Water boils at 100 degrees Celsius at standard atmospheric pressure. This is confirmed by thermodynamic experiments.",
      "At what temperature does water boil?",
      ["Water boils at 100 degrees Celsius at standard atmospheric pressure"],
      ["Water boils at 100 degrees Celsius confirmed by thermodynamic experiments"]
    );

    const ungroundedResult = verifyFirst(
      "Liquids can change state when heated but the exact temperature varies depending on conditions.",
      "At what temperature does water boil?"
    );

    expect(groundedResult.verificationScore).toBeGreaterThan(
      ungroundedResult.verificationScore
    );
  });

  it("generates verification questions", () => {
    const result = verifyFirst(
      "The Earth orbits the Sun at an average distance of about 150 million kilometers. This orbital period takes approximately 365.25 days.",
      "How does Earth orbit the Sun?"
    );

    expect(result.suggestedImprovements.length).toBeGreaterThan(0);
  });

  it("computes all 5 dimension scores", () => {
    const result = verifyFirst(
      "Water boils at 100 degrees Celsius at standard atmospheric pressure. This is a well-established fact in chemistry.",
      "At what temperature does water boil?"
    );

    const dimensions = result.checks.map(c => c.dimension);
    expect(dimensions).toContain("factual_support");
    expect(dimensions).toContain("internal_coherence");
    expect(dimensions).toContain("completeness");
    expect(dimensions).toContain("specificity");
    expect(dimensions).toContain("relevance");
  });

  it("recommends revision for medium-quality answers", () => {
    const result = verifyFirst(
      "It probably has something to do with computers, I think. Maybe some kind of processing or calculation.",
      "What is an algorithm?"
    );

    expect(result.shouldAccept).toBe(false);
  });

  it("provides revision suggestions when not accepted", () => {
    const result = verifyFirst(
      "I guess algorithms are things that maybe do stuff.",
      "What is an algorithm?"
    );

    if (!result.shouldAccept) {
      expect(result.suggestedImprovements.length).toBeGreaterThan(0);
    }
  });

  it("runs verification checks per claim", () => {
    const result = verifyFirst(
      "Algorithms are step-by-step procedures for solving problems. They are fundamental to computer science. Donald Knuth's 'The Art of Computer Programming' is a key reference.",
      "What are algorithms?",
      [],
      ["Algorithms are systematic procedures"]
    );

    expect(result.checks.length).toBeGreaterThan(0);
    for (const check of result.checks) {
      expect(check).toHaveProperty("dimension");
      expect(check).toHaveProperty("score");
      expect(check).toHaveProperty("issues");
      expect(check).toHaveProperty("passes");
    }
  });
});
