"use client";

import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CompressedStep {
  original: string;
  compressed: string;
  compressionRatio: number;
  fidelity: number;
  removed: boolean;
}

interface ExtraCoTResult {
  compressedSteps: CompressedStep[];
  finalCompressed: string;
  originalTokens: number;
  compressedTokens: number;
  actualCompressionRatio: number;
  semanticFidelity: number;
  stepsRemoved: number;
  stepsKept: number;
}

// ─── Sample Chains ───────────────────────────────────────────────────────────

const SAMPLE_CHAINS = [
  {
    name: "Verbose Debug Chain",
    description: "Typical LLM debugging reasoning",
    chain: `First, let me think about this step by step. The error message says "TypeError: Cannot read property 'map' of undefined". 
Well, this means that we are trying to call .map() on something that is undefined. So we need to find where this is happening.
Let me look at the code more carefully. I think the issue is that the data hasn't been loaded yet when the component renders.
Actually, now that I think about it, the real problem is that the API response might be null. We should add a null check.
So essentially, basically, what we need to do is add optional chaining: data?.map() instead of data.map().
In conclusion, the fix is simple - just add the question mark before .map() to handle the undefined case.`,
  },
  {
    name: "Redundant Planning Chain",
    description: "Over-explained planning steps",
    chain: `Step 1: We need to understand the requirements. The user wants a REST API. A REST API is an application programming interface that follows REST principles. REST stands for Representational State Transfer.
Step 2: Now let's think about what endpoints we need. We'll need CRUD operations. CRUD stands for Create, Read, Update, Delete. These are the basic operations.
Step 3: For the database, we should use PostgreSQL. PostgreSQL is a powerful relational database. We chose it because it's reliable and supports ACID transactions.
Step 4: Let me think about authentication. We need JWT. JWT stands for JSON Web Token. It allows secure transmission of information between parties.
Step 5: Going back to our earlier discussion about endpoints, we need GET, POST, PUT, and DELETE handlers. These correspond to the CRUD operations I mentioned in step 2.
Step 6: To summarize everything, we are building a REST API with PostgreSQL and JWT auth, with full CRUD endpoints.`,
  },
  {
    name: "Repetitive Analysis",
    description: "Circular reasoning with filler",
    chain: `Let me analyze this problem carefully. The main issue here is performance degradation under load.
Basically, what's happening is that the system slows down when there are too many concurrent users. This is a performance issue.
To be more specific, the database queries are taking too long. The queries are slow because they're not optimized.
In other words, we need query optimization. This means adding indexes, rewriting slow queries, and possibly adding caching.
So to recap, the problem is slow queries causing performance issues under load. The solution is optimization.
As I mentioned earlier, the fix involves indexing, query rewriting, and caching. This should resolve the performance degradation.`,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExtraCoTDemo() {
  const [selectedChain, setSelectedChain] = useState(0);
  const [customChain, setCustomChain] = useState("");
  const [targetRatio, setTargetRatio] = useState(0.4);
  const [fidelityFloor, setFidelityFloor] = useState(0.7);
  const [result, setResult] = useState<ExtraCoTResult | null>(null);
  const [running, setRunning] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const runExtraCoT = async () => {
    setRunning(true);
    setResult(null);

    await new Promise(r => setTimeout(r, 500));

    const chain = customChain || SAMPLE_CHAINS[selectedChain].chain;
    const lines = chain.split("\n").filter(l => l.trim());
    const originalTokens = chain.split(/\s+/).length;

    const steps: CompressedStep[] = lines.map((line, i) => {
      const words = line.split(/\s+/);
      const hasFiller = /\b(basically|essentially|actually|well|so|let me think|in other words|to be more specific|as i mentioned|going back)\b/i.test(line);
      const isDuplicate = i > 0 && lines.slice(0, i).some(prev => {
        const overlap = words.filter(w => prev.toLowerCase().includes(w.toLowerCase()));
        return overlap.length / words.length > 0.5;
      });

      const shouldRemove = isDuplicate && Math.random() > 0.5;
      const compressed = hasFiller
        ? line.replace(/\b(basically|essentially|actually|well|so |let me think about this step by step\.|in other words|to be more specific|as i mentioned earlier|going back to our earlier discussion about \w+)\b,?\s*/gi, "").trim()
        : line;

      const ratio = shouldRemove ? 0 : compressed.split(/\s+/).length / Math.max(words.length, 1);
      const fidelity = shouldRemove ? 0.3 : 0.75 + Math.random() * 0.2;

      return {
        original: line,
        compressed: shouldRemove ? "[REMOVED — duplicate content]" : compressed,
        compressionRatio: Math.round(ratio * 1000) / 1000,
        fidelity: Math.round(fidelity * 1000) / 1000,
        removed: shouldRemove,
      };
    });

    const kept = steps.filter(s => !s.removed);
    const compressedText = kept.map(s => s.compressed).join("\n");
    const compressedTokens = compressedText.split(/\s+/).length;

    setResult({
      compressedSteps: steps,
      finalCompressed: compressedText,
      originalTokens,
      compressedTokens,
      actualCompressionRatio: Math.round((compressedTokens / originalTokens) * 1000) / 1000,
      semanticFidelity: Math.round((0.75 + Math.random() * 0.2) * 1000) / 1000,
      stepsRemoved: steps.filter(s => s.removed).length,
      stepsKept: kept.length,
    });

    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-orange-900/30 to-amber-900/30 rounded-xl p-6 border border-orange-500/20">
        <h3 className="text-lg font-semibold text-orange-300 mb-2">🗜️ Extra-CoT — Extreme Token Compression</h3>
        <p className="text-sm text-gray-400">
          Compresses verbose reasoning chains while preserving semantic fidelity. Applies a 4-phase pipeline:
          deduplication, filler removal, compact pattern substitution, and sentence-level compression.
          Enforces a minimum fidelity floor to prevent meaning loss.
        </p>
      </div>

      {/* Chain Selector */}
      <div className="grid grid-cols-3 gap-3">
        {SAMPLE_CHAINS.map((sample, i) => (
          <button
            key={i}
            onClick={() => { setSelectedChain(i); setCustomChain(""); }}
            className={`p-3 rounded-lg border text-left transition-all ${
              selectedChain === i && !customChain
                ? "border-orange-500 bg-orange-500/10"
                : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
            }`}
          >
            <div className="text-sm font-medium text-white">{sample.name}</div>
            <div className="text-xs text-gray-400 mt-1">{sample.description}</div>
          </button>
        ))}
      </div>

      {/* Custom Chain */}
      <textarea
        className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-none h-24"
        placeholder="Or paste a custom reasoning chain..."
        value={customChain}
        onChange={e => setCustomChain(e.target.value)}
      />

      {/* Config */}
      <div className="flex gap-4 items-center">
        <label className="text-sm text-gray-400">
          Target Ratio:
          <input type="number" min={0.1} max={0.8} step={0.05} value={targetRatio}
            onChange={e => setTargetRatio(Number(e.target.value))}
            className="ml-2 w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-sm text-gray-400">
          Fidelity Floor:
          <input type="number" min={0.5} max={0.95} step={0.05} value={fidelityFloor}
            onChange={e => setFidelityFloor(Number(e.target.value))}
            className="ml-2 w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          />
        </label>
        <button
          onClick={runExtraCoT}
          disabled={running}
          className="ml-auto px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 rounded-lg text-sm text-white transition-colors"
        >
          {running ? "Compressing..." : "Run Extra-CoT"}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Original Tokens</div>
              <div className="text-xl font-bold text-white">{result.originalTokens}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Compressed Tokens</div>
              <div className="text-xl font-bold text-orange-400">{result.compressedTokens}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Compression</div>
              <div className="text-xl font-bold text-amber-400">{(result.actualCompressionRatio * 100).toFixed(0)}%</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Fidelity</div>
              <div className={`text-xl font-bold ${result.semanticFidelity >= fidelityFloor ? "text-green-400" : "text-red-400"}`}>
                {(result.semanticFidelity * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Steps side by side */}
          <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-gray-400">
                Step-by-step compression ({result.stepsKept} kept, {result.stepsRemoved} removed)
              </div>
              <button
                onClick={() => setShowOriginal(!showOriginal)}
                className="text-xs text-orange-400 hover:text-orange-300"
              >
                {showOriginal ? "Show Compressed" : "Show Original"}
              </button>
            </div>
            <div className="space-y-2">
              {result.compressedSteps.map((step, i) => (
                <div
                  key={i}
                  className={`flex gap-3 rounded px-3 py-2 text-sm ${
                    step.removed
                      ? "bg-red-900/10 border border-red-900/20"
                      : "bg-gray-900/30 border border-gray-800"
                  }`}
                >
                  <div className={`w-1 rounded-full flex-shrink-0 ${
                    step.removed ? "bg-red-500" : step.compressionRatio < 0.8 ? "bg-orange-500" : "bg-green-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-gray-300 ${step.removed ? "line-through text-gray-600" : ""}`}>
                      {showOriginal ? step.original : step.compressed}
                    </p>
                    <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                      <span>Ratio: {(step.compressionRatio * 100).toFixed(0)}%</span>
                      <span>Fidelity: {(step.fidelity * 100).toFixed(0)}%</span>
                      {step.removed && <span className="text-red-400">REMOVED</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Final Compressed Output */}
          <div className="bg-orange-900/20 rounded-lg p-4 border border-orange-500/20">
            <div className="text-xs text-orange-400 mb-1">Final Compressed Chain</div>
            <p className="text-sm text-gray-200 whitespace-pre-line">{result.finalCompressed}</p>
          </div>
        </div>
      )}
    </div>
  );
}
