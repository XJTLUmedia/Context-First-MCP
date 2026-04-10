"use client";

import { useState, useMemo } from "react";

interface ActivationSignal {
  label: string;
  key: string;
  description: string;
  color: string;
  barColor: string;
}

interface ClaimResult {
  claim: string;
  classification: "likely_true" | "uncertain" | "likely_false";
  confidence: number;
  signals: Record<string, number>;
}

interface Scenario {
  label: string;
  claims: string[];
  expectedResults: ClaimResult[];
  overallTruthfulness: number;
}

const SIGNALS: ActivationSignal[] = [
  { label: "Entropy Probe", key: "entropyProbe", description: "Token-level uncertainty signal", color: "text-blue-700 dark:text-blue-300", barColor: "bg-blue-500" },
  { label: "Consistency Score", key: "consistencyScore", description: "Cross-layer agreement", color: "text-green-700 dark:text-green-300", barColor: "bg-green-500" },
  { label: "Hedge Detector", key: "hedgeDetector", description: "Hedging language prevalence", color: "text-amber-700 dark:text-amber-300", barColor: "bg-amber-500" },
  { label: "Specificity", key: "specificity", description: "Concrete vs vague claims", color: "text-purple-700 dark:text-purple-300", barColor: "bg-purple-500" },
  { label: "Self-Consistency", key: "selfConsistency", description: "Agreement across samples", color: "text-rose-700 dark:text-rose-300", barColor: "bg-rose-500" },
];

const SCENARIOS: Scenario[] = [
  {
    label: "Mixed truth claims",
    claims: ["The Earth orbits the Sun in 365.25 days", "The Great Wall is visible from space", "Water boils at 100°C at sea level"],
    expectedResults: [
      { claim: "The Earth orbits the Sun in 365.25 days", classification: "likely_true", confidence: 0.94, signals: { entropyProbe: 0.92, consistencyScore: 0.96, hedgeDetector: 0.95, specificity: 0.91, selfConsistency: 0.93 } },
      { claim: "The Great Wall is visible from space", classification: "likely_false", confidence: 0.72, signals: { entropyProbe: 0.35, consistencyScore: 0.4, hedgeDetector: 0.6, specificity: 0.55, selfConsistency: 0.3 } },
      { claim: "Water boils at 100°C at sea level", classification: "likely_true", confidence: 0.97, signals: { entropyProbe: 0.95, consistencyScore: 0.98, hedgeDetector: 0.97, specificity: 0.96, selfConsistency: 0.98 } },
    ],
    overallTruthfulness: 0.65,
  },
  {
    label: "All confident claims",
    claims: ["JavaScript is single-threaded", "HTTP 200 means success", "TCP uses a three-way handshake"],
    expectedResults: [
      { claim: "JavaScript is single-threaded", classification: "likely_true", confidence: 0.96, signals: { entropyProbe: 0.94, consistencyScore: 0.97, hedgeDetector: 0.98, specificity: 0.93, selfConsistency: 0.95 } },
      { claim: "HTTP 200 means success", classification: "likely_true", confidence: 0.99, signals: { entropyProbe: 0.98, consistencyScore: 0.99, hedgeDetector: 0.99, specificity: 0.97, selfConsistency: 0.99 } },
      { claim: "TCP uses a three-way handshake", classification: "likely_true", confidence: 0.98, signals: { entropyProbe: 0.97, consistencyScore: 0.98, hedgeDetector: 0.99, specificity: 0.96, selfConsistency: 0.97 } },
    ],
    overallTruthfulness: 0.97,
  },
  {
    label: "Hedged claims",
    claims: ["React is probably the best framework", "AI might replace developers someday", "GraphQL could be faster than REST"],
    expectedResults: [
      { claim: "React is probably the best framework", classification: "uncertain", confidence: 0.45, signals: { entropyProbe: 0.5, consistencyScore: 0.4, hedgeDetector: 0.2, specificity: 0.35, selfConsistency: 0.45 } },
      { claim: "AI might replace developers someday", classification: "uncertain", confidence: 0.38, signals: { entropyProbe: 0.42, consistencyScore: 0.35, hedgeDetector: 0.15, specificity: 0.3, selfConsistency: 0.4 } },
      { claim: "GraphQL could be faster than REST", classification: "uncertain", confidence: 0.42, signals: { entropyProbe: 0.48, consistencyScore: 0.38, hedgeDetector: 0.18, specificity: 0.4, selfConsistency: 0.44 } },
    ],
    overallTruthfulness: 0.42,
  },
];

function classificationColor(c: string): string {
  if (c === "likely_true") return "text-green-600 dark:text-green-400";
  if (c === "likely_false") return "text-red-600 dark:text-red-400";
  return "text-amber-600 dark:text-amber-400";
}

function classificationBadge(c: string): string {
  if (c === "likely_true") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (c === "likely_false") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
}

export default function InternalStateDemo() {
  const [activeScenario, setActiveScenario] = useState(0);
  const [expandedClaim, setExpandedClaim] = useState<number | null>(null);

  const scenario = SCENARIOS[activeScenario];

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-950">
      <div className="mb-4">
        <h3 className="text-lg font-bold">Internal State Probing</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Proxy-based activation probing: 5 signals detect likely false claims without model internals
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {SCENARIOS.map((s, i) => (
          <button key={s.label} onClick={() => { setActiveScenario(i); setExpandedClaim(null); }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              activeScenario === i
                ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100"
                : "border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}>{s.label}</button>
        ))}
      </div>

      {/* Overall truthfulness */}
      <div className="text-center mb-6">
        <div className="text-4xl font-bold font-mono mb-1" style={{
          color: scenario.overallTruthfulness >= 0.7 ? "#22c55e" : scenario.overallTruthfulness >= 0.5 ? "#f59e0b" : "#ef4444",
        }}>
          {(scenario.overallTruthfulness * 100).toFixed(0)}%
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">Overall Truthfulness</div>
      </div>

      {/* Claim results */}
      <div className="space-y-3">
        {scenario.expectedResults.map((r, i) => (
          <div key={r.claim} className="border border-gray-100 dark:border-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedClaim(expandedClaim === i ? null : i)}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">&quot;{r.claim}&quot;</p>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${classificationBadge(r.classification)}`}>
                  {r.classification.replace("_", " ")}
                </span>
                <span className="text-xs font-mono text-gray-500">{(r.confidence * 100).toFixed(0)}%</span>
                <span className="text-xs text-gray-400">{expandedClaim === i ? "▲" : "▼"}</span>
              </div>
            </div>
            {expandedClaim === i && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
                {SIGNALS.map((sig) => (
                  <div key={sig.key} className="flex items-center gap-3">
                    <span className={`text-xs w-32 ${sig.color}`}>{sig.label}</span>
                    <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full ${sig.barColor} rounded-full transition-all`}
                        style={{ width: `${(r.signals[sig.key] ?? 0) * 100}%` }} />
                    </div>
                    <span className="text-xs font-mono w-10 text-right">{((r.signals[sig.key] ?? 0) * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
