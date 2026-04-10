"use client";

import { useState } from "react";

interface Round {
  roundNumber: number;
  critique: string;
  improvementApplied: string;
  qualityScore: number;
  issuesFound: number;
}

interface Scenario {
  label: string;
  originalResponse: string;
  rounds: Round[];
  converged: boolean;
  convergenceRound: number;
  finalScore: number;
  improvement: number; // delta from round 1 to final
}

const SCENARIOS: Scenario[] = [
  {
    label: "Quick convergence",
    originalResponse: "To sort an array in JavaScript, use the sort() method: arr.sort()",
    converged: true,
    convergenceRound: 2,
    finalScore: 0.92,
    improvement: 0.27,
    rounds: [
      { roundNumber: 1, critique: "Missing comparison function warning. Default sort is lexicographic, not numeric.", improvementApplied: "Added note about comparison function for numeric sorting.", qualityScore: 0.65, issuesFound: 3 },
      { roundNumber: 2, critique: "Good coverage of comparison function. Could mention stability guarantee in ES2019+.", improvementApplied: "Added stability note and time complexity.", qualityScore: 0.88, issuesFound: 1 },
      { roundNumber: 3, critique: "Comprehensive and accurate. Minor: could mention Intl.Collator for locale-aware string sorting.", improvementApplied: "No changes — within convergence threshold.", qualityScore: 0.92, issuesFound: 0 },
    ],
  },
  {
    label: "Multi-round improvement",
    originalResponse: "React hooks let you use state in function components. Just use useState and useEffect.",
    converged: true,
    convergenceRound: 4,
    finalScore: 0.89,
    improvement: 0.44,
    rounds: [
      { roundNumber: 1, critique: "Oversimplified. Missing rules of hooks, dependency arrays, common pitfalls.", improvementApplied: "Added rules of hooks and dependency array explanation.", qualityScore: 0.45, issuesFound: 5 },
      { roundNumber: 2, critique: "Rules covered but examples are too abstract. Missing useCallback/useMemo.", improvementApplied: "Added concrete examples and memoization hooks.", qualityScore: 0.62, issuesFound: 3 },
      { roundNumber: 3, critique: "Better examples. Stale closure pitfall not addressed. Missing custom hooks pattern.", improvementApplied: "Added stale closure warning and custom hook example.", qualityScore: 0.82, issuesFound: 2 },
      { roundNumber: 4, critique: "Comprehensive coverage. Minor suggestion: mention React 19 use() hook.", improvementApplied: "No significant changes — converged.", qualityScore: 0.89, issuesFound: 0 },
    ],
  },
  {
    label: "Slow convergence",
    originalResponse: "Microservices are better than monoliths for all projects because they scale independently.",
    converged: true,
    convergenceRound: 5,
    finalScore: 0.85,
    improvement: 0.6,
    rounds: [
      { roundNumber: 1, critique: "Absolutist claim. Not all projects benefit. Missing trade-offs, complexity costs.", improvementApplied: "Added nuance: microservices suit large teams, not all projects.", qualityScore: 0.25, issuesFound: 6 },
      { roundNumber: 2, critique: "Better nuance but still missing: network latency, data consistency, operational overhead.", improvementApplied: "Added distributed systems challenges section.", qualityScore: 0.48, issuesFound: 4 },
      { roundNumber: 3, critique: "Good trade-off analysis. Missing: when to choose monolith-first, team size considerations.", improvementApplied: "Added decision framework based on team size and domain boundaries.", qualityScore: 0.68, issuesFound: 2 },
      { roundNumber: 4, critique: "Solid framework. Could reference real patterns: strangler fig, modular monolith.", improvementApplied: "Added migration patterns and modular monolith as middle ground.", qualityScore: 0.82, issuesFound: 1 },
      { roundNumber: 5, critique: "Well-balanced analysis with practical guidance. Ready for delivery.", improvementApplied: "No changes — converged.", qualityScore: 0.85, issuesFound: 0 },
    ],
  },
];

export default function SelfCritiqueDemo() {
  const [activeScenario, setActiveScenario] = useState(0);
  const scenario = SCENARIOS[activeScenario];

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-950">
      <div className="mb-4">
        <h3 className="text-lg font-bold">Iterative Self-Critique</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Multi-round critique-then-improve loop tracks convergence until quality stabilizes
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

      {/* Summary */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <p className="text-xs text-gray-500 mb-1">Original Response</p>
        <p className="text-sm mb-3">&quot;{scenario.originalResponse}&quot;</p>
        <div className="flex items-center gap-6">
          <div>
            <div className="text-3xl font-bold font-mono" style={{
              color: scenario.finalScore >= 0.8 ? "#22c55e" : scenario.finalScore >= 0.6 ? "#f59e0b" : "#ef4444",
            }}>{(scenario.finalScore * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-gray-500">Final Score</div>
          </div>
          <div>
            <div className="text-lg font-bold font-mono text-green-600">+{(scenario.improvement * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-gray-500">Improvement</div>
          </div>
          <div>
            <div className="text-lg font-bold font-mono">{scenario.convergenceRound}</div>
            <div className="text-[10px] text-gray-500">Rounds to Converge</div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${scenario.converged ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"}`}>
            {scenario.converged ? "CONVERGED" : "NOT CONVERGED"}
          </span>
        </div>
      </div>

      {/* Quality progression chart */}
      <div className="mb-6">
        <p className="text-xs font-medium text-gray-500 mb-2">Quality Progression</p>
        <div className="flex items-end gap-1 h-24">
          {scenario.rounds.map((r) => {
            const height = r.qualityScore * 100;
            return (
              <div key={r.roundNumber} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-mono">{(r.qualityScore * 100).toFixed(0)}%</span>
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-t" style={{ height: "96px" }}>
                  <div className="w-full rounded-t transition-all" style={{
                    height: `${height}%`,
                    marginTop: `${100 - height}%`,
                    backgroundColor: r.qualityScore >= 0.8 ? "#22c55e" : r.qualityScore >= 0.6 ? "#f59e0b" : "#ef4444",
                  }} />
                </div>
                <span className="text-[10px] text-gray-500">R{r.roundNumber}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Round details */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-500 mb-1">Round Details</p>
        {scenario.rounds.map((r) => (
          <div key={r.roundNumber} className={`border rounded-lg p-3 ${r.issuesFound === 0 ? "border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20" : "border-gray-100 dark:border-gray-800"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold">Round {r.roundNumber}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{r.issuesFound} issues</span>
                <span className="text-xs font-mono" style={{
                  color: r.qualityScore >= 0.8 ? "#22c55e" : r.qualityScore >= 0.6 ? "#f59e0b" : "#ef4444",
                }}>{(r.qualityScore * 100).toFixed(0)}%</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
                <span className="text-[10px] text-gray-500">Critique</span>
                <p className="mt-0.5">{r.critique}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
                <span className="text-[10px] text-gray-500">Improvement</span>
                <p className="mt-0.5">{r.improvementApplied}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
