"use client";

import { useState } from "react";
import { LiveDemo } from "../../components/LiveDemo";
import EntropyChart from "../../components/EntropyChart";
import DiscoveryPlayground from "../../components/DiscoveryPlayground";
import QuarantineVisualizer from "../../components/QuarantineVisualizer";
import AbstentionDemo from "../../components/AbstentionDemo";

type Tab = "core" | "advanced";

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
      </div>

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
    </div>
  );
}
