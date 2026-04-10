"use client";

import { useState } from "react";

interface TransformationType {
  label: string;
  key: string;
  icon: string;
}

interface TransformResult {
  type: string;
  original: string;
  transformed: string;
  preserved: boolean;
  trustLevel: "high" | "medium" | "low";
  score: number;
}

interface Scenario {
  label: string;
  statement: string;
  transforms: TransformResult[];
  overallTrust: "high" | "medium" | "low";
  consistencyScore: number;
}

const TRANSFORM_TYPES: TransformationType[] = [
  { label: "Contrapositive", key: "contrapositive", icon: "↔" },
  { label: "Negation", key: "negation", icon: "¬" },
  { label: "Generalization", key: "generalization", icon: "∀" },
  { label: "Specialization", key: "specialization", icon: "∃" },
  { label: "Transitive", key: "transitive", icon: "→" },
];

const SCENARIOS: Scenario[] = [
  {
    label: "Logically sound",
    statement: "All mammals are warm-blooded. Dogs are mammals. Therefore, dogs are warm-blooded.",
    overallTrust: "high",
    consistencyScore: 0.95,
    transforms: [
      { type: "contrapositive", original: "All mammals are warm-blooded", transformed: "If not warm-blooded, then not a mammal", preserved: true, trustLevel: "high", score: 0.97 },
      { type: "negation", original: "Dogs are mammals", transformed: "Dogs are not mammals → contradicts premise", preserved: true, trustLevel: "high", score: 0.94 },
      { type: "generalization", original: "Dogs are warm-blooded", transformed: "All canids are warm-blooded", preserved: true, trustLevel: "high", score: 0.92 },
      { type: "specialization", original: "All mammals are warm-blooded", transformed: "Golden retrievers are warm-blooded", preserved: true, trustLevel: "high", score: 0.96 },
      { type: "transitive", original: "Dogs → mammals → warm-blooded", transformed: "Dogs → warm-blooded", preserved: true, trustLevel: "high", score: 0.98 },
    ],
  },
  {
    label: "Logical fallacy",
    statement: "Some programmers use Vim. Smart people use Vim. Therefore, all programmers are smart.",
    overallTrust: "low",
    consistencyScore: 0.28,
    transforms: [
      { type: "contrapositive", original: "Smart people use Vim", transformed: "Non-Vim users are not smart → false", preserved: false, trustLevel: "low", score: 0.2 },
      { type: "negation", original: "All programmers are smart", transformed: "Some programmers are not smart → likely true", preserved: false, trustLevel: "low", score: 0.15 },
      { type: "generalization", original: "Some programmers use Vim", transformed: "All programmers use Vim → false", preserved: false, trustLevel: "low", score: 0.1 },
      { type: "specialization", original: "All programmers are smart", transformed: "Junior programmers are smart → unverifiable", preserved: false, trustLevel: "low", score: 0.3 },
      { type: "transitive", original: "Vim → smart, programmers → Vim", transformed: "programmers → smart: invalid syllogism", preserved: false, trustLevel: "low", score: 0.22 },
    ],
  },
  {
    label: "Partially valid",
    statement: "Most web apps use JavaScript. React requires JavaScript. Therefore, most web apps could use React.",
    overallTrust: "medium",
    consistencyScore: 0.55,
    transforms: [
      { type: "contrapositive", original: "React requires JavaScript", transformed: "No JavaScript → no React", preserved: true, trustLevel: "high", score: 0.95 },
      { type: "negation", original: "Most web apps use JavaScript", transformed: "Most web apps don't use JS → false currently", preserved: true, trustLevel: "medium", score: 0.7 },
      { type: "generalization", original: "Most web apps could use React", transformed: "All web apps could use React → overreach", preserved: false, trustLevel: "low", score: 0.3 },
      { type: "specialization", original: "Most web apps use JavaScript", transformed: "E-commerce apps use JavaScript → likely true", preserved: true, trustLevel: "medium", score: 0.65 },
      { type: "transitive", original: "Web apps → JS, React ← JS", transformed: "Web apps → React: invalid direction", preserved: false, trustLevel: "low", score: 0.25 },
    ],
  },
];

function trustColor(t: string) {
  if (t === "high") return "text-green-600 dark:text-green-400";
  if (t === "low") return "text-red-600 dark:text-red-400";
  return "text-amber-600 dark:text-amber-400";
}

function trustBadge(t: string) {
  if (t === "high") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (t === "low") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
}

export default function LogicalConsistencyDemo() {
  const [activeScenario, setActiveScenario] = useState(0);
  const scenario = SCENARIOS[activeScenario];

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-950">
      <div className="mb-4">
        <h3 className="text-lg font-bold">Logical Consistency Check</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          5 logical transformations test whether claims hold under structural reasoning changes
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

      {/* Statement & Overall */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <p className="text-xs text-gray-500 mb-1">Statement under test</p>
        <p className="text-sm font-medium mb-3">&quot;{scenario.statement}&quot;</p>
        <div className="flex items-center gap-4">
          <div>
            <div className="text-3xl font-bold font-mono" style={{
              color: scenario.consistencyScore >= 0.7 ? "#22c55e" : scenario.consistencyScore >= 0.4 ? "#f59e0b" : "#ef4444",
            }}>{(scenario.consistencyScore * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-gray-500">Consistency Score</div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${trustBadge(scenario.overallTrust)}`}>
            {scenario.overallTrust.toUpperCase()} TRUST
          </span>
        </div>
      </div>

      {/* Transform results */}
      <div className="space-y-2">
        {scenario.transforms.map((t) => {
          const typeInfo = TRANSFORM_TYPES.find(tt => tt.key === t.type);
          return (
            <div key={t.type} className={`border rounded-lg p-3 ${t.preserved ? "border-gray-100 dark:border-gray-800" : "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20"}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{typeInfo?.icon}</span>
                  <span className="text-xs font-bold">{typeInfo?.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${t.preserved ? "text-green-600" : "text-red-600"}`}>
                    {t.preserved ? "✓ PRESERVED" : "✗ BROKEN"}
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trustBadge(t.trustLevel)}`}>
                    {t.trustLevel}
                  </span>
                  <span className="text-xs font-mono text-gray-500">{(t.score * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
                  <span className="text-[10px] text-gray-500">Original</span>
                  <p className="mt-0.5">{t.original}</p>
                </div>
                <div className={`rounded p-2 ${t.preserved ? "bg-gray-50 dark:bg-gray-900" : "bg-red-50 dark:bg-red-950/50"}`}>
                  <span className="text-[10px] text-gray-500">Transformed</span>
                  <p className="mt-0.5">{t.transformed}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
