"use client";

import { useState, useMemo } from "react";

interface Dimension {
  label: string;
  key: string;
  color: string;
  barColor: string;
}

interface Scenario {
  label: string;
  claim: string;
  scores: Record<string, number>;
  suggestedQuestions: string[];
}

const DIMENSIONS: Dimension[] = [
  {
    label: "State Completeness",
    key: "stateCompleteness",
    color: "text-blue-700 dark:text-blue-300",
    barColor: "bg-blue-500",
  },
  {
    label: "Recency",
    key: "recency",
    color: "text-green-700 dark:text-green-300",
    barColor: "bg-green-500",
  },
  {
    label: "Contradiction-Free",
    key: "contradictionFree",
    color: "text-purple-700 dark:text-purple-300",
    barColor: "bg-purple-500",
  },
  {
    label: "Ambiguity-Free",
    key: "ambiguityFree",
    color: "text-amber-700 dark:text-amber-300",
    barColor: "bg-amber-500",
  },
  {
    label: "Source Quality",
    key: "sourceQuality",
    color: "text-indigo-700 dark:text-indigo-300",
    barColor: "bg-indigo-500",
  },
];

const SCENARIOS: Scenario[] = [
  {
    label: "Deploy to production",
    claim: "Deploy to production",
    scores: {
      stateCompleteness: 0.25,
      recency: 0.4,
      contradictionFree: 0.6,
      ambiguityFree: 0.2,
      sourceQuality: 0.3,
    },
    suggestedQuestions: [
      "What is the deployment target (AWS, Vercel, GCP)?",
      "Have all tests passed in the CI pipeline?",
      "What is the rollback strategy if deployment fails?",
      "Has the staging environment been validated?",
    ],
  },
  {
    label: "Use Express for the API",
    claim: "Use Express for the API",
    scores: {
      stateCompleteness: 0.92,
      recency: 0.88,
      contradictionFree: 0.95,
      ambiguityFree: 0.85,
      sourceQuality: 0.9,
    },
    suggestedQuestions: [],
  },
  {
    label: "Switch database to MongoDB",
    claim: "Switch the database to MongoDB",
    scores: {
      stateCompleteness: 0.45,
      recency: 0.7,
      contradictionFree: 0.35,
      ambiguityFree: 0.5,
      sourceQuality: 0.4,
    },
    suggestedQuestions: [
      "What is the current database and why are we switching?",
      "Have you evaluated the data migration path?",
      "Earlier, PostgreSQL was confirmed — has that decision changed?",
      "What are the schema compatibility requirements?",
    ],
  },
];

