"use client";

import { useState } from "react";

interface ConfidenceMetric {
  label: string;
  key: string;
  barColor: string;
}

interface Scenario {
  label: string;
  originalResponse: string;
  metrics: Record<string, number>;
  overallConfidence: number;
  decision: "accept" | "correct" | "escalate";
  correctedResponse: string | null;
  correctionExplanation: string | null;
}

const METRICS: ConfidenceMetric[] = [
  { label: "Internal Certainty", key: "internalCertainty", barColor: "bg-blue-500" },
  { label: "Cross-Verification", key: "crossVerification", barColor: "bg-emerald-500" },
  { label: "Reasoning Trace", key: "reasoningTrace", barColor: "bg-purple-500" },
  { label: "Source Grounding", key: "sourceGrounding", barColor: "bg-amber-500" },
  { label: "Calibration Score", key: "calibrationScore", barColor: "bg-rose-500" },
];

const SCENARIOS: Scenario[] = [
  {
    label: "Confident & correct",
    originalResponse: "The HTTP status code 404 means 'Not Found'. It indicates that the server cannot find the requested resource.",
    metrics: { internalCertainty: 0.97, crossVerification: 0.96, reasoningTrace: 0.94, sourceGrounding: 0.98, calibrationScore: 0.95 },
    overallConfidence: 0.96,
    decision: "accept",
    correctedResponse: null,
    correctionExplanation: null,
  },
  {
    label: "Self-correctable",
    originalResponse: "Git was created by Linus Torvalds in 2003 to manage the Linux kernel source code after the BitKeeper license was revoked.",
    metrics: { internalCertainty: 0.65, crossVerification: 0.5, reasoningTrace: 0.6, sourceGrounding: 0.45, calibrationScore: 0.55 },
    overallConfidence: 0.55,
    decision: "correct",
    correctedResponse: "Git was created by Linus Torvalds in 2005 (not 2003) to manage the Linux kernel source code after the BitKeeper free-use license was revoked.",
    correctionExplanation: "Cross-verification detected date inconsistency: multiple sources confirm 2005, not 2003. Other claims verified correctly.",
  },
  {
    label: "Needs escalation",
    originalResponse: "Quantum error correction requires at least 1000 logical qubits for practical fault tolerance, achievable by 2025 with current superconducting technology.",
    metrics: { internalCertainty: 0.25, crossVerification: 0.2, reasoningTrace: 0.3, sourceGrounding: 0.15, calibrationScore: 0.18 },
    overallConfidence: 0.22,
    decision: "escalate",
    correctedResponse: null,
    correctionExplanation: "Multiple metrics below confidence threshold. Claims involve rapidly evolving research with conflicting expert opinions. Self-correction insufficient — requires authoritative source verification.",
  },
];

function decisionBadge(d: string) {
  if (d === "accept") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (d === "escalate") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
}

export default function IoEDemo() {
  const [activeScenario, setActiveScenario] = useState(0);
  const scenario = SCENARIOS[activeScenario];

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-950">
      <div className="mb-4">
        <h3 className="text-lg font-bold">IoE Self-Correction</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          5-metric confidence evaluation: accept if confident, self-correct if possible, escalate if uncertain
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
        <p className="text-xs text-gray-500 mb-1">Original Response</p>
        <p className="text-sm mb-3">&quot;{scenario.originalResponse}&quot;</p>
        <div className="flex items-center gap-4">
          <div>
            <div className="text-3xl font-bold font-mono" style={{
              color: scenario.overallConfidence >= 0.7 ? "#22c55e" : scenario.overallConfidence >= 0.4 ? "#f59e0b" : "#ef4444",
            }}>{(scenario.overallConfidence * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-gray-500">Overall Confidence</div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${decisionBadge(scenario.decision)}`}>
            {scenario.decision.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Confidence metrics */}
      <div className="mb-6 space-y-2">
        <p className="text-xs font-medium text-gray-500 mb-1">Confidence Metrics</p>
        {METRICS.map((m) => {
          const val = scenario.metrics[m.key] ?? 0;
          return (
            <div key={m.key} className="flex items-center gap-3">
              <span className="text-xs w-36 text-gray-600 dark:text-gray-400">{m.label}</span>
              <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full ${m.barColor} rounded-full transition-all`} style={{ width: `${val * 100}%` }} />
              </div>
              <span className="text-xs font-mono w-10 text-right">{(val * 100).toFixed(0)}%</span>
            </div>
          );
        })}
      </div>

      {/* Correction result */}
      {scenario.decision === "correct" && scenario.correctedResponse && (
        <div className="p-4 border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50 dark:bg-amber-950/30">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-2">Self-Corrected Response</p>
          <p className="text-sm mb-2">&quot;{scenario.correctedResponse}&quot;</p>
          <p className="text-xs text-amber-600 dark:text-amber-400">{scenario.correctionExplanation}</p>
        </div>
      )}

      {scenario.decision === "escalate" && scenario.correctionExplanation && (
        <div className="p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/30">
          <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-2">Escalation Required</p>
          <p className="text-xs text-red-600 dark:text-red-400">{scenario.correctionExplanation}</p>
        </div>
      )}

      {scenario.decision === "accept" && (
        <div className="p-4 border border-green-200 dark:border-green-800 rounded-lg bg-green-50 dark:bg-green-950/30">
          <p className="text-xs font-medium text-green-700 dark:text-green-300">Response accepted — all confidence metrics above threshold.</p>
        </div>
      )}
    </div>
  );
}
