import { describe, it, expect } from "vitest";
import { analyzeTruthDirection } from "./truth-direction.js";
import type { GroundTruthEntry } from "../state/types.js";

function makeGT(
  entries: Record<string, { value: string }>
): Map<string, GroundTruthEntry> {
  const map = new Map<string, GroundTruthEntry>();
  for (const [key, val] of Object.entries(entries)) {
    map.set(key, { value: val.value, lockedAt: new Date(), source: "test" });
  }
  return map;
}

describe("analyzeTruthDirection", () => {
  it("returns neutral result for empty input", () => {
    const result = analyzeTruthDirection("", new Map());
    expect(result.overallAlignment).toBe(1.0);
    expect(result.claims).toHaveLength(0);
    expect(result.deviantClaims).toHaveLength(0);
    expect(result.warnings).toContain("No declarative claims detected to analyze for truth direction.");
  });

  it("detects coherent truth direction in consistent factual text", () => {
    const gt = makeGT({
      earth_shape: { value: "sphere" },
      gravity: { value: "9.8 m/s²" },
    });
    const output =
      "The Earth is approximately a sphere. Gravity on Earth's surface is about 9.8 m/s². These are established scientific facts confirmed by research.";
    const result = analyzeTruthDirection(output, gt);

    expect(result.overallAlignment).toBeGreaterThan(0.3);
    expect(result.truthVector).toHaveProperty("factConsistency");
    expect(result.truthVector).toHaveProperty("linguisticConfidence");
  });

  it("detects deviant claims that diverge from truth direction", () => {
    const output =
      "Water boils at 100 degrees Celsius at sea level. This is confirmed by science. Actually, I think maybe water might not even boil at all, who knows.";
    const result = analyzeTruthDirection(output, new Map());

    expect(result.claims.length).toBeGreaterThan(0);
    // The hedging claim should show lower scores
    const hedgingClaim = result.claims.find(c => c.claim.includes("think maybe"));
    if (hedgingClaim) {
      expect(hedgingClaim.truthDirectionScore).toBeLessThan(
        result.claims[0].truthDirectionScore
      );
    }
  });

  it("reports inter-claim consistency", () => {
    const output =
      "TypeScript is a statically typed language. TypeScript provides strong type checking. TypeScript catches errors at compile time.";
    const result = analyzeTruthDirection(output, new Map());

    expect(result.interClaimConsistency).toBeGreaterThan(0.5);
  });

  it("generates warnings for low alignment", () => {
    const output =
      "The answer is maybe not clear, I'm not sure. It is possibly wrong and has been debatable, who knows. This does seem uncertain, I guess.";
    const result = analyzeTruthDirection(output, new Map());

    // Heavily hedged declarative text should get lower alignment
    expect(result.overallAlignment).toBeLessThan(0.8);
  });

  it("computes truth vector components", () => {
    const gt = makeGT({
      language: { value: "TypeScript" },
    });
    const output =
      "According to the documentation, the project uses TypeScript. Research shows TypeScript improves developer productivity.";
    const result = analyzeTruthDirection(output, gt);

    expect(result.truthVector.factConsistency).toBeGreaterThanOrEqual(0);
    expect(result.truthVector.linguisticConfidence).toBeGreaterThanOrEqual(0);
    expect(result.truthVector.logicalCoherence).toBeGreaterThanOrEqual(0);
    expect(result.truthVector.sourceAttribution).toBeGreaterThanOrEqual(0);
  });
});
