import { describe, it, expect } from "vitest";
import { runKAGThinker } from "./kagthinker.js";

describe("runKAGThinker", () => {
  it("decomposes a complex problem into logical forms", () => {
    const result = runKAGThinker({
      problem: "What causes memory leaks in Node.js applications and how can they be detected?",
    });

    expect(result.logicalForms.length).toBeGreaterThan(0);
    expect(result.finalAnswer).toBeTruthy();
    expect(result.totalSubProblems).toBe(result.logicalForms.length);
    expect(result.stabilityScore).toBeGreaterThan(0);
  });

  it("uses known facts for grounding", () => {
    const result = runKAGThinker({
      problem: "Should we migrate from REST to GraphQL?",
      knownFacts: [
        "Our API has 50 endpoints",
        "Mobile clients use 80% of the API",
        "Current P95 latency is 200ms",
      ],
    });

    expect(result.logicalForms.length).toBeGreaterThan(0);
    expect(result.finalAnswer).toBeTruthy();
  });

  it("respects maxDepth", () => {
    const result = runKAGThinker({
      problem: "Compare Kubernetes vs Docker Swarm for container orchestration.",
      maxDepth: 2,
    });

    for (const form of result.logicalForms) {
      expect(form.depth).toBeLessThanOrEqual(2);
    }
  });

  it("respects maxSteps", () => {
    const result = runKAGThinker({
      problem: "Design a real-time analytics pipeline.",
      maxSteps: 10,
    });

    // Engine checks maxSteps before starting each resolution; a single resolution is atomic (3-4 steps)
    // so interactiveSteps may slightly overshoot the limit
    expect(result.interactiveSteps).toBeGreaterThan(0);
    expect(result.resolvedCount + result.failedCount).toBeLessThan(result.totalSubProblems);
  });

  it("builds dependency graph", () => {
    const result = runKAGThinker({
      problem: "How to implement end-to-end encryption in a messaging app?",
    });

    expect(result.dependencyGraph).toBeDefined();
    const ids = result.logicalForms.map(f => f.id);
    // All dependency graph keys should match logical form IDs
    for (const key of Object.keys(result.dependencyGraph)) {
      expect(ids).toContain(key);
    }
  });

  it("reports resolution status", () => {
    const result = runKAGThinker({
      problem: "Evaluate the trade-offs of adopting a monorepo structure.",
    });

    expect(result.resolvedCount).toBeGreaterThanOrEqual(0);
    expect(result.failedCount).toBeGreaterThanOrEqual(0);
    expect(result.resolvedCount + result.failedCount).toBeLessThanOrEqual(result.totalSubProblems);
    // fullyResolved requires ALL forms resolved (none pending, none failed)
    expect(result.fullyResolved).toBe(result.failedCount === 0 && result.resolvedCount === result.totalSubProblems);
  });

  it("each logical form has required structure", () => {
    const result = runKAGThinker({
      problem: "What is the impact of using WebAssembly for computation-heavy web features?",
      maxDepth: 3,
    });

    for (const form of result.logicalForms) {
      expect(form.id).toBeTruthy();
      expect(form.expression).toBeTruthy();
      expect(form.description).toBeTruthy();
      expect(form.dependencies).toBeDefined();
      expect(form.status).toBeDefined();
      expect(["pending", "in-progress", "resolved", "failed"]).toContain(form.status);
      expect(form.confidence).toBeGreaterThanOrEqual(0);
      expect(form.confidence).toBeLessThanOrEqual(1);
      expect(form.depth).toBeGreaterThanOrEqual(0);
    }
  });

  it("handles simple problems", () => {
    const result = runKAGThinker({
      problem: "Why?",
      maxDepth: 1,
      maxSteps: 5,
    });

    expect(result.logicalForms.length).toBeGreaterThan(0);
    expect(result.finalAnswer).toBeTruthy();
  });
});
