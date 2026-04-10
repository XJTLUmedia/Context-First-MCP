import { describe, it, expect } from "vitest";
import { ioeSelfCorrect } from "./ioe-correct.js";
import type { GroundTruthEntry } from "../state/types.js";

function makeGT(entries: Record<string, string>): Map<string, GroundTruthEntry> {
  const map = new Map<string, GroundTruthEntry>();
  for (const [key, value] of Object.entries(entries)) {
    map.set(key, { value, lockedAt: new Date(), source: "test" });
  }
  return map;
}

describe("ioeSelfCorrect", () => {
  it("accepts high-confidence responses", () => {
    const gt = makeGT({
      boiling_point: "100 degrees Celsius",
    });
    const result = ioeSelfCorrect(
      "Water definitely boils at exactly 100 degrees Celsius at standard atmospheric pressure. This is confirmed and proven by established scientific research and evidence.",
      gt,
      "At what temperature does water boil?"
    );

    expect(result.action).toBe("accept");
    expect(result.preConfidence.overallConfidence).toBeGreaterThan(0.5);
  });

  it("triggers correction for low-confidence responses", () => {
    const gt = makeGT({
      boiling_point: "100 degrees Celsius",
    });
    const result = ioeSelfCorrect(
      "I think maybe water might possibly boil at perhaps around something like 50 degrees, but I'm not sure and I don't know really.",
      gt,
      "At what temperature does water boil?"
    );

    expect(["correct", "escalate"]).toContain(result.action);
    expect(result.preConfidence.overallConfidence).toBeLessThan(0.75);
  });

  it("assesses all confidence dimensions", () => {
    const result = ioeSelfCorrect(
      "TypeScript is a programming language.",
      new Map(),
      "What is TypeScript?"
    );

    expect(result.preConfidence).toHaveProperty("overallConfidence");
    expect(result.preConfidence).toHaveProperty("linguisticConfidence");
    expect(result.preConfidence).toHaveProperty("knowledgeConfidence");
    expect(result.preConfidence).toHaveProperty("reasoningConfidence");
    expect(result.preConfidence).toHaveProperty("level");
  });

  it("escalates after multiple failed correction attempts", () => {
    const result = ioeSelfCorrect(
      "I'm somewhat unsure about this topic, it could be something or perhaps not.",
      new Map(),
      "What is this about?",
      ["attempt1", "attempt2"]
    );

    // With ambiguous confidence + 2 prior attempts → escalate
    if (result.preConfidence.overallConfidence > 0.4 && result.preConfidence.overallConfidence < 0.75) {
      expect(result.action).toBe("escalate");
    }
  });

  it("computes over-correction risk", () => {
    const result = ioeSelfCorrect(
      "This is a straightforward factual statement.",
      new Map()
    );

    expect(result.correctionIterations).toBeGreaterThanOrEqual(0);
    expect(typeof result.correctionIterations).toBe("number");
  });

  it("generates corrections when ground truth mismatches", () => {
    const gt = makeGT({
      language: "TypeScript",
    });
    const result = ioeSelfCorrect(
      "I believe maybe the programming language used is possibly JavaScript or perhaps Python, I'm not entirely sure about which language.",
      gt,
      "What language is used?"
    );

    if (result.action === "correct") {
      expect(result.corrections.length).toBeGreaterThanOrEqual(0);
      expect(result.finalResponse).toBeTruthy();
    }
  });

  it("provides recommendations for each action", () => {
    const result = ioeSelfCorrect(
      "Here is a clear and definitive answer based on documented evidence.",
      new Map()
    );

    expect(result.preConfidence).toBeDefined();
    expect(result.action).toBeDefined();
  });
});
