"use client";

import { useState } from "react";

interface VerificationDimension {
  label: string;
  key: string;
  barColor: string;
}

interface VerifiedClaim {
  claim: string;
  score: number;
  status: "verified" | "unverified" | "disputed";
  evidence: string;
}

interface Scenario {
  label: string;
  response: string;
  verifiedClaims: VerifiedClaim[];
  dimensionScores: Record<string, number>;
  overallScore: number;
  recommendation: "accept" | "revise" | "reject";
}

const DIMENSIONS: VerificationDimension[] = [
  { label: "Factual Accuracy", key: "factualAccuracy", barColor: "bg-blue-500" },
  { label: "Internal Consistency", key: "internalConsistency", barColor: "bg-emerald-500" },
  { label: "Source Verifiability", key: "sourceVerifiability", barColor: "bg-purple-500" },
  { label: "Logical Soundness", key: "logicalSoundness", barColor: "bg-amber-500" },
  { label: "Completeness", key: "completeness", barColor: "bg-rose-500" },
];

const SCENARIOS: Scenario[] = [
  {
    label: "Accurate response",
    response: "Node.js uses the V8 JavaScript engine, originally built for Chrome. It runs on an event-driven, non-blocking I/O model, making it efficient for I/O-heavy applications. npm is its default package manager.",
    overallScore: 0.94,
    recommendation: "accept",
    dimensionScores: { factualAccuracy: 0.96, internalConsistency: 0.95, sourceVerifiability: 0.92, logicalSoundness: 0.94, completeness: 0.88 },
    verifiedClaims: [
      { claim: "Node.js uses the V8 engine", score: 0.98, status: "verified", evidence: "Confirmed: V8 is the JavaScript engine in Node.js" },
      { claim: "V8 was built for Chrome", score: 0.97, status: "verified", evidence: "Confirmed: V8 was developed for Google Chrome" },
      { claim: "Event-driven, non-blocking I/O", score: 0.95, status: "verified", evidence: "Confirmed: core architectural feature of Node.js" },
      { claim: "npm is default package manager", score: 0.93, status: "verified", evidence: "Confirmed: npm ships with Node.js by default" },
    ],
  },
  {
    label: "Needs revision",
    response: "Python was created in 2000 by Guido van Rossum. It is a compiled language that runs directly on hardware. Python 3.0 was released in 2012 and introduced type checking.",
    overallScore: 0.38,
    recommendation: "revise",
    dimensionScores: { factualAccuracy: 0.3, internalConsistency: 0.45, sourceVerifiability: 0.4, logicalSoundness: 0.35, completeness: 0.42 },
    verifiedClaims: [
      { claim: "Python was created in 2000", score: 0.15, status: "disputed", evidence: "Incorrect: Python was first released in 1991" },
      { claim: "Created by Guido van Rossum", score: 0.98, status: "verified", evidence: "Confirmed: Guido van Rossum is Python's creator" },
      { claim: "Python is a compiled language", score: 0.1, status: "disputed", evidence: "Incorrect: Python is interpreted (bytecode-compiled to .pyc)" },
      { claim: "Python 3.0 released in 2012", score: 0.12, status: "disputed", evidence: "Incorrect: Python 3.0 was released in December 2008" },
    ],
  },
  {
    label: "Reject — hallucinated",
    response: "React was created by Microsoft in 2010 as a replacement for Angular. It uses two-way data binding by default and requires jQuery for DOM manipulation.",
    overallScore: 0.12,
    recommendation: "reject",
    dimensionScores: { factualAccuracy: 0.08, internalConsistency: 0.15, sourceVerifiability: 0.1, logicalSoundness: 0.12, completeness: 0.18 },
    verifiedClaims: [
      { claim: "React was created by Microsoft", score: 0.05, status: "disputed", evidence: "Incorrect: React was created by Meta (Facebook)" },
      { claim: "Created in 2010", score: 0.1, status: "disputed", evidence: "Incorrect: React was released in 2013" },
      { claim: "Replacement for Angular", score: 0.08, status: "disputed", evidence: "Incorrect: React was independent; Angular is by Google" },
      { claim: "Uses two-way data binding", score: 0.12, status: "disputed", evidence: "Incorrect: React uses one-way data flow" },
      { claim: "Requires jQuery", score: 0.05, status: "disputed", evidence: "Incorrect: React manages its own virtual DOM" },
    ],
  },
];

function recBadge(r: string) {
  if (r === "accept") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (r === "reject") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
}

function statusIcon(s: string) {
  if (s === "verified") return "✓";
  if (s === "disputed") return "✗";
  return "?";
}

function statusColor(s: string) {
  if (s === "verified") return "text-green-600 dark:text-green-400";
  if (s === "disputed") return "text-red-600 dark:text-red-400";
  return "text-amber-600 dark:text-amber-400";
}

export default function VerifyFirstDemo() {
  const [activeScenario, setActiveScenario] = useState(0);
  const scenario = SCENARIOS[activeScenario];

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-950">
      <div className="mb-4">
        <h3 className="text-lg font-bold">Verify-First Check</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          5-dimension verification: evaluates factual accuracy, consistency, source verifiability, logic, and completeness
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

      {/* Response & Verdict */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <p className="text-xs text-gray-500 mb-1">Response under verification</p>
        <p className="text-sm mb-3">&quot;{scenario.response}&quot;</p>
        <div className="flex items-center gap-4">
          <div>
            <div className="text-3xl font-bold font-mono" style={{
              color: scenario.overallScore >= 0.7 ? "#22c55e" : scenario.overallScore >= 0.4 ? "#f59e0b" : "#ef4444",
            }}>{(scenario.overallScore * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-gray-500">Verification Score</div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${recBadge(scenario.recommendation)}`}>
            {scenario.recommendation.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Dimension bars */}
      <div className="mb-6 space-y-2">
        <p className="text-xs font-medium text-gray-500 mb-1">Verification Dimensions</p>
        {DIMENSIONS.map((d) => {
          const val = scenario.dimensionScores[d.key] ?? 0;
          return (
            <div key={d.key} className="flex items-center gap-3">
              <span className="text-xs w-36 text-gray-600 dark:text-gray-400">{d.label}</span>
              <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full ${d.barColor} rounded-full transition-all`} style={{ width: `${val * 100}%` }} />
              </div>
              <span className="text-xs font-mono w-10 text-right">{(val * 100).toFixed(0)}%</span>
            </div>
          );
        })}
      </div>

      {/* Verified claims */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">Claim-Level Verification</p>
        <div className="space-y-2">
          {scenario.verifiedClaims.map((vc) => (
            <div key={vc.claim} className={`border rounded-lg p-3 ${vc.status === "disputed" ? "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20" : "border-gray-100 dark:border-gray-800"}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium">&quot;{vc.claim}&quot;</p>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${statusColor(vc.status)}`}>{statusIcon(vc.status)}</span>
                  <span className="text-xs font-mono text-gray-500">{(vc.score * 100).toFixed(0)}%</span>
                </div>
              </div>
              <p className="text-xs text-gray-500">{vc.evidence}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
