import { describe, it, expect } from "vitest";
import { checkAmbiguity, verifyExecution, summarizeHistory } from "./validator.js";
import type { HistoryEntry } from "../state/types.js";

function entry(role: "user" | "assistant", content: string, turn: number): HistoryEntry {
  return { role, content, turn, timestamp: new Date() };
}

describe("checkAmbiguity", () => {
  it("detects vague requirement", () => {
    const result = checkAmbiguity("Maybe do something nice with some stuff soon");
    expect(result.isAmbiguous).toBe(true);
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.underspecifiedAreas.length).toBeGreaterThan(0);
    expect(result.clarifyingQuestions.length).toBeGreaterThan(0);
  });

  it("scores specific requirement lower", () => {
    const result = checkAmbiguity(
      'Create a REST endpoint POST /api/users that accepts {"name": string, "email": string} and returns 201 with the created user record using PostgreSQL.'
    );
    expect(result.score).toBeLessThan(0.5);
  });

  it("generates questions for brief requirements", () => {
    const result = checkAmbiguity("Add a button");
    expect(result.clarifyingQuestions.length).toBeGreaterThan(0);
    expect(result.clarifyingQuestions.some((q) => /detail|behavior/i.test(q))).toBe(true);
  });

  it("uses context to reduce ambiguity", () => {
    const vague = checkAmbiguity("Add error handling");
    const withContext = checkAmbiguity("Add error handling", "Using try/catch blocks with specific error codes 400 and 500");
    // Context should at least not increase score
    expect(withContext.score).toBeLessThanOrEqual(vague.score + 0.05);
  });

  it("caps score between 0 and 1", () => {
    const result1 = checkAmbiguity("Maybe do something with stuff and things, possibly later");
    expect(result1.score).toBeLessThanOrEqual(1);
    expect(result1.score).toBeGreaterThanOrEqual(0);

    const result2 = checkAmbiguity('Exactly 5 items, must arrive before 2024-01-15, using "express-validator"');
    expect(result2.score).toBeLessThanOrEqual(1);
    expect(result2.score).toBeGreaterThanOrEqual(0);
  });
});

describe("verifyExecution", () => {
  it("verifies successful output", () => {
    const result = verifyExecution(
      "Create a file",
      "File created successfully. 200 OK."
    );
    expect(result.isVerified).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("detects failure indicators", () => {
    const result = verifyExecution(
      "Deploy the service",
      "Error: ECONNREFUSED - connection refused at localhost:3000"
    );
    expect(result.isVerified).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("checks expected indicators", () => {
    const result = verifyExecution(
      "Run tests",
      "All 42 tests passed. Coverage: 85%",
      ["tests passed", "coverage"]
    );
    expect(result.matchedIndicators).toContain("tests passed");
    expect(result.matchedIndicators).toContain("coverage");
    expect(result.missedIndicators).toEqual([]);
  });

  it("reports missed indicators", () => {
    const result = verifyExecution(
      "Build project",
      "Build completed.",
      ["no errors", "output.js"]
    );
    expect(result.missedIndicators.length).toBeGreaterThan(0);
  });

  it("handles empty output", () => {
    const result = verifyExecution("Some goal", "");
    expect(result.isVerified).toBe(false);
    expect(result.issues.some((i) => /empty/i.test(i))).toBe(true);
  });
});

describe("summarizeHistory", () => {
  it("handles empty history", () => {
    const result = summarizeHistory([]);
    expect(result.totalTurns).toBe(0);
    expect(result.summary).toContain("No conversation history");
  });

  it("summarizes history with turns", () => {
    const history: HistoryEntry[] = [
      entry("user", "Let's build a REST API with Express.", 1),
      entry("assistant", "I'll set up Express with TypeScript.", 1),
      entry("user", "We decided to use PostgreSQL for the database.", 2),
      entry("assistant", "Confirmed: PostgreSQL with Prisma ORM.", 2),
    ];
    const result = summarizeHistory(history);
    expect(result.totalTurns).toBe(2);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.keyDecisions.length).toBeGreaterThan(0);
  });

  it("extracts open questions", () => {
    const history: HistoryEntry[] = [
      entry("user", "Should we use Redis for caching?", 1),
      entry("assistant", "That depends on your traffic patterns. What is the expected load?", 1),
    ];
    const result = summarizeHistory(history);
    expect(result.openQuestions.length).toBeGreaterThan(0);
  });

  it("tracks topic progression", () => {
    const history: HistoryEntry[] = [];
    for (let i = 1; i <= 8; i++) {
      history.push(entry("user", `Discussion about authentication security tokens for turn ${i}`, i));
      history.push(entry("assistant", `Response about authentication implementation for turn ${i}`, i));
    }
    const result = summarizeHistory(history);
    expect(result.topicProgression.length).toBeGreaterThan(0);
  });
});
