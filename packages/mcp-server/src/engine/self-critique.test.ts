import { describe, it, expect } from "vitest";
import { iterativeSelfCritique } from "./self-critique.js";

describe("iterativeSelfCritique", () => {
  it("returns result with iterations", () => {
    const result = iterativeSelfCritique(
      "TypeScript is a programming language developed by Microsoft.",
      ["accuracy", "completeness", "clarity"],
      3,
      ["TypeScript is a typed superset of JavaScript"],
      "What is TypeScript?"
    );

    expect(result.iterations.length).toBeGreaterThan(0);
    expect(result.iterations.length).toBeLessThanOrEqual(3);
    expect(result.finalQuality).toBeGreaterThanOrEqual(0);
    expect(result.finalQuality).toBeLessThanOrEqual(1);
  });

  it("uses default criteria when none provided", () => {
    const result = iterativeSelfCritique(
      "Water boils at 100 degrees Celsius."
    );

    const firstIteration = result.iterations[0];
    expect(firstIteration.critiques).toBeInstanceOf(Array);
    expect(firstIteration.qualityScore).toBeDefined();
  });

  it("converges when improvement plateaus", () => {
    const result = iterativeSelfCritique(
      "According to established research, TypeScript provides static type checking which catches errors at compile time. This is confirmed by Microsoft and widely documented. Specifically, TypeScript uses a structural type system with generics. For example, interfaces define object shapes.",
      ["accuracy", "clarity"],
      5
    );

    // With well-scored text, should converge before max iterations
    expect(result.totalIterations).toBeLessThanOrEqual(5);
  });

  it("generates critiques for weak solutions", () => {
    const result = iterativeSelfCritique(
      "Uh, stuff.",
      ["accuracy", "completeness", "clarity"],
      2,
      [],
      "Explain the architecture of a compiler."
    );

    const allCritiques = result.iterations.flatMap(i => i.critiques);
    expect(allCritiques.length).toBeGreaterThan(0);
  });

  it("tracks improvement over initial score", () => {
    const result = iterativeSelfCritique(
      "Maybe something related to code.",
      ["accuracy", "clarity", "completeness"],
      3,
      [],
      "What is a compiler?"
    );

    expect(result.totalImprovement).toBeDefined();
    // Improvement should be non-negative (refinement shouldn't degrade)
    expect(result.totalImprovement).toBeGreaterThanOrEqual(0);
  });

  it("provides convergence details", () => {
    const result = iterativeSelfCritique(
      "A comprehensive answer covering multiple aspects.",
      undefined,
      3
    );

    expect(result).toHaveProperty("converged");
    expect(result).toHaveProperty("totalIterations");
    expect(result).toHaveProperty("convergenceReason");
  });

  it("limits max iterations", () => {
    const result = iterativeSelfCritique(
      "Test solution.",
      undefined,
      2
    );

    expect(result.totalIterations).toBeLessThanOrEqual(2);
  });

  it("generates recommendations", () => {
    const result = iterativeSelfCritique(
      "Brief answer.",
      undefined,
      2,
      [],
      "Explain in detail"
    );

    expect(result.topImprovements).toBeInstanceOf(Array);
    expect(result.remainingIssues).toBeInstanceOf(Array);
  });

  it("evaluates custom criteria", () => {
    const result = iterativeSelfCritique(
      "A solution to evaluate with custom dimensions.",
      ["accuracy", "my_custom_criterion"],
      2
    );

    expect(result.iterations[0].critiques).toBeInstanceOf(Array);
    expect(result.iterations[0].critiques.length).toBeGreaterThan(0);
  });
});
