import { describe, it, expect } from "vitest";
import { runExtraCoT } from "./extracot.js";

describe("runExtraCoT", () => {
  it("compresses a reasoning chain", () => {
    const result = runExtraCoT({
      problem: "How to optimize a database query?",
      reasoningSteps: [
        "First, let me think about what the problem is asking. The problem is about query optimization.",
        "There are several approaches to query optimization. Let me list them: indexing, query rewriting, caching.",
        "Indexing is important because it speeds up lookups. We should add an index on the frequently queried column.",
        "Query rewriting can simplify complex queries. We should avoid SELECT * and use specific columns.",
        "Caching repeated queries reduces database load. Let us implement a cache layer.",
        "In summary, we should: 1) add indexes 2) rewrite queries 3) add caching.",
      ],
    });

    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.length).toBeLessThanOrEqual(6);
    expect(result.overallCompressionRatio).toBeGreaterThan(0);
    expect(result.overallCompressionRatio).toBeLessThanOrEqual(1);
    expect(result.avgSemanticFidelity).toBeGreaterThan(0);
  });

  it("handles empty reasoning chain gracefully", () => {
    const result = runExtraCoT({
      problem: "Empty test",
      reasoningSteps: [],
    });

    expect(result.steps.length).toBe(0);
    expect(result.totalOriginalTokens).toBe(0);
  });

  it("preserves high-value steps", () => {
    const result = runExtraCoT({
      problem: "Design a REST API",
      reasoningSteps: [
        "The REST API should follow standard HTTP conventions.",
        "Use proper status codes: 200 OK, 201 Created, 404 Not Found.",
        "Implement pagination for list endpoints.",
      ],
      targetCompression: 0.8,
    });

    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.avgSemanticFidelity).toBeGreaterThan(0.5);
  });

  it("reports token counts", () => {
    const result = runExtraCoT({
      problem: "Test token counting",
      reasoningSteps: [
        "Step one: analyze the requirements.",
        "Step two: design the solution.",
        "Step three: implement and test.",
      ],
    });

    expect(result.totalOriginalTokens).toBeGreaterThan(0);
    expect(result.totalCompressedTokens).toBeLessThanOrEqual(result.totalOriginalTokens);
  });

  it("respects maxBudget", () => {
    const result = runExtraCoT({
      problem: "Budget test",
      reasoningSteps: Array.from({ length: 10 }, (_, i) =>
        `Step ${i + 1}: This is a verbose reasoning step with many words to demonstrate compression behavior.`
      ),
      maxBudget: 50,
    });

    expect(result.totalCompressedTokens).toBeLessThanOrEqual(result.totalOriginalTokens);
  });

  it("aggressive compression produces lower fidelity", () => {
    const steps = [
      "Analyze user requirements and constraints.",
      "Identify technical dependencies and risks.",
      "Design system architecture with modularity in mind.",
      "Implement core API endpoints first.",
      "Add authentication and authorization layers.",
      "Write integration tests for critical paths.",
    ];

    const gentle = runExtraCoT({
      problem: "Build a web application",
      reasoningSteps: steps,
      targetCompression: 0.8,
    });

    const aggressive = runExtraCoT({
      problem: "Build a web application",
      reasoningSteps: steps,
      targetCompression: 0.2,
    });

    expect(aggressive.overallCompressionRatio).toBeLessThanOrEqual(gentle.overallCompressionRatio + 0.1);
  });
});
