"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LiveDemo } from "../../components/LiveDemo";
import EntropyChart from "../../components/EntropyChart";
import DiscoveryPlayground from "../../components/DiscoveryPlayground";
import QuarantineVisualizer from "../../components/QuarantineVisualizer";
import AbstentionDemo from "../../components/AbstentionDemo";
import UnifiedLoopDemo from "../../components/UnifiedLoopDemo";
import MemoryDemo from "../../components/MemoryDemo";
import InftyThinkDemo from "../../components/InftyThinkDemo";
import CoconutDemo from "../../components/CoconutDemo";
import ExtraCoTDemo from "../../components/ExtraCoTDemo";
import MindEvolutionDemo from "../../components/MindEvolutionDemo";
import KAGThinkerDemo from "../../components/KAGThinkerDemo";
import InternalStateDemo from "../../components/InternalStateDemo";
import TruthDirectionDemo from "../../components/TruthDirectionDemo";
import NeighborhoodDemo from "../../components/NeighborhoodDemo";
import LogicalConsistencyDemo from "../../components/LogicalConsistencyDemo";
import VerifyFirstDemo from "../../components/VerifyFirstDemo";
import IoEDemo from "../../components/IoEDemo";
import SelfCritiqueDemo from "../../components/SelfCritiqueDemo";

type Tab = "core" | "advanced" | "loop" | "memory" | "reasoning" | "truthfulness";

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState<Tab>("core");

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold mb-4">Interactive Demo</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Try the Context-First MCP tools. All demos run client-side — no server
        connection needed.
      </p>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-8 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("core")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "core"
              ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Core Tools Demo
        </button>
        <button
          onClick={() => setActiveTab("advanced")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "advanced"
              ? "border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Advanced Features
        </button>
        <button
          onClick={() => setActiveTab("loop")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "loop"
              ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          ✦ Unified Loop
        </button>
        <button
          onClick={() => setActiveTab("memory")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "memory"
              ? "border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          🧠 Memory System
        </button>
        <button
          onClick={() => setActiveTab("reasoning")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "reasoning"
              ? "border-orange-600 text-orange-600 dark:border-orange-400 dark:text-orange-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          🧪 Reasoning Paradigms
        </button>
        <button
          onClick={() => setActiveTab("truthfulness")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "truthfulness"
              ? "border-cyan-600 text-cyan-600 dark:border-cyan-400 dark:text-cyan-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          🔬 Truthfulness
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
      {activeTab === "core" && <LiveDemo />}

      {activeTab === "advanced" && (
        <div className="space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-2">Entropy Monitor (ERGO)</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Tracks proxy entropy metrics across conversation turns to detect
              confusion spikes and trigger adaptive resets.
            </p>
            <EntropyChart />
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-2">
              Tool Discovery (MCP-Zero)
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Describe what you need in natural language. Semantic routing finds
              the right tools from a catalog of 13.
            </p>
            <DiscoveryPlayground />
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-2">Context Quarantine</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Isolate sub-tasks in memory silos with TTL-based expiry. Merge
              findings back when ready.
            </p>
            <QuarantineVisualizer />
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-2">
              Abstention Check (RLAAR)
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Evaluates multi-dimensional confidence before asserting claims.
              Abstains with clarifying questions when uncertain.
            </p>
            <AbstentionDemo />
          </section>
        </div>
      )}

      {activeTab === "loop" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">∞</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold">Unified Context Loop</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                One call orchestrates all 7 context management stages.
                Replaces 6-7 individual tool calls with a single unified pipeline.
              </p>
            </div>
          </div>
          <UnifiedLoopDemo />
        </div>
      )}

      {activeTab === "memory" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">🧠</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold">Hierarchical Memory System</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                9 research approaches unified: 4-tier memory, knowledge graph,
                SSC compression, integrity verification (&lt;0.01% loss).
              </p>
            </div>
          </div>
          <MemoryDemo />
        </div>
      )}

      {activeTab === "reasoning" && (
        <div className="space-y-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">🧪</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold">Advanced Reasoning Paradigms</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                5 cutting-edge reasoning approaches: InftyThink iterative reasoning,
                Coconut latent-space thinking, Extra-CoT compression, Mind Evolution
                search, and KAG-Thinker structured decomposition.
              </p>
            </div>
          </div>

          <section>
            <h3 className="text-xl font-semibold mb-2">InftyThink — Iterative Reasoning</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Bounded-segment reasoning with sawtooth summarization. Each segment
              builds on the previous summary, preventing context window overflow
              while preserving reasoning continuity.
            </p>
            <InftyThinkDemo />
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-2">Coconut — Continuous Thought</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Simulates latent-space reasoning where intermediate states exist as
              compressed representations rather than verbose text. Reduces token
              consumption while maintaining reasoning depth.
            </p>
            <CoconutDemo />
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-2">Extra-CoT — Token Compression</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Aggressively compresses chain-of-thought reasoning by removing redundant
              steps while preserving semantic fidelity. Tracks compression ratio and
              fidelity score.
            </p>
            <ExtraCoTDemo />
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-2">Mind Evolution — Evolutionary Search</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Evolves a population of candidate solutions through mutation, crossover,
              and fitness-based selection across multiple generations. The best solution
              emerges through competitive pressure.
            </p>
            <MindEvolutionDemo />
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-2">KAG-Thinker — Structured Decomposition</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Decomposes problems into structured logical forms, builds dependency
              graphs, resolves sub-problems in topological order, and verifies results
              against known facts. Produces a stability score.
            </p>
            <KAGThinkerDemo />
          </section>
        </div>
      )}

      {activeTab === "truthfulness" && (
        <div className="space-y-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">🔬</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold">Truthfulness &amp; Self-Verification</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                7 research-backed tools for hallucination detection: internal state probing,
                truth direction analysis, neighborhood consistency, logical verification,
                verify-first checking, IoE self-correction, and iterative self-critique.
              </p>
            </div>
          </div>

          <section>
            <h3 className="text-xl font-semibold mb-2">Internal State Probing</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              5 proxy activation signals detect likely false claims without requiring
              access to model internals. Classifies claims as likely_true, uncertain, or likely_false.
            </p>
            <InternalStateDemo />
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-2">Truth Direction Detection</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              4-feature truth vector analysis flags claims that deviate significantly
              from population baselines, revealing potential hallucinations.
            </p>
            <TruthDirectionDemo />
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-2">Neighborhood Consistency (NCB)</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Tests knowledge robustness through 5 perturbation types. Distinguishes
              genuine knowledge from surface-level pattern matching.
            </p>
            <NeighborhoodDemo />
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-2">Logical Consistency Check</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Applies 5 logical transformations (contrapositive, negation, generalization,
              specialization, transitive) to verify structural soundness of claims.
            </p>
            <LogicalConsistencyDemo />
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-2">Verify-First Check</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              5-dimension verification scores factual accuracy, internal consistency,
              source verifiability, logical soundness, and completeness before accepting.
            </p>
            <VerifyFirstDemo />
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-2">IoE Self-Correction</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Intrinsic confidence evaluation with 5 metrics. Accepts confident answers,
              self-corrects recoverable errors, and escalates when certainty is too low.
            </p>
            <IoEDemo />
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-2">Iterative Self-Critique</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Multi-round critique-improve loop that converges toward quality. Tracks
              score progression and stops when improvements plateau.
            </p>
            <SelfCritiqueDemo />
          </section>
        </div>
      )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
