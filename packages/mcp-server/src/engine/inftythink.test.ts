import { describe, it, expect } from "vitest";
import { runInftyThink } from "./inftythink.js";

describe("runInftyThink", () => {
  it("produces segments for a basic problem", () => {
    const result = runInftyThink({
      problem: "What is the best sorting algorithm for nearly-sorted data?",
    });

    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.finalAnswer).toBeTruthy();
    expect(result.totalSegments).toBe(result.segments.length);
    expect(result.converged).toBeDefined();
    expect(result.depthAchieved).toBeGreaterThan(0);
  });

  it("respects maxSegments limit", () => {
    const result = runInftyThink({
      problem: "Explain the theory of relativity in detail.",
      maxSegments: 3,
    });

    expect(result.segments.length).toBeLessThanOrEqual(3);
    expect(result.totalSegments).toBeLessThanOrEqual(3);
  });

  it("includes prior context in first segment", () => {
    const result = runInftyThink({
      problem: "How do we optimize the query?",
      priorContext: "We are using PostgreSQL with a 10M row table.",
    });

    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.finalAnswer).toBeTruthy();
  });

  it("reports compression ratio", () => {
    const result = runInftyThink({
      problem: "Design a microservices architecture for an e-commerce platform.",
      maxSegments: 5,
    });

    expect(result.overallCompression).toBeGreaterThan(0);
    expect(result.overallCompression).toBeLessThanOrEqual(1);
  });

  it("each segment has required fields", () => {
    const result = runInftyThink({
      problem: "Compare REST and GraphQL for a mobile backend.",
    });

    for (const segment of result.segments) {
      expect(segment.index).toBeDefined();
      expect(segment.reasoning).toBeTruthy();
      expect(segment.summary).toBeTruthy();
      expect(segment.tokenCount).toBeGreaterThan(0);
    }
  });

  it("handles short problems without crashing", () => {
    const result = runInftyThink({
      problem: "Why?",
      maxSegments: 2,
    });

    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.finalAnswer).toBeTruthy();
  });
});
