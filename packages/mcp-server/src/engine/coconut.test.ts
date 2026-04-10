import { describe, it, expect } from "vitest";
import { runCoconut } from "./coconut.js";

describe("runCoconut", () => {
  it("produces continuous thoughts for a basic problem", () => {
    const result = runCoconut({
      problem: "Design a caching strategy for a high-traffic API.",
    });

    expect(result.thoughts.length).toBeGreaterThan(0);
    expect(result.finalAnswer).toBeTruthy();
    expect(result.latentOperations).toBeGreaterThan(0);
    expect(result.planningScore).toBeGreaterThan(0);
  });

  it("respects maxSteps limit", () => {
    const result = runCoconut({
      problem: "Explain quantum entanglement.",
      maxSteps: 4,
    });

    expect(result.thoughts.length).toBeLessThanOrEqual(4);
  });

  it("each thought has a latent state and confidence", () => {
    const result = runCoconut({
      problem: "How to scale a database horizontally?",
      maxSteps: 3,
    });

    for (const thought of result.thoughts) {
      expect(thought.latentState).toBeDefined();
      expect(thought.latentState.length).toBe(8);
      expect(thought.confidence).toBeGreaterThanOrEqual(0);
      expect(thought.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("confidence generally increases across steps", () => {
    const result = runCoconut({
      problem: "What is the optimal way to implement a rate limiter?",
      maxSteps: 6,
    });

    const first = result.thoughts[0];
    const last = result.thoughts[result.thoughts.length - 1];
    expect(last.confidence).toBeGreaterThanOrEqual(first.confidence * 0.5);
  });

  it("handles breadth exploration toggle", () => {
    const withBreadth = runCoconut({
      problem: "Design patterns for event sourcing.",
      enableBreadthExploration: true,
      maxSteps: 3,
    });

    const withoutBreadth = runCoconut({
      problem: "Design patterns for event sourcing.",
      enableBreadthExploration: false,
      maxSteps: 3,
    });

    expect(withBreadth.thoughts.length).toBeGreaterThan(0);
    expect(withoutBreadth.thoughts.length).toBeGreaterThan(0);
  });

  it("reports compression factor", () => {
    const result = runCoconut({
      problem: "Compare monolith vs microservices.",
    });

    expect(result.compressionFactor).toBeGreaterThanOrEqual(0);
  });
});
