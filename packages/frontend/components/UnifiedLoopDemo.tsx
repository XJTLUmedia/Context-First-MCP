"use client";

import { useState, useRef, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type StageStatus = "pending" | "running" | "completed" | "skipped" | "error";
type Action = "proceed" | "clarify" | "reset" | "abstain";

interface Stage {
  id: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  status: StageStatus;
  durationMs: number;
  result: string | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  turn: number;
}

interface Scenario {
  name: string;
  description: string;
  messages: Message[];
  currentInput: string;
  expectedAction: Action;
}

interface LoopResult {
  action: Action;
  summary: string;
  stages: StageResult[];
  totalMs: number;
}

interface StageResult {
  id: string;
  label: string;
  status: "completed" | "skipped" | "error";
  durationMs: number;
  detail: string;
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

const SCENARIOS: Scenario[] = [
  {
    name: "Healthy Conversation",
    description: "Clean context, no issues detected",
    messages: [
      { role: "user", content: "Build a REST API with Express.js using TypeScript and PostgreSQL", turn: 1 },
      { role: "assistant", content: "I'll create a REST API with Express.js, TypeScript, and PostgreSQL. Let me set up the project structure with proper typing.", turn: 2 },
      { role: "user", content: "Add JWT authentication with refresh tokens", turn: 3 },
      { role: "assistant", content: "Added JWT authentication with access and refresh token rotation. The auth middleware validates tokens on protected routes.", turn: 4 },
    ],
    currentInput: "Add JWT authentication with refresh tokens",
    expectedAction: "proceed",
  },
  {
    name: "Contradictory Requirements",
    description: "User changes tech stack mid-conversation",
    messages: [
      { role: "user", content: "Build the frontend with React and TypeScript", turn: 1 },
      { role: "assistant", content: "Setting up React with TypeScript. I'll use Vite as the build tool with proper TSConfig.", turn: 2 },
      { role: "user", content: "Actually, don't use React. Switch to Vue instead. And we agreed on Angular before.", turn: 3 },
      { role: "assistant", content: "I think maybe we could possibly use either Vue or perhaps Angular, not sure which is better, it depends on various factors...", turn: 4 },
    ],
    currentInput: "Actually, don't use React. Switch to Vue instead. And we agreed on Angular before.",
    expectedAction: "clarify",
  },
  {
    name: "Degraded Context",
    description: "High entropy with hedging and repetition",
    messages: [
      { role: "user", content: "Optimize the database queries for the user dashboard", turn: 1 },
      { role: "assistant", content: "Maybe we could perhaps try to possibly optimize some things. I think the queries might be slow but not sure. Perhaps we should look at maybe adding some indexes or something.", turn: 2 },
      { role: "user", content: "Which specific queries need optimization?", turn: 3 },
      { role: "assistant", content: "Well it depends on various factors. Maybe the user query or perhaps the dashboard query. I'm not sure which is slower. It could be either one possibly. Perhaps we should probably maybe look at both eventually.", turn: 4 },
    ],
    currentInput: "Which specific queries need optimization?",
    expectedAction: "reset",
  },
];

// ─── Stage Definitions ───────────────────────────────────────────────────────

function makeStages(): Stage[] {
  return [
    { id: "ingest", label: "Ingest", color: "text-blue-400", bgColor: "bg-blue-500/20", borderColor: "border-blue-500/50", status: "pending", durationMs: 0, result: null },
    { id: "recap", label: "Recap", color: "text-indigo-400", bgColor: "bg-indigo-500/20", borderColor: "border-indigo-500/50", status: "pending", durationMs: 0, result: null },
    { id: "conflict", label: "Conflict", color: "text-red-400", bgColor: "bg-red-500/20", borderColor: "border-red-500/50", status: "pending", durationMs: 0, result: null },
    { id: "ambiguity", label: "Ambiguity", color: "text-amber-400", bgColor: "bg-amber-500/20", borderColor: "border-amber-500/50", status: "pending", durationMs: 0, result: null },
    { id: "entropy", label: "Entropy", color: "text-purple-400", bgColor: "bg-purple-500/20", borderColor: "border-purple-500/50", status: "pending", durationMs: 0, result: null },
    { id: "abstention", label: "Abstention", color: "text-orange-400", bgColor: "bg-orange-500/20", borderColor: "border-orange-500/50", status: "pending", durationMs: 0, result: null },
    { id: "discovery", label: "Discovery", color: "text-green-400", bgColor: "bg-green-500/20", borderColor: "border-green-500/50", status: "pending", durationMs: 0, result: null },
  ];
}

// ─── Simulation Engine ───────────────────────────────────────────────────────

function simulateRecap(messages: Message[]): { flagged: boolean; detail: string } {
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  const last = assistantMsgs[assistantMsgs.length - 1];
  const summary = last
    ? last.content.split(".").slice(0, 1).join(".") + "."
    : "No assistant messages found.";
  return { flagged: false, detail: `Last decision: "${summary}"` };
}

function simulateConflict(currentInput: string, messages: Message[]): { flagged: boolean; detail: string } {
  const negationWords = ["don't", "not", "switch", "instead", "actually", "don't"];
  const lower = currentInput.toLowerCase();
  const found = negationWords.filter((w) => lower.includes(w));
  const hasAssistantRef = messages.some(
    (m) => m.role === "assistant" && m.content.toLowerCase().split(" ").some((w) => lower.includes(w) && w.length > 4)
  );
  const flagged = found.length >= 2 || (found.length >= 1 && hasAssistantRef);
  return {
    flagged,
    detail: flagged
      ? `Negation detected: [${found.join(", ")}]. Possible contradiction with prior assistant statements.`
      : "No conflicts detected between current input and conversation history.",
  };
}

function simulateAmbiguity(currentInput: string): { flagged: boolean; detail: string } {
  const vagueWords = ["something", "maybe", "perhaps", "some", "stuff", "things", "possibly"];
  const lower = currentInput.toLowerCase();
  const found = vagueWords.filter((w) => lower.includes(w));
  const flagged = found.length >= 2;
  return {
    flagged,
    detail: flagged
      ? `Vague terms found: [${found.join(", ")}]. Input is underspecified.`
      : found.length === 1
        ? `Minor vagueness: [${found[0]}], within acceptable range.`
        : "Input is specific and well-defined.",
  };
}

function simulateEntropy(messages: Message[]): { flagged: boolean; score: number; detail: string } {
  const hedgeWords = ["maybe", "perhaps", "possibly", "not sure", "it depends", "might", "could be", "i think", "probably"];
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  const allText = assistantMsgs.map((m) => m.content.toLowerCase()).join(" ");
  let count = 0;
  for (const w of hedgeWords) {
    const regex = new RegExp(w, "gi");
    const matches = allText.match(regex);
    if (matches) count += matches.length;
  }
  const score = Math.min(1, count * 0.08);
  const flagged = score > 0.6;
  return {
    flagged,
    score: Math.round(score * 100) / 100,
    detail: flagged
      ? `Entropy score: ${Math.round(score * 100)}%. ${count} hedge markers found across ${assistantMsgs.length} assistant messages. Context quality degraded.`
      : `Entropy score: ${Math.round(score * 100)}%. ${count} hedge markers found. Within normal range.`,
  };
}

function simulateAbstention(conflictFlag: boolean, ambiguityFlag: boolean, entropyFlag: boolean): { flagged: boolean; detail: string } {
  const flags = [conflictFlag, ambiguityFlag, entropyFlag].filter(Boolean).length;
  const flagged = flags >= 2;
  return {
    flagged,
    detail: flagged
      ? `${flags}/3 quality gates failed. Confidence too low to proceed without clarification.`
      : flags === 1
        ? "1/3 quality gates flagged. Marginal confidence — proceeding with caution."
        : "All quality gates passed. Confidence is high.",
  };
}

function simulateDiscovery(): { detail: string } {
  return { detail: 'Top match: "context_loop" — unified pipeline for all context management stages.' };
}

function deriveAction(conflictFlag: boolean, ambiguityFlag: boolean, entropyFlag: boolean, abstentionFlag: boolean): Action {
  if (abstentionFlag) return "abstain";
  if (entropyFlag && !conflictFlag) return "reset";
  if (conflictFlag || ambiguityFlag) return "clarify";
  return "proceed";
}

function buildSummary(action: Action, scenario: Scenario): string {
  switch (action) {
    case "proceed":
      return `Context is healthy across all 7 stages. Safe to proceed with: "${scenario.currentInput}"`;
    case "clarify":
      return `Contradictions or ambiguity detected in the conversation. Recommend pausing to clarify requirements before proceeding.`;
    case "reset":
      return `High entropy detected in assistant outputs. Context quality has degraded. Recommend resetting conversation state.`;
    case "abstain":
      return `Multiple quality gates failed. Insufficient confidence to proceed. Recommend abstaining and gathering more information.`;
  }
}

// ─── Action Badge ────────────────────────────────────────────────────────────

const ACTION_STYLES: Record<Action, { bg: string; text: string; label: string }> = {
  proceed: { bg: "bg-green-500/20 border-green-500/50", text: "text-green-400", label: "PROCEED" },
  clarify: { bg: "bg-amber-500/20 border-amber-500/50", text: "text-amber-400", label: "CLARIFY" },
  reset: { bg: "bg-purple-500/20 border-purple-500/50", text: "text-purple-400", label: "RESET" },
  abstain: { bg: "bg-red-500/20 border-red-500/50", text: "text-red-400", label: "ABSTAIN" },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function UnifiedLoopDemo() {
  const [selectedScenario, setSelectedScenario] = useState(0);
  const [stages, setStages] = useState<Stage[]>(makeStages);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LoopResult | null>(null);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const reset = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setStages(makeStages());
    setResult(null);
    setRunning(false);
    setExpandedStage(null);
  }, []);

  const runLoop = useCallback(() => {
    reset();
    setRunning(true);

    const scenario = SCENARIOS[selectedScenario];
    const stageResults: StageResult[] = [];
    const stageCount = 7;
    const staggerMs = 200;
    const processingMs = 300;

    // Run simulation upfront so we have results
    const recapResult = simulateRecap(scenario.messages);
    const conflictResult = simulateConflict(scenario.currentInput, scenario.messages);
    const ambiguityResult = simulateAmbiguity(scenario.currentInput);
    const entropyResult = simulateEntropy(scenario.messages);
    const abstentionResult = simulateAbstention(conflictResult.flagged, ambiguityResult.flagged, entropyResult.flagged);
    const discoveryResult = simulateDiscovery();
    const action = deriveAction(conflictResult.flagged, ambiguityResult.flagged, entropyResult.flagged, abstentionResult.flagged);

    const simResults = [
      { flagged: false, detail: `Ingested ${scenario.messages.length} messages, current input accepted.` },
      recapResult,
      conflictResult,
      ambiguityResult,
      { flagged: entropyResult.flagged, detail: entropyResult.detail },
      abstentionResult,
      { flagged: false, detail: discoveryResult.detail },
    ];

    for (let i = 0; i < stageCount; i++) {
      const startDelay = i * (staggerMs + processingMs);
      const endDelay = startDelay + processingMs;

      // Set stage to "running"
      const tStart = setTimeout(() => {
        setStages((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "running" } : s)));
      }, startDelay);
      timeoutsRef.current.push(tStart);

      // Set stage to "completed" or "error"
      const tEnd = setTimeout(() => {
        const sim = simResults[i];
        const status: StageStatus = sim.flagged ? "error" : "completed";
        const duration = processingMs + Math.round(Math.random() * 50);

        setStages((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status, durationMs: duration, result: sim.detail } : s))
        );

        stageResults.push({
          id: makeStages()[i].id,
          label: makeStages()[i].label,
          status: sim.flagged ? "error" : "completed",
          durationMs: duration,
          detail: sim.detail,
        });

        // After last stage, set final result
        if (i === stageCount - 1) {
          const totalMs = stageResults.reduce((sum, r) => sum + r.durationMs, 0);
          setResult({
            action,
            summary: buildSummary(action, scenario),
            stages: stageResults,
            totalMs,
          });
          setRunning(false);
        }
      }, endDelay);
      timeoutsRef.current.push(tEnd);
    }
  }, [selectedScenario, reset]);

  const scenario = SCENARIOS[selectedScenario];
  const actionStyle = result ? ACTION_STYLES[result.action] : null;

  return (
    <div className="space-y-6">
      {/* Scenario Selector */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Select Scenario</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SCENARIOS.map((s, i) => (
            <button
              key={s.name}
              onClick={() => { setSelectedScenario(i); reset(); }}
              disabled={running}
              className={`text-left p-4 rounded-lg border transition-all duration-200 ${
                selectedScenario === i
                  ? "border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/30"
                  : "border-gray-700 bg-gray-800/30 hover:border-gray-600"
              } ${running ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className="font-medium text-sm">{s.name}</div>
              <div className="text-xs text-gray-400 mt-1">{s.description}</div>
              <div className={`text-xs mt-2 font-mono ${
                s.expectedAction === "proceed" ? "text-green-400" :
                s.expectedAction === "clarify" ? "text-amber-400" :
                "text-purple-400"
              }`}>
                → {s.expectedAction}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Preview */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Conversation</h3>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {scenario.messages.map((m, i) => (
            <div key={i} className={`flex gap-2 text-sm ${m.role === "user" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[80%] px-3 py-2 rounded-lg ${
                m.role === "user"
                  ? "bg-blue-500/15 border border-blue-500/30 text-blue-200"
                  : "bg-gray-700/50 border border-gray-600 text-gray-300"
              }`}>
                <span className="text-xs font-mono text-gray-500 mr-2">{m.role === "user" ? "USER" : "ASST"}</span>
                {m.content}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Run Button */}
      <div className="flex justify-center">
        <button
          onClick={runLoop}
          disabled={running}
          className={`px-8 py-3 rounded-lg font-semibold text-sm transition-all duration-200 ${
            running
              ? "bg-gray-700 text-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20"
          }`}
        >
          {running ? "Running Pipeline..." : "▶ Run Loop"}
        </button>
      </div>

      {/* Pipeline Visualization */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Pipeline</h3>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {stages.map((stage, i) => (
            <div key={stage.id} className="flex items-center gap-2 flex-1">
              {/* Stage Card */}
              <div
                className={`flex-1 border rounded-lg p-3 text-center transition-all duration-300 ${
                  stage.status === "pending"
                    ? "border-gray-700 bg-gray-800/30"
                    : stage.status === "running"
                      ? `${stage.borderColor} ${stage.bgColor} animate-pulse`
                      : stage.status === "error"
                        ? "border-red-500/60 bg-red-500/15"
                        : `${stage.borderColor} ${stage.bgColor}`
                }`}
              >
                <div className={`text-xs font-bold uppercase tracking-wide ${
                  stage.status === "pending" ? "text-gray-500"
                    : stage.status === "error" ? "text-red-400"
                      : stage.color
                }`}>
                  {stage.label}
                </div>
                <div className="mt-1">
                  {stage.status === "pending" && <span className="text-[10px] text-gray-600">●</span>}
                  {stage.status === "running" && <span className="text-[10px] text-yellow-400">⟳</span>}
                  {stage.status === "completed" && <span className="text-[10px] text-green-400">✓</span>}
                  {stage.status === "error" && <span className="text-[10px] text-red-400">✗</span>}
                </div>
                {stage.durationMs > 0 && (
                  <div className="text-[10px] text-gray-500 mt-1">{stage.durationMs}ms</div>
                )}
              </div>
              {/* Arrow between stages */}
              {i < stages.length - 1 && (
                <span className="hidden sm:block text-gray-600 text-xs">→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Result Panel */}
      {result && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 space-y-4 transition-all duration-300">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Unified Result</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 font-mono">Total: {result.totalMs}ms</span>
              {actionStyle && (
                <span className={`px-3 py-1 text-xs font-bold rounded-full border ${actionStyle.bg} ${actionStyle.text}`}>
                  {actionStyle.label}
                </span>
              )}
            </div>
          </div>

          {/* Summary */}
          <p className="text-sm text-gray-300 leading-relaxed">{result.summary}</p>

          {/* Stage Details */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Stage Details</h4>
            {result.stages.map((sr) => (
              <div key={sr.id}>
                <button
                  onClick={() => setExpandedStage(expandedStage === sr.id ? null : sr.id)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-700/50 hover:border-gray-600 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${sr.status === "error" ? "text-red-400" : "text-green-400"}`}>
                      {sr.status === "error" ? "✗" : "✓"}
                    </span>
                    <span className="text-sm font-medium text-gray-300">{sr.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-mono">{sr.durationMs}ms</span>
                    <span className="text-xs text-gray-600">{expandedStage === sr.id ? "▼" : "▶"}</span>
                  </div>
                </button>
                {expandedStage === sr.id && (
                  <div className="mt-1 px-3 py-2 bg-gray-900/50 rounded-lg border border-gray-800">
                    <p className="text-xs text-gray-400 font-mono leading-relaxed">{sr.detail}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
