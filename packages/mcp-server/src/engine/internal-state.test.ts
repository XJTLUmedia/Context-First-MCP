import { describe, it, expect } from "vitest";
import { probeInternalState } from "./internal-state.js";
import type { GroundTruthEntry } from "../state/types.js";

function makeGT(
  entries: Record<string, { value: string; confidence: number }>
): Map<string, GroundTruthEntry> {
  const map = new Map<string, GroundTruthEntry>();
  for (const [key, val] of Object.entries(entries)) {
    map.set(key, { value: val.value, confidence: val.confidence, source: "test" });
  }
  return map;
}

describe("probeInternalState", () => {
  it("returns neutral result for empty input", () => {
    const result = probeInternalState("", new Map());
    expect(result.overallTruthfulness).toBe(1.0);
    expect(result.claims).toHaveLength(0);
    expect(result.likelyTrueCount).toBe(0);
    expect(result.uncertainCount).toBe(0);
    expect(result.likelyFalseCount).toBe(0);
  });

  it("classifies confident factual claims as likely_true", () => {
    const gt = makeGT({
      capital_of_france: { value: "Paris", confidence: 0.99 },
    });
    const output =
      "Paris is definitely the capital of France. This is a well-established and proven fact.";
    const result = probeInternalState(output, gt);

    expect(result.overallTruthfulness).toBeGreaterThan(0.5);
    expect(result.likelyTrueCount).toBeGreaterThanOrEqual(1);
    expect(result.claims.length).toBeGreaterThan(0);
  });

  it("classifies hedging uncertain claims as uncertain or likely_false", () => {
    const result = probeInternalState(
      "I think maybe the population could be around something like 10 million, but I'm not sure. Perhaps it's possibly different, I don't know.",
      new Map()
    );

    const nonTrue = result.uncertainCount + result.likelyFalseCount;
    expect(nonTrue).toBeGreaterThanOrEqual(1);
  });

  it("detects self-inconsistency between contradictory claims", () => {
    const output =
      "The project uses TypeScript and is fully typed. The project does not use TypeScript or any type system at all.";
    const result = probeInternalState(output, new Map());

    const lowConsistency = result.claims.some(
      c => c.activationSignals.selfConsistency < 0.5
    );
    expect(lowConsistency).toBe(true);
  });

  it("provides recommendations for low truthfulness", () => {
    const gt = makeGT({
      speed_of_light: { value: "299792458 m/s", confidence: 1.0 },
    });
    const output =
      "I think maybe the speed of light is perhaps around 100 km/h, but I'm not sure. It could possibly be different.";
    const result = probeInternalState(output, gt);

    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("computes aggregate activation signals", () => {
    const output =
      "Water boils at 100 degrees Celsius at sea level. This is a proven scientific fact confirmed through experiments.";
    const result = probeInternalState(output, new Map());

    expect(result.aggregateActivation).toHaveProperty("avgAssertionStrength");
    expect(result.aggregateActivation).toHaveProperty("avgEpistemicCertainty");
    expect(result.aggregateActivation).toHaveProperty("avgFactualAlignment");
    expect(result.aggregateActivation).toHaveProperty("avgHedgingDensity");
    expect(result.aggregateActivation).toHaveProperty("avgSelfConsistency");
  });

  it("handles ground truth alignment checking", () => {
    const gt = makeGT({
      boiling_point_water: { value: "100 degrees Celsius", confidence: 0.99 },
    });
    const output =
      "The boiling point of water is exactly 100 degrees Celsius at standard atmospheric pressure.";
    const result = probeInternalState(output, gt);

    expect(result.overallTruthfulness).toBeGreaterThan(0.5);
  });
});
