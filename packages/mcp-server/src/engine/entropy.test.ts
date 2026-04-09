import { describe, it, expect } from "vitest";
import { computeEntropy } from "./entropy.js";
import type { GroundTruthEntry, HistoryEntry } from "../state/types.js";

function makeGT(entries: Record<string, unknown>): Map<string, GroundTruthEntry> {
  const gt = new Map<string, GroundTruthEntry>();
  for (const [key, value] of Object.entries(entries)) {
    gt.set(key, { value, lockedAt: new Date(), source: "test" });
  }
  return gt;
}

function makeHistory(contents: string[]): HistoryEntry[] {
  return contents.map((content, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content,
    turn: i + 1,
    timestamp: new Date(),
  }));
}

describe("computeEntropy", () => {
  it("returns all metrics in [0, 1] range", () => {
    const metrics = computeEntropy(
      ["This is a normal response about databases."],
      makeGT({ framework: "Express" }),
      makeHistory(["How do I set up?", "Use Express for your backend."])
    );

    expect(metrics.lexicalDiversity).toBeGreaterThanOrEqual(0);
    expect(metrics.lexicalDiversity).toBeLessThanOrEqual(1);
    expect(metrics.contradictionDensity).toBeGreaterThanOrEqual(0);
    expect(metrics.contradictionDensity).toBeLessThanOrEqual(1);
    expect(metrics.hedgeWordFrequency).toBeGreaterThanOrEqual(0);
    expect(metrics.hedgeWordFrequency).toBeLessThanOrEqual(1);
    expect(metrics.repetitionScore).toBeGreaterThanOrEqual(0);
    expect(metrics.repetitionScore).toBeLessThanOrEqual(1);
    expect(metrics.compositeScore).toBeGreaterThanOrEqual(0);
    expect(metrics.compositeScore).toBeLessThanOrEqual(1);
  });

  it("detects high hedge word frequency", () => {
    const outputs = [
      "Maybe you should try this approach. Perhaps it will work. I think it could be useful. Possibly the best option. I'm not sure about this.",
    ];
    const metrics = computeEntropy(outputs, new Map(), []);
    expect(metrics.hedgeWordFrequency).toBeGreaterThan(0.3);
  });

  it("detects low hedge word frequency for confident text", () => {
    const outputs = [
      "Use Express for the backend. Configure the database connection. Set up the routes. Deploy to production.",
    ];
    const metrics = computeEntropy(outputs, new Map(), []);
    expect(metrics.hedgeWordFrequency).toBe(0);
  });

  it("detects repetition between outputs", () => {
    const repeated = "The database should use PostgreSQL for data storage.";
    const outputs = [repeated, repeated];
    const metrics = computeEntropy(outputs, new Map(), []);
    expect(metrics.repetitionScore).toBeGreaterThan(0.3);
  });

  it("reports low repetition for diverse outputs", () => {
    const outputs = [
      "First we set up the database schema with tables for users and orders.",
      "Next implement the authentication middleware with JWT tokens and refresh logic.",
    ];
    const metrics = computeEntropy(outputs, new Map(), []);
    expect(metrics.repetitionScore).toBeLessThan(0.5);
  });

  it("reports zero metrics for empty outputs", () => {
    const metrics = computeEntropy([], new Map(), []);
    expect(metrics.lexicalDiversity).toBe(0);
    expect(metrics.compositeScore).toBeGreaterThanOrEqual(0);
  });

  it("detects contradiction against ground truth", () => {
    const gt = makeGT({ framework: "Express" });
    const outputs = [
      "You should not use Express for this project. Instead consider Hono.",
    ];
    const metrics = computeEntropy(outputs, gt, []);
    expect(metrics.contradictionDensity).toBeGreaterThan(0);
  });

  it("compositeScore increases with more problems", () => {
    const gt = makeGT({ tool: "React" });

    // Clean output
    const clean = computeEntropy(
      ["Use React with TypeScript for the frontend build."],
      gt,
      []
    );

    // Problematic output with hedging and repetition
    const problematic = computeEntropy(
      [
        "Maybe use React. Perhaps Vue. I think Angular could be useful too. Possibly the best option.",
        "Maybe use React. Perhaps Vue. I think Angular could be useful too. Possibly the best option.",
      ],
      gt,
      []
    );

    expect(problematic.compositeScore).toBeGreaterThan(clean.compositeScore);
  });
});
