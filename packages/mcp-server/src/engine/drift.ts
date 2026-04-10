import { linearRegression, variance } from "simple-statistics";
import type { DriftResult, DriftWindow } from "../state/types.js";

/**
 * Temporal Context Awareness (TCA) — inspired by arXiv:2503.15560.
 *
 * Tracks context health over a sliding window of turns.
 * Detects three types of drift:
 *   1. Gradual Decay — health score slowly declining across turns
 *   2. Sudden Shift — abrupt drop in a single turn
 *   3. Oscillation — health flipping between good and bad (unstable context)
 *
 * Progressive Risk Scoring: cumulative risk increases when drift persists,
 * resets when context recovers.
 */

const DEFAULT_WINDOW_SIZE = 8;
const SUDDEN_SHIFT_THRESHOLD = 0.25;
const DECAY_SLOPE_THRESHOLD = -0.05;
const OSCILLATION_THRESHOLD = 0.3;

// ─── In-Memory Drift Store ───

const driftWindows = new Map<string, DriftWindow[]>();

export function recordHealthSnapshot(
  sessionId: string,
  turn: number,
  health: number,
  breakdown: Record<string, number>
): void {
  if (!driftWindows.has(sessionId)) {
    driftWindows.set(sessionId, []);
  }
  const window = driftWindows.get(sessionId)!;
  window.push({
    turn,
    health: Math.max(0, Math.min(1, health)),
    breakdown,
    timestamp: new Date(),
  });

  // Keep only last 50 snapshots
  if (window.length > 50) {
    driftWindows.set(sessionId, window.slice(-50));
  }
}

export function detectDrift(
  sessionId: string,
  windowSize: number = DEFAULT_WINDOW_SIZE
): DriftResult {
  const window = driftWindows.get(sessionId) ?? [];

  if (window.length < 2) {
    return {
      hasDrift: false,
      driftType: "none",
      severity: 0,
      trend: "stable",
      riskScore: 0,
      window: window.slice(-windowSize),
      recommendation: "Insufficient data for drift analysis.",
    };
  }

  const recent = window.slice(-windowSize);
  const healthValues = recent.map(w => w.health);

  // ─── 1. Sudden Shift Detection ───
  const lastTwo = healthValues.slice(-2);
  const suddenDrop = lastTwo.length === 2
    ? lastTwo[0] - lastTwo[1]
    : 0;
  const hasSuddenShift = suddenDrop > SUDDEN_SHIFT_THRESHOLD;

  // ─── 2. Gradual Decay Detection (linear regression slope via simple-statistics) ───
  const slope = healthValues.length >= 2
    ? linearRegression(healthValues.map((v, i) => [i, v])).m
    : 0;
  const hasGradualDecay = slope < DECAY_SLOPE_THRESHOLD && healthValues.length >= 3;

  // ─── 3. Oscillation Detection (variance via simple-statistics) ───
  const driftVariance = healthValues.length >= 2 ? variance(healthValues) : 0;
  const hasOscillation = driftVariance > OSCILLATION_THRESHOLD && healthValues.length >= 4;

  // ─── Determine drift type and severity ───
  let driftType: DriftResult["driftType"] = "none";
  let severity = 0;
  let trend: DriftResult["trend"] = "stable";
  let recommendation = "";

  if (hasSuddenShift) {
    driftType = "sudden_shift";
    severity = Math.min(1, suddenDrop / 0.5);
    trend = "degrading";
    recommendation =
      "Context health dropped sharply. Run recap_conversation to re-anchor, then verify ground truth is still valid.";
  } else if (hasGradualDecay) {
    driftType = "gradual_decay";
    severity = Math.min(1, Math.abs(slope) / 0.15);
    trend = "degrading";
    recommendation =
      "Context is gradually degrading. Consider running context_loop to refresh state, or clear stale ground truth entries.";
  } else if (hasOscillation) {
    driftType = "oscillation";
    severity = Math.min(1, driftVariance / 0.5);
    trend = "unstable";
    recommendation =
      "Context health is oscillating — likely conflicting inputs or ambiguous requirements. Resolve open conflicts before proceeding.";
  } else {
    const avgHealth = healthValues.reduce((a, b) => a + b, 0) / healthValues.length;
    if (slope > 0.02) {
      trend = "improving";
    }
    if (avgHealth < 0.4) {
      severity = 0.3;
      recommendation = "Context health is consistently low. Review and confirm ground truth.";
    } else {
      recommendation = "Context is stable. No drift detected.";
    }
  }

  // ─── Progressive Risk Score ───
  // Risk accumulates when health stays below 0.5 across consecutive turns
  let riskScore = 0;
  let consecutiveLow = 0;
  for (const h of healthValues) {
    if (h < 0.5) {
      consecutiveLow++;
      riskScore += consecutiveLow * 0.1;
    } else {
      consecutiveLow = 0;
    }
  }
  riskScore = round(Math.min(1, riskScore));

  return {
    hasDrift: driftType !== "none",
    driftType,
    severity: round(severity),
    trend,
    riskScore,
    window: recent,
    recommendation,
  };
}

/**
 * Get raw window data for a session.
 */
export function getDriftWindow(sessionId: string): DriftWindow[] {
  return driftWindows.get(sessionId) ?? [];
}

/**
 * Clear drift history for a session (e.g., on reset).
 */
export function clearDriftHistory(sessionId: string): void {
  driftWindows.delete(sessionId);
}

// ─── Math Utilities ───

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
