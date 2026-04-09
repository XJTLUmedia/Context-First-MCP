import { describe, it, expect } from "vitest";
import { detectConflicts } from "./detector.js";
import type { GroundTruthEntry } from "../state/types.js";

function makeGT(entries: Record<string, unknown>): Map<string, GroundTruthEntry> {
  const gt = new Map<string, GroundTruthEntry>();
  for (const [key, value] of Object.entries(entries)) {
    gt.set(key, { value, lockedAt: new Date(), source: "test" });
  }
  return gt;
}

describe("detectConflicts", () => {
  it("returns no conflicts for unrelated content", () => {
    const gt = makeGT({ framework: "Express", database: "PostgreSQL" });
    const result = detectConflicts("The weather is nice today.", gt);
    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts).toEqual([]);
  });

  it("detects direct negation", () => {
    const gt = makeGT({ framework: "Express" });
    const result = detectConflicts("Don't use Express, switch to Hono instead.", gt);
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0].existingKey).toBe("framework");
    expect(result.conflicts[0].severity).toBe("high");
  });

  it("detects change language", () => {
    const gt = makeGT({ framework: "Express" });
    const result = detectConflicts("Actually, change the framework to Fastify.", gt);
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts.some((c) => c.severity === "medium" || c.severity === "high")).toBe(true);
  });

  it("handles empty ground truth", () => {
    const gt = new Map<string, GroundTruthEntry>();
    const result = detectConflicts("Use Express for the backend.", gt);
    expect(result.hasConflicts).toBe(false);
  });

  it("detects remove/exclude patterns", () => {
    const gt = makeGT({ authentication: "JWT" });
    const result = detectConflicts("Remove JWT authentication from the project.", gt);
    expect(result.hasConflicts).toBe(true);
  });

  it("truncates long conflicting statements", () => {
    const gt = makeGT({ framework: "Express" });
    const longMessage = "Actually, replace the framework with something else. " + "x".repeat(300);
    const result = detectConflicts(longMessage, gt);
    if (result.hasConflicts && result.conflicts.length > 0) {
      expect(result.conflicts[0].conflictingStatement.length).toBeLessThanOrEqual(203);
    }
  });
});
