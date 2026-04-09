import { describe, it, expect } from "vitest";
import { checkAbstention } from "./abstention.js";
import type { GroundTruthEntry, ConflictEntry, HistoryEntry } from "../state/types.js";

function makeGT(
  entries: Record<string, { value: unknown; source?: string; ageMs?: number }>
): Map<string, GroundTruthEntry> {
  const gt = new Map<string, GroundTruthEntry>();
  for (const [key, { value, source, ageMs }] of Object.entries(entries)) {
    gt.set(key, {
      value,
      lockedAt: new Date(Date.now() - (ageMs ?? 0)),
      source: source ?? "user-confirmed",
    });
  }
  return gt;
}

function makeConflict(key: string): ConflictEntry {
  return {
    key,
    oldValue: "old",
    newValue: "new",
    description: "test conflict",
    detectedAt: new Date(),
  };
}

describe("checkAbstention", () => {
  it("returns high confidence when all state is present and recent", () => {
    const state = makeGT({
      database: { value: "PostgreSQL" },
      framework: { value: "Express" },
    });

    const result = checkAbstention(
      "What database and framework are we using?",
      state,
      ["database", "framework"],
      [],
      [],
      0.6
    );

    expect(result.shouldAbstain).toBe(false);
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.dimensions.stateCompleteness).toBe(1);
  });

  it("recommends abstention when required keys are missing", () => {
    const state = makeGT({
      database: { value: "PostgreSQL" },
    });

    const result = checkAbstention(
      "What database and framework are we using?",
      state,
      ["database", "framework", "hosting"],
      [],
      [],
      0.6
    );

    expect(result.dimensions.stateCompleteness).toBeLessThan(1);
    expect(result.missingInfo.length).toBeGreaterThan(0);
    expect(result.suggestedQuestions.length).toBeGreaterThan(0);
  });

  it("lowers confidence for stale state entries", () => {
    const state = makeGT({
      database: { value: "PostgreSQL", ageMs: 2 * 60 * 60 * 1000 }, // 2 hours old
    });

    const result = checkAbstention(
      "What database are we using?",
      state,
      ["database"],
      [],
      [],
      0.6
    );

    expect(result.dimensions.recency).toBe(0);
  });

  it("lowers confidence for conflicting state", () => {
    const state = makeGT({
      database: { value: "PostgreSQL" },
      framework: { value: "Express" },
    });

    const result = checkAbstention(
      "What database and framework?",
      state,
      ["database", "framework"],
      [makeConflict("framework")],
      [],
      0.6
    );

    expect(result.dimensions.contradictionFree).toBeLessThan(1);
  });

  it("lowers confidence for ambiguous claims", () => {
    const state = makeGT({
      database: { value: "PostgreSQL" },
    });

    const result = checkAbstention(
      "Maybe use something like a good database or whatever works best",
      state,
      ["database"],
      [],
      [],
      0.6
    );

    expect(result.dimensions.ambiguityFree).toBeLessThan(1);
  });

  it("lowers confidence for inferred sources", () => {
    const state = makeGT({
      database: { value: "PostgreSQL", source: "inferred" },
      framework: { value: "Express", source: "inferred" },
    });

    const result = checkAbstention(
      "What are we using?",
      state,
      ["database", "framework"],
      [],
      [],
      0.6
    );

    expect(result.dimensions.sourceQuality).toBe(0);
  });

  it("gives high source quality for user-confirmed entries", () => {
    const state = makeGT({
      database: { value: "PostgreSQL", source: "user-confirmed" },
      framework: { value: "Express", source: "user" },
    });

    const result = checkAbstention(
      "What are we using?",
      state,
      ["database", "framework"],
      [],
      [],
      0.6
    );

    expect(result.dimensions.sourceQuality).toBe(1);
  });

  it("returns shouldAbstain=true when confidence below threshold", () => {
    const result = checkAbstention(
      "Maybe something about everything?",
      new Map(),
      ["key1", "key2", "key3"],
      [],
      [],
      0.8
    );

    expect(result.shouldAbstain).toBe(true);
    expect(result.confidence).toBeLessThan(0.8);
  });

  it("handles empty required keys gracefully", () => {
    const result = checkAbstention(
      "What is happening?",
      new Map(),
      [],
      [],
      [],
      0.6
    );

    expect(result.dimensions.stateCompleteness).toBe(1);
    expect(result.dimensions.contradictionFree).toBe(1);
  });
});
