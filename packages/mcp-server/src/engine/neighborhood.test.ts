import { describe, it, expect } from "vitest";
import { checkNeighborhoodConsistency } from "./neighborhood.js";

describe("checkNeighborhoodConsistency", () => {
  it("returns a result with all perturbation types", () => {
    const result = checkNeighborhoodConsistency(
      "What is the capital of France?",
      "The capital of France is Paris. Paris is located in northern France and is the largest city in the country.",
      ["Paris is the capital of France"]
    );

    expect(result.perturbations).toHaveLength(5);
    const types = result.perturbations.map(p => p.type);
    expect(types).toContain("paraphrase");
    expect(types).toContain("implication");
    expect(types).toContain("negation");
    expect(types).toContain("thematic_shift");
    expect(types).toContain("specificity_change");
  });

  it("scores robust knowledge higher than brittle patterns", () => {
    const robustResult = checkNeighborhoodConsistency(
      "What is water composed of?",
      "Water is composed of hydrogen and oxygen atoms, specifically two hydrogen atoms and one oxygen atom forming H2O. This is a fundamental fact in chemistry.",
      ["Water is H2O", "Water contains hydrogen and oxygen"]
    );

    const brittleResult = checkNeighborhoodConsistency(
      "What is the meaning of life?",
      "Maybe it could be 42 perhaps, or possibly something else entirely, I'm not sure.",
      []
    );

    expect(robustResult.ncbScore).toBeGreaterThan(brittleResult.ncbScore);
  });

  it("classifies verdict correctly", () => {
    const result = checkNeighborhoodConsistency(
      "What programming language is used here?",
      "TypeScript is the primary language used in this project. It provides static type checking and modern JavaScript features.",
      ["TypeScript is used", "The project uses TypeScript"]
    );

    expect(["robust", "brittle", "mixed"]).toContain(result.verdict);
  });

  it("identifies brittle and robust areas", () => {
    const result = checkNeighborhoodConsistency(
      "Describe the project structure",
      "The project is a monorepo with multiple packages including a server and frontend.",
      []
    );

    expect(result.brittleAreas).toBeInstanceOf(Array);
    expect(result.robustAreas).toBeInstanceOf(Array);
    expect(result.brittleAreas.length + result.robustAreas.length).toBe(5);
  });

  it("computes genuine knowledge confidence", () => {
    const result = checkNeighborhoodConsistency(
      "What is 2 + 2?",
      "2 + 2 equals 4. This is a basic arithmetic fact.",
      ["2 + 2 = 4"]
    );

    expect(result.genuineKnowledgeConfidence).toBeGreaterThanOrEqual(0);
    expect(result.genuineKnowledgeConfidence).toBeLessThanOrEqual(1);
  });

  it("provides recommendations", () => {
    const result = checkNeighborhoodConsistency(
      "Tell me about something obscure",
      "I think maybe it could be related to something, possibly, but I'm not really sure about the details.",
      []
    );

    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});