function computeOverall(scores: Record<string, number>): number {
  const values = DIMENSIONS.map((d) => scores[d.key] ?? 0);
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function generateScoresForClaim(claim: string): Record<string, number> {
  // Simple keyword-based heuristic for custom claims
  const lower = claim.toLowerCase();
  const hasQuestion = lower.includes("?");
  const isVague =
    /should|maybe|might|could|possibly|perhaps|some|stuff/i.test(lower);
  const isDestructive =
    /delete|drop|remove|destroy|reset|force|production/i.test(lower);

  const base = hasQuestion ? 0.3 : isVague ? 0.4 : isDestructive ? 0.35 : 0.65;

  return {
    stateCompleteness: Math.min(1, base + Math.random() * 0.2),
    recency: Math.min(1, base + 0.1 + Math.random() * 0.15),
    contradictionFree: Math.min(1, base + 0.05 + Math.random() * 0.2),
    ambiguityFree: Math.min(1, isVague ? 0.2 : base + Math.random() * 0.15),
    sourceQuality: Math.min(1, base - 0.05 + Math.random() * 0.2),
  };
}

function generateQuestions(claim: string): string[] {
  const lower = claim.toLowerCase();
  const questions: string[] = [];

  if (/deploy|release|ship/i.test(lower)) {
    questions.push("What is the target environment?");
    questions.push("Have all tests passed?");
  }
  if (/database|db|migrate/i.test(lower)) {
    questions.push("What is the current database setup?");
    questions.push("Has a migration plan been prepared?");
  }
  if (/delete|remove|drop/i.test(lower)) {
    questions.push("Is there a backup of the data being removed?");
    questions.push("Who authorized this destructive operation?");
  }
  if (questions.length === 0) {
    questions.push("What specific evidence supports this claim?");
    questions.push("Are there any known risks or trade-offs?");
    questions.push("Has this been discussed and confirmed by the team?");
  }
  return questions;
}

const ABSTAIN_THRESHOLD = 0.7;

export default function AbstentionDemo() {
  const [claim, setClaim] = useState(SCENARIOS[0].claim);
  const [activeScenario, setActiveScenario] = useState<number>(0);
  const [customMode, setCustomMode] = useState(false);
  const [customScores, setCustomScores] = useState<Record<string, number> | null>(null);

  const currentScenario = SCENARIOS[activeScenario];

  const scores = useMemo(() => {
    if (customMode && customScores) return customScores;
    if (!customMode) return currentScenario.scores;
    // Generate for custom claim
    const generated = generateScoresForClaim(claim);
    return generated;
  }, [customMode, customScores, currentScenario, claim]);

  const overall = computeOverall(scores);
  const shouldProceed = overall >= ABSTAIN_THRESHOLD;

  const questions = useMemo(() => {
    if (!customMode) return currentScenario.suggestedQuestions;
    return overall < ABSTAIN_THRESHOLD ? generateQuestions(claim) : [];
  }, [customMode, currentScenario, overall, claim]);

  const selectScenario = (index: number) => {
    setActiveScenario(index);
    setClaim(SCENARIOS[index].claim);
    setCustomMode(false);
    setCustomScores(null);
  };

  const evaluateCustom = () => {
    if (!claim.trim()) return;
    setCustomMode(true);
    setCustomScores(generateScoresForClaim(claim));
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-950">
      <div className="mb-4">
        <h3 className="text-lg font-bold">Abstention Check (RLAAR)</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Evaluates whether enough verified information exists to proceed confidently
        </p>
      </div>

      {/* Scenario toggles */}
      <div className="flex flex-wrap gap-2 mb-4">
        {SCENARIOS.map((s, i) => (
          <button
            key={s.label}
            onClick={() => selectScenario(i)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              !customMode && activeScenario === i
                ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100"
                : "border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Claim input */}
      <div className="mb-6">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
          Claim to evaluate
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={claim}
            onChange={(e) => {
              setClaim(e.target.value);
              if (customMode) setCustomScores(null);
            }}
            placeholder='e.g. "Deploy to production"'
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={evaluateCustom}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Evaluate
          </button>
        </div>
      </div>

      {/* Verdict */}
      <div className="text-center mb-6">
        <div className="text-4xl font-bold font-mono mb-2" style={{
          color: shouldProceed ? "#22c55e" : "#ef4444",
        }}>
          {(overall * 100).toFixed(0)}%
        </div>
        <span
          className={`inline-block text-sm font-bold px-4 py-1.5 rounded-full ${
            shouldProceed
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
          }`}
        >
          {shouldProceed ? "✓ PROCEED" : "✗ ABSTAIN"}
        </span>
      </div>

      {/* Dimension bars */}
      <div className="space-y-3 mb-6">
        {DIMENSIONS.map((dim) => {
          const value = scores[dim.key] ?? 0;
          return (
            <div key={dim.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className={`font-medium ${dim.color}`}>{dim.label}</span>
                <span className="font-mono text-gray-500 dark:text-gray-400">
                  {(value * 100).toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${dim.barColor}`}
                  style={{ width: `${value * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Suggested questions */}
      {!shouldProceed && questions.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="text-sm font-bold text-red-800 dark:text-red-200 mb-2">
            Suggested Clarifying Questions
          </div>
          <ul className="space-y-1">
            {questions.map((q, i) => (
              <li
                key={i}
                className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2"
              >
                <span className="text-red-400 mt-0.5">→</span>
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {shouldProceed && (
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="text-sm font-bold text-green-800 dark:text-green-200 mb-1">
            ✓ Sufficient confidence to proceed
          </div>
          <p className="text-xs text-green-700 dark:text-green-300">
            All confidence dimensions are within acceptable thresholds. The model has enough
            verified context to make this assertion reliably.
          </p>
        </div>
      )}
    </div>
  );
}
