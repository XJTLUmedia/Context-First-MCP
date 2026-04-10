"use client";

import { useState } from "react";

interface PerturbationType {
  label: string;
  key: string;
  description: string;
}

interface PerturbationResult {
  type: string;
  originalAnswer: string;
  perturbedAnswer: string;
  consistent: boolean;
  similarityScore: number;
}

interface Scenario {
  label: string;
  question: string;
  perturbations: PerturbationResult[];
  ncbScore: number;
  verdict: "robust" | "brittle" | "mixed";
  genuineKnowledgeConfidence: number;
}

const PERTURBATION_TYPES: PerturbationType[] = [
  { label: "Paraphrase", key: "paraphrase", description: "Rephrase the question with different wording" },
  { label: "Negation", key: "negation", description: "Negate key terms to test boundary understanding" },
  { label: "Specificity", key: "specificity", description: "Add specific constraints to narrow the scope" },
  { label: "Temporal", key: "temporal", description: "Shift the time-frame to test temporal robustness" },
  { label: "Counterfactual", key: "counterfactual", description: "Introduce hypothetical changes" },
];

const SCENARIOS: Scenario[] = [
  {
    label: "Factual knowledge",
    question: "What is the capital of France?",
    ncbScore: 0.95,
    verdict: "robust",
    genuineKnowledgeConfidence: 0.97,
    perturbations: [
      { type: "paraphrase", originalAnswer: "Paris", perturbedAnswer: "Paris", consistent: true, similarityScore: 1.0 },
      { type: "negation", originalAnswer: "Paris", perturbedAnswer: "Paris is the capital, not Lyon", consistent: true, similarityScore: 0.92 },
      { type: "specificity", originalAnswer: "Paris", perturbedAnswer: "Paris, since 508 AD", consistent: true, similarityScore: 0.95 },
      { type: "temporal", originalAnswer: "Paris", perturbedAnswer: "Paris (as of 2024)", consistent: true, similarityScore: 0.94 },
      { type: "counterfactual", originalAnswer: "Paris", perturbedAnswer: "Still Paris, the question's premise doesn't change this", consistent: true, similarityScore: 0.88 },
    ],
  },
  {
    label: "Surface pattern matching",
    question: "What language is Next.js written in?",
    ncbScore: 0.35,
    verdict: "brittle",
    genuineKnowledgeConfidence: 0.28,
    perturbations: [
      { type: "paraphrase", originalAnswer: "JavaScript/TypeScript", perturbedAnswer: "JavaScript and TypeScript", consistent: true, similarityScore: 0.95 },
      { type: "negation", originalAnswer: "JavaScript/TypeScript", perturbedAnswer: "It is not written in Python", consistent: true, similarityScore: 0.7 },
      { type: "specificity", originalAnswer: "JavaScript/TypeScript", perturbedAnswer: "Rust for compiler, JavaScript for runtime", consistent: false, similarityScore: 0.3 },
      { type: "temporal", originalAnswer: "JavaScript/TypeScript", perturbedAnswer: "Originally JavaScript, now mostly Rust", consistent: false, similarityScore: 0.25 },
      { type: "counterfactual", originalAnswer: "JavaScript/TypeScript", perturbedAnswer: "If it used Go, it would be faster", consistent: false, similarityScore: 0.15 },
    ],
  },
  {
    label: "Mixed confidence",
    question: "How does garbage collection work in Java?",
    ncbScore: 0.68,
    verdict: "mixed",
    genuineKnowledgeConfidence: 0.65,
    perturbations: [
      { type: "paraphrase", originalAnswer: "Mark-and-sweep with generational collection", perturbedAnswer: "Generational mark-sweep garbage collection", consistent: true, similarityScore: 0.93 },
      { type: "negation", originalAnswer: "Mark-and-sweep with generational collection", perturbedAnswer: "Not reference counting; uses tracing GC", consistent: true, similarityScore: 0.78 },
      { type: "specificity", originalAnswer: "Mark-and-sweep with generational collection", perturbedAnswer: "G1GC uses region-based collection with concurrent marking", consistent: true, similarityScore: 0.72 },
      { type: "temporal", originalAnswer: "Mark-and-sweep with generational collection", perturbedAnswer: "ZGC in Java 21 uses colored pointers, no generations", consistent: false, similarityScore: 0.4 },
      { type: "counterfactual", originalAnswer: "Mark-and-sweep with generational collection", perturbedAnswer: "If Java used ARC like Swift, no GC pauses", consistent: false, similarityScore: 0.35 },
    ],
  },
];

function verdictStyle(verdict: string) {
  if (verdict === "robust") return { bg: "bg-green-100 dark:bg-green-900", text: "text-green-800 dark:text-green-200" };
  if (verdict === "brittle") return { bg: "bg-red-100 dark:bg-red-900", text: "text-red-800 dark:text-red-200" };
  return { bg: "bg-amber-100 dark:bg-amber-900", text: "text-amber-800 dark:text-amber-200" };
}

export default function NeighborhoodDemo() {
  const [activeScenario, setActiveScenario] = useState(0);
  const scenario = SCENARIOS[activeScenario];
  const vs = verdictStyle(scenario.verdict);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-950">
      <div className="mb-4">
        <h3 className="text-lg font-bold">Neighborhood Consistency (NCB)</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          5 perturbation types test if knowledge is genuine or surface-level pattern matching
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

      {/* Question & Verdict */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <p className="text-xs text-gray-500 mb-1">Question under test</p>
        <p className="text-sm font-semibold mb-3">&quot;{scenario.question}&quot;</p>
        <div className="flex items-center gap-4">
          <div>
            <div className="text-3xl font-bold font-mono" style={{
              color: scenario.ncbScore >= 0.7 ? "#22c55e" : scenario.ncbScore >= 0.5 ? "#f59e0b" : "#ef4444",
            }}>{(scenario.ncbScore * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-gray-500">NCB Score</div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${vs.bg} ${vs.text}`}>
            {scenario.verdict.toUpperCase()}
          </span>
          <div className="text-right flex-1">
            <div className="text-lg font-mono font-bold">{(scenario.genuineKnowledgeConfidence * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-gray-500">Genuine Knowledge</div>
          </div>
        </div>
      </div>

      {/* Perturbation results */}
      <div className="space-y-2">
        {scenario.perturbations.map((p) => {
          const typeInfo = PERTURBATION_TYPES.find(t => t.key === p.type);
          return (
            <div key={p.type} className={`border rounded-lg p-3 ${p.consistent ? "border-gray-100 dark:border-gray-800" : "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20"}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-bold">{typeInfo?.label ?? p.type}</span>
                  <span className="text-[10px] text-gray-400 ml-2">{typeInfo?.description}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${p.consistent ? "text-green-600" : "text-red-600"}`}>
                    {p.consistent ? "✓ CONSISTENT" : "✗ INCONSISTENT"}
                  </span>
                  <span className="text-xs font-mono text-gray-500">{(p.similarityScore * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
                  <span className="text-[10px] text-gray-500">Original</span>
                  <p className="mt-0.5">{p.originalAnswer}</p>
                </div>
                <div className={`rounded p-2 ${p.consistent ? "bg-gray-50 dark:bg-gray-900" : "bg-red-50 dark:bg-red-950/50"}`}>
                  <span className="text-[10px] text-gray-500">Perturbed</span>
                  <p className="mt-0.5">{p.perturbedAnswer}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
