"use client";

import { useState } from "react";

interface Feature {
  label: string;
  key: string;
  description: string;
  barColor: string;
}

interface ClaimAnalysis {
  claim: string;
  truthVector: Record<string, number>;
  isDeviant: boolean;
  deviationMagnitude: number;
}

interface Scenario {
  label: string;
  claims: ClaimAnalysis[];
  populationBaseline: Record<string, number>;
}

const FEATURES: Feature[] = [
  { label: "Semantic Certainty", key: "semanticCertainty", description: "Embedding-space confidence", barColor: "bg-blue-500" },
  { label: "Lexical Precision", key: "lexicalPrecision", description: "Word-level specificity", barColor: "bg-emerald-500" },
  { label: "Source Alignment", key: "sourceAlignment", description: "Alignment with known facts", barColor: "bg-purple-500" },
  { label: "Temporal Coherence", key: "temporalCoherence", description: "Consistency across time", barColor: "bg-amber-500" },
];

const SCENARIOS: Scenario[] = [
  {
    label: "Technical claims",
    populationBaseline: { semanticCertainty: 0.85, lexicalPrecision: 0.82, sourceAlignment: 0.88, temporalCoherence: 0.84 },
    claims: [
      { claim: "React uses a virtual DOM for efficient updates", truthVector: { semanticCertainty: 0.92, lexicalPrecision: 0.89, sourceAlignment: 0.95, temporalCoherence: 0.91 }, isDeviant: false, deviationMagnitude: 0.05 },
      { claim: "Node.js was written in Python", truthVector: { semanticCertainty: 0.25, lexicalPrecision: 0.3, sourceAlignment: 0.1, temporalCoherence: 0.2 }, isDeviant: true, deviationMagnitude: 0.72 },
      { claim: "TypeScript compiles to JavaScript", truthVector: { semanticCertainty: 0.95, lexicalPrecision: 0.93, sourceAlignment: 0.97, temporalCoherence: 0.94 }, isDeviant: false, deviationMagnitude: 0.08 },
    ],
  },
  {
    label: "Speculative claims",
    populationBaseline: { semanticCertainty: 0.45, lexicalPrecision: 0.5, sourceAlignment: 0.4, temporalCoherence: 0.42 },
    claims: [
      { claim: "AGI will be achieved by 2030", truthVector: { semanticCertainty: 0.3, lexicalPrecision: 0.35, sourceAlignment: 0.2, temporalCoherence: 0.25 }, isDeviant: false, deviationMagnitude: 0.15 },
      { claim: "Quantum computing will replace classical", truthVector: { semanticCertainty: 0.28, lexicalPrecision: 0.32, sourceAlignment: 0.18, temporalCoherence: 0.22 }, isDeviant: false, deviationMagnitude: 0.18 },
      { claim: "Definitely, Rust will replace C++ entirely by 2025", truthVector: { semanticCertainty: 0.85, lexicalPrecision: 0.8, sourceAlignment: 0.15, temporalCoherence: 0.12 }, isDeviant: true, deviationMagnitude: 0.55 },
    ],
  },
];

export default function TruthDirectionDemo() {
  const [activeScenario, setActiveScenario] = useState(0);
  const scenario = SCENARIOS[activeScenario];

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-950">
      <div className="mb-4">
        <h3 className="text-lg font-bold">Truth Direction Detection</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          4-feature truth vector analysis: flags deviant claims that diverge from population baselines
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {SCENARIOS.map((s, i) => (
          <button key={s.label} onClick={() => setActiveScenario(i)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              activeScenario === i
                ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100"
                : "border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}>{s.label}</button>
        ))}
      </div>

      {/* Baseline */}
      <div className="mb-6 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Population Baseline</p>
        <div className="grid grid-cols-4 gap-2">
          {FEATURES.map((f) => (
            <div key={f.key} className="text-center">
              <div className="text-lg font-bold font-mono">{((scenario.populationBaseline[f.key] ?? 0) * 100).toFixed(0)}%</div>
              <div className="text-[10px] text-gray-500">{f.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Claims */}
      <div className="space-y-4">
        {scenario.claims.map((c) => (
          <div key={c.claim} className={`border rounded-lg p-4 ${c.isDeviant ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30" : "border-gray-100 dark:border-gray-800"}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">&quot;{c.claim}&quot;</p>
              {c.isDeviant ? (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                  DEVIANT ({(c.deviationMagnitude * 100).toFixed(0)}%)
                </span>
              ) : (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  ALIGNED
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {FEATURES.map((f) => {
                const val = c.truthVector[f.key] ?? 0;
                const baseline = scenario.populationBaseline[f.key] ?? 0;
                const diff = val - baseline;
                return (
                  <div key={f.key} className="flex items-center gap-3">
                    <span className="text-xs w-28 text-gray-500">{f.label}</span>
                    <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden relative">
                      <div className={`h-full ${f.barColor} rounded-full`} style={{ width: `${val * 100}%` }} />
                      <div className="absolute top-0 h-full w-0.5 bg-gray-400" style={{ left: `${baseline * 100}%` }} title="baseline" />
                    </div>
                    <span className={`text-xs font-mono w-14 text-right ${diff < -0.2 ? "text-red-500" : diff > 0.1 ? "text-green-500" : "text-gray-500"}`}>
                      {diff >= 0 ? "+" : ""}{(diff * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
