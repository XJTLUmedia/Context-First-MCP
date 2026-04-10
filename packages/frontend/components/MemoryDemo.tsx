"use client";

import { useState, useCallback } from "react";

// ─── Types (mirroring the engine types for client-side simulation) ──────────

interface SentenceEntry {
  hash: string;
  text: string;
  turn: number;
}

interface GraphNode {
  id: string;
  type: "entity" | "concept";
  label: string;
  rank: number;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

interface TierStatus {
  scratchpad: { entries: string[]; turnCount: number };
  working: { hot: string[]; warm: string[]; evicted: number };
  episodic: { totalSentences: number; sentences: SentenceEntry[] };
  semantic: { units: string[]; compressionRatio: number };
  graph: { nodes: GraphNode[]; edges: GraphEdge[]; pageRankRun: boolean };
  curation: { entries: { text: string; score: number; tags: string[]; reuses: number }[] };
  callbacks: { patterns: string[]; activated: string[] };
}

interface IntegrityReport {
  totalFacts: number;
  retainedFacts: number;
  lossRate: number;
  passed: boolean;
  merkleRoot: string;
}

interface GateDecision {
  interactionType: string;
  selectedStructure: string;
  confidence: number;
  strategy: string;
}

interface RecallResult {
  results: string[];
  gateDecision: GateDecision;
  sourceTiers: string[];
}

type DemoStep =
  | "idle"
  | "storing"
  | "stored"
  | "recalling"
  | "recalled"
  | "compacting"
  | "compacted"
  | "inspecting";

// ─── Simulated Engine (client-side, mirrors real MCP tools) ─────────────────

const SAMPLE_MESSAGES = [
  {
    role: "user",
    content:
      "We need to build a React dashboard using TypeScript. The backend uses PostgreSQL with Prisma ORM. Authentication should use JWT tokens with refresh rotation.",
  },
  {
    role: "assistant",
    content:
      "I'll set up the dashboard with React 18, TypeScript strict mode, and Tailwind CSS for styling. The PostgreSQL database will be managed through Prisma with typed models. JWT auth will include access tokens (15min TTL) and refresh tokens (7d TTL) with automatic rotation.",
  },
  {
    role: "user",
    content:
      "For the data visualization, use Recharts. We need real-time updates via WebSocket. Also, the API rate limit should be 100 requests per minute per user.",
  },
  {
    role: "assistant",
    content:
      "Adding Recharts for charts and graphs. WebSocket integration via Socket.io for live data push. Rate limiting set to 100 req/min/user using a sliding window algorithm with Redis backing.",
  },
  {
    role: "user",
    content:
      "Deploy to AWS using ECS Fargate. The CI/CD pipeline should run on GitHub Actions with staging and production environments. Also add Sentry for error tracking.",
  },
];

function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return "h_" + Math.abs(hash).toString(16).slice(0, 8);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractEntities(text: string): string[] {
  const caps = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  const tech =
    text.match(
      /\b(?:TypeScript|React|PostgreSQL|Prisma|JWT|WebSocket|Redis|AWS|ECS|Fargate|Sentry|Recharts|Socket\.io|Tailwind|GitHub\s*Actions)\b/gi
    ) || [];
  return [...new Set([...caps, ...tech])];
}

function scoreImportance(text: string): number {
  let score = 0.3;
  if (/\b(must|should|require|need|critical|important)\b/i.test(text))
    score += 0.2;
  if (/\b\d+\b/.test(text)) score += 0.1;
  if (/[A-Z]{2,}/.test(text)) score += 0.1;
  if (text.length > 80) score += 0.1;
  return Math.min(score, 1.0);
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  if (/\b(React|Vue|Angular|Svelte|dashboard)\b/i.test(text))
    tags.push("frontend");
  if (/\b(API|server|backend|database|PostgreSQL|Prisma)\b/i.test(text))
    tags.push("backend");
  if (/\b(JWT|auth|token|OAuth)\b/i.test(text)) tags.push("auth");
  if (/\b(deploy|AWS|CI|CD|Docker|ECS|Fargate)\b/i.test(text))
    tags.push("infra");
  if (/\b(WebSocket|real-?time|Socket\.io)\b/i.test(text))
    tags.push("realtime");
  if (/\b(chart|graph|Recharts|visualization)\b/i.test(text))
    tags.push("dataviz");
  if (/\b(rate.?limit|Redis|cache)\b/i.test(text)) tags.push("performance");
  if (/\b(Sentry|error|monitor|log)\b/i.test(text)) tags.push("monitoring");
  return [...new Set(tags)];
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function MemoryDemo() {
  const [step, setStep] = useState<DemoStep>("idle");
  const [tiers, setTiers] = useState<TierStatus | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const [recall, setRecall] = useState<RecallResult | null>(null);
  const [storedCount, setStoredCount] = useState(0);
  const [query, setQuery] = useState("authentication");
  const [activeView, setActiveView] = useState<
    "tiers" | "graph" | "integrity" | "recall"
  >("tiers");
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // Simulate: Store all sample messages
  const handleStore = useCallback(() => {
    setStep("storing");
    addLog("Starting memory store pipeline...");

    const allSentences: SentenceEntry[] = [];
    const allNodes: GraphNode[] = [];
    const allEdges: GraphEdge[] = [];
    const curatedEntries: {
      text: string;
      score: number;
      tags: string[];
      reuses: number;
    }[] = [];
    const callbackPatterns: string[] = [];

    let turnNum = 0;
    for (const msg of SAMPLE_MESSAGES) {
      turnNum++;
      const sentences = splitSentences(msg.content);
      addLog(
        `Turn ${turnNum} (${msg.role}): ${sentences.length} sentences ingested`
      );

      for (const s of sentences) {
        allSentences.push({ hash: djb2(s), text: s, turn: turnNum });
      }

      // Knowledge graph
      const entities = extractEntities(msg.content);
      for (const e of entities) {
        if (!allNodes.find((n) => n.label === e)) {
          allNodes.push({
            id: `n_${djb2(e)}`,
            type: /[A-Z]{2,}/.test(e) ? "concept" : "entity",
            label: e,
            rank: 0,
          });
        }
      }
      // Relations between consecutive entities
      for (let i = 0; i < entities.length - 1; i++) {
        allEdges.push({
          source: `n_${djb2(entities[i])}`,
          target: `n_${djb2(entities[i + 1])}`,
          relation: "co-occurs",
        });
      }

      // Curation
      curatedEntries.push({
        text:
          msg.content.length > 100
            ? msg.content.slice(0, 100) + "..."
            : msg.content,
        score: scoreImportance(msg.content),
        tags: extractTags(msg.content),
        reuses: 0,
      });

      // Callback patterns
      const techTerms = msg.content.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
      if (techTerms) callbackPatterns.push(...techTerms.slice(0, 2));
    }

    // PageRank simulation
    const damping = 0.85;
    const n = allNodes.length || 1;
    allNodes.forEach((node) => (node.rank = 1 / n));
    for (let iter = 0; iter < 20; iter++) {
      const newRanks = allNodes.map(() => (1 - damping) / n);
      for (const edge of allEdges) {
        const srcIdx = allNodes.findIndex((nd) => nd.id === edge.source);
        const tgtIdx = allNodes.findIndex((nd) => nd.id === edge.target);
        if (srcIdx >= 0 && tgtIdx >= 0) {
          const outDeg = allEdges.filter(
            (e) => e.source === edge.source
          ).length;
          newRanks[tgtIdx] += (damping * allNodes[srcIdx].rank) / outDeg;
        }
      }
      allNodes.forEach((node, i) => (node.rank = newRanks[i]));
    }

    // Build tier status
    const hotItems = allSentences.filter((s) => s.turn >= turnNum - 1);
    const warmItems = allSentences.filter(
      (s) => s.turn < turnNum - 1 && s.turn >= turnNum - 3
    );

    const tierStatus: TierStatus = {
      scratchpad: {
        entries: SAMPLE_MESSAGES.slice(-2).map((m) =>
          m.content.length > 80 ? m.content.slice(0, 80) + "..." : m.content
        ),
        turnCount: turnNum,
      },
      working: {
        hot: hotItems.map((s) => s.text),
        warm: warmItems.map((s) => s.text),
        evicted: 0,
      },
      episodic: {
        totalSentences: allSentences.length,
        sentences: allSentences,
      },
      semantic: { units: [], compressionRatio: 1.0 },
      graph: { nodes: allNodes, edges: allEdges, pageRankRun: true },
      curation: { entries: curatedEntries },
      callbacks: { patterns: [...new Set(callbackPatterns)], activated: [] },
    };

    setTiers(tierStatus);
    setStoredCount(SAMPLE_MESSAGES.length);
    setStep("stored");
    addLog(
      `Stored ${SAMPLE_MESSAGES.length} messages → ${allSentences.length} sentences, ${allNodes.length} graph nodes, ${allEdges.length} edges`
    );
  }, [addLog]);

  // Simulate: Recall with gate decision
  const handleRecall = useCallback(() => {
    if (!tiers) return;
    setStep("recalling");
    addLog(`Recalling for query: "${query}"`);

    const queryLower = query.toLowerCase();
    const matches = tiers.episodic.sentences
      .filter((s) => s.text.toLowerCase().includes(queryLower))
      .map((s) => s.text);

    // Graph recall
    const graphMatches = tiers.graph.nodes
      .filter((n) => n.label.toLowerCase().includes(queryLower))
      .sort((a, b) => b.rank - a.rank)
      .map((n) => `[Graph] ${n.label} (rank: ${n.rank.toFixed(4)})`);

    // Curated recall
    const curatedMatches = tiers.curation.entries
      .filter(
        (e) =>
          e.text.toLowerCase().includes(queryLower) ||
          e.tags.some((t) => t.toLowerCase().includes(queryLower))
      )
      .map(
        (e) =>
          `[Curated] score=${e.score.toFixed(2)} tags=[${e.tags.join(",")}] ${e.text}`
      );

    // Simulated gate decision
    const gate: GateDecision = {
      interactionType: matches.length > 3 ? "deep_analysis" : "factual_qa",
      selectedStructure:
        graphMatches.length > 0 ? "knowledge_graph" : "working_memory",
      confidence: Math.min(
        0.5 + matches.length * 0.1 + graphMatches.length * 0.15,
        0.98
      ),
      strategy:
        matches.length > 2 ? "priority_cascade" : "weighted_merge",
    };

    const allResults = [...matches.slice(0, 5), ...graphMatches.slice(0, 3), ...curatedMatches.slice(0, 2)];
    const sourceTiers: string[] = [];
    if (matches.length > 0) sourceTiers.push("episodic");
    if (graphMatches.length > 0) sourceTiers.push("graph");
    if (curatedMatches.length > 0) sourceTiers.push("curation");

    setRecall({
      results: allResults.length > 0 ? allResults : [`No results found for "${query}"`],
      gateDecision: gate,
      sourceTiers,
    });
    setActiveView("recall");
    setStep("recalled");
    addLog(
      `Recalled ${allResults.length} results via ${gate.strategy} strategy (${gate.selectedStructure})`
    );
  }, [tiers, query, addLog]);

  // Simulate: Compact with integrity check
  const handleCompact = useCallback(() => {
    if (!tiers) return;
    setStep("compacting");
    addLog("Running SSC compression + RC consolidation...");

    const sentences = tiers.episodic.sentences;
    // Remove near-duplicates (Jaccard simulation)
    const unique: SentenceEntry[] = [];
    for (const s of sentences) {
      const isDup = unique.some((u) => {
        const aTokens = new Set(s.text.toLowerCase().split(/\s+/));
        const bTokens = new Set(u.text.toLowerCase().split(/\s+/));
        const inter = [...aTokens].filter((t) => bTokens.has(t)).length;
        const union = new Set([...aTokens, ...bTokens]).size;
        return inter / union > 0.7;
      });
      if (!isDup) unique.push(s);
    }

    // Build semantic units
    const semanticUnits = unique.map((s) => s.text);
    const ratio = sentences.length > 0 ? unique.length / sentences.length : 1;

    // Integrity verification
    const allHashes = sentences.map((s) => s.hash);
    const retainedHashes = new Set(unique.map((s) => s.hash));
    // In real system, all facts are preserved even after compression
    // The test guarantees <0.01% loss via Merkle root verification
    const totalFacts = allHashes.length;
    const retained = allHashes.filter((h) => retainedHashes.has(h)).length;
    const lossRate = totalFacts > 0 ? (totalFacts - retained) / totalFacts : 0;

    // Simulate Merkle root
    let merkle = "0";
    for (const h of allHashes) {
      merkle = djb2(merkle + h);
    }

    const report: IntegrityReport = {
      totalFacts,
      retainedFacts: retained,
      lossRate,
      passed: lossRate < 0.0001,
      merkleRoot: merkle,
    };

    setTiers((prev) =>
      prev
        ? {
            ...prev,
            semantic: { units: semanticUnits, compressionRatio: ratio },
            working: {
              ...prev.working,
              evicted: sentences.length - unique.length,
            },
          }
        : prev
    );
    setIntegrity(report);
    setActiveView("integrity");
    setStep("compacted");
    addLog(
      `Compacted: ${sentences.length} → ${unique.length} sentences (${(ratio * 100).toFixed(1)}% ratio). Loss: ${(lossRate * 100).toFixed(4)}% ${report.passed ? "PASS" : "FAIL"}`
    );
  }, [tiers, addLog]);

  const resetDemo = useCallback(() => {
    setStep("idle");
    setTiers(null);
    setIntegrity(null);
    setRecall(null);
    setStoredCount(0);
    setLog([]);
    setActiveView("tiers");
  }, []);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={handleStore}
          disabled={step === "storing"}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {step === "storing" ? "Storing..." : `Store ${SAMPLE_MESSAGES.length} Messages`}
        </button>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search query..."
            className="px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800 dark:border-gray-600 w-44"
          />
          <button
            onClick={handleRecall}
            disabled={!tiers}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            Recall
          </button>
        </div>
        <button
          onClick={handleCompact}
          disabled={!tiers}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          Compact + Verify
        </button>
        <button
          onClick={resetDemo}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Summary bar */}
      {tiers && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Messages Stored" value={storedCount} color="blue" />
          <StatCard
            label="Sentences Indexed"
            value={tiers.episodic.totalSentences}
            color="purple"
          />
          <StatCard
            label="Graph Nodes"
            value={tiers.graph.nodes.length}
            color="emerald"
          />
          <StatCard
            label="Integrity"
            value={
              integrity
                ? integrity.passed
                  ? "PASS"
                  : "FAIL"
                : "—"
            }
            color={integrity ? (integrity.passed ? "green" : "red") : "gray"}
          />
        </div>
      )}

      {/* View tabs */}
      {tiers && (
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {(
            [
              ["tiers", "Memory Tiers"],
              ["graph", "Knowledge Graph"],
              ["integrity", "Integrity"],
              ["recall", "Recall Results"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveView(key)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                activeView === key
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* View panels */}
      {tiers && activeView === "tiers" && <TiersView tiers={tiers} />}
      {tiers && activeView === "graph" && <GraphView tiers={tiers} />}
      {activeView === "integrity" && integrity && (
        <IntegrityView report={integrity} />
      )}
      {activeView === "recall" && recall && <RecallView result={recall} />}

      {/* Activity log */}
      {log.length > 0 && (
        <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-xs max-h-48 overflow-y-auto">
          <div className="text-gray-500 mb-1 text-[10px] uppercase tracking-wider">
            Memory Pipeline Log
          </div>
          {log.map((line, i) => (
            <div key={i} className="leading-relaxed">
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Idle state */}
      {step === "idle" && (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <div className="text-4xl mb-3">🧠</div>
          <p className="text-sm">
            Click <strong>"Store 5 Messages"</strong> to ingest a sample
            conversation into the 4-tier hierarchical memory system.
          </p>
          <p className="text-xs mt-2 text-gray-400">
            Combines 9 research approaches: MemMachine · SimpleMem · HippoRAG ·
            HiMem · LIGHT · MemGPT · FluxMem · Cognitive Workspace · ReMemR1
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",
    purple:
      "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300",
    emerald:
      "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300",
    green:
      "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300",
    red: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300",
    gray: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
  };

  return (
    <div className={`rounded-lg p-3 ${colorMap[color] || colorMap.gray}`}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

function TiersView({ tiers }: { tiers: TierStatus }) {
  return (
    <div className="space-y-4">
      {/* Scratchpad */}
      <TierSection
        title="Scratchpad"
        subtitle={`Last ${tiers.scratchpad.entries.length} turns — volatile, replaced each turn`}
        color="yellow"
      >
        {tiers.scratchpad.entries.map((e, i) => (
          <div
            key={i}
            className="text-xs text-gray-700 dark:text-gray-300 py-1 border-b border-gray-100 dark:border-gray-700 last:border-0"
          >
            {e}
          </div>
        ))}
      </TierSection>

      {/* Working Memory */}
      <TierSection
        title="Working Memory"
        subtitle={`Hot: ${tiers.working.hot.length} · Warm: ${tiers.working.warm.length} · Evicted: ${tiers.working.evicted}`}
        color="orange"
      >
        <div className="space-y-2">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-red-500 font-semibold">
              Hot
            </span>
            {tiers.working.hot.slice(0, 4).map((s, i) => (
              <div
                key={i}
                className="text-xs text-gray-700 dark:text-gray-300 pl-2 py-0.5"
              >
                {s}
              </div>
            ))}
            {tiers.working.hot.length > 4 && (
              <div className="text-[10px] text-gray-400 pl-2">
                +{tiers.working.hot.length - 4} more
              </div>
            )}
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-amber-500 font-semibold">
              Warm
            </span>
            {tiers.working.warm.slice(0, 4).map((s, i) => (
              <div
                key={i}
                className="text-xs text-gray-600 dark:text-gray-400 pl-2 py-0.5"
              >
                {s}
              </div>
            ))}
            {tiers.working.warm.length > 4 && (
              <div className="text-[10px] text-gray-400 pl-2">
                +{tiers.working.warm.length - 4} more
              </div>
            )}
          </div>
        </div>
      </TierSection>

      {/* Episodic Index */}
      <TierSection
        title="Episodic Index"
        subtitle={`${tiers.episodic.totalSentences} sentences across ${tiers.scratchpad.turnCount} turns`}
        color="blue"
      >
        <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto">
          {tiers.episodic.sentences.slice(0, 10).map((s, i) => (
            <div
              key={i}
              className="text-xs flex items-start gap-2 py-0.5"
            >
              <code className="text-[10px] text-gray-400 font-mono shrink-0">
                T{s.turn} {s.hash}
              </code>
              <span className="text-gray-700 dark:text-gray-300">{s.text}</span>
            </div>
          ))}
          {tiers.episodic.totalSentences > 10 && (
            <div className="text-[10px] text-gray-400">
              +{tiers.episodic.totalSentences - 10} more sentences
            </div>
          )}
        </div>
      </TierSection>

      {/* Semantic Memory */}
      <TierSection
        title="Semantic Memory"
        subtitle={`${tiers.semantic.units.length} units · Compression: ${(tiers.semantic.compressionRatio * 100).toFixed(1)}%`}
        color="purple"
      >
        {tiers.semantic.units.length === 0 ? (
          <div className="text-xs text-gray-400 italic">
            Run "Compact + Verify" to consolidate into semantic memory
          </div>
        ) : (
          tiers.semantic.units.slice(0, 6).map((u, i) => (
            <div
              key={i}
              className="text-xs text-gray-700 dark:text-gray-300 py-0.5"
            >
              {u}
            </div>
          ))
        )}
      </TierSection>

      {/* Curation */}
      <TierSection
        title="Active Curation"
        subtitle={`${tiers.curation.entries.length} curated entries`}
        color="pink"
      >
        {tiers.curation.entries.map((e, i) => (
          <div
            key={i}
            className="text-xs py-1 border-b border-gray-100 dark:border-gray-700 last:border-0"
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className={`inline-block w-12 h-1.5 rounded-full ${
                  e.score > 0.7
                    ? "bg-green-500"
                    : e.score > 0.4
                      ? "bg-yellow-500"
                      : "bg-gray-400"
                }`}
                style={{ width: `${e.score * 48}px` }}
              />
              <span className="text-[10px] text-gray-500">
                {(e.score * 100).toFixed(0)}%
              </span>
              {e.tags.map((t) => (
                <span
                  key={t}
                  className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] text-gray-600 dark:text-gray-400"
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="text-gray-700 dark:text-gray-300">{e.text}</div>
          </div>
        ))}
      </TierSection>

      {/* Callbacks */}
      <TierSection
        title="Callback Patterns (ReMemR1)"
        subtitle={`${tiers.callbacks.patterns.length} triggers registered`}
        color="cyan"
      >
        <div className="flex flex-wrap gap-1.5">
          {tiers.callbacks.patterns.map((p, i) => (
            <span
              key={i}
              className="px-2 py-1 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 rounded text-[10px] font-mono"
            >
              {p}
            </span>
          ))}
        </div>
      </TierSection>
    </div>
  );
}

function GraphView({ tiers }: { tiers: TierStatus }) {
  const { nodes, edges } = tiers.graph;
  const sortedNodes = [...nodes].sort((a, b) => b.rank - a.rank);
  const maxRank = sortedNodes[0]?.rank || 1;

  return (
    <div className="space-y-4">
      {/* PageRank leaderboard */}
      <div>
        <h4 className="text-sm font-semibold mb-2">
          PageRank Scores ({nodes.length} nodes)
        </h4>
        <div className="space-y-1">
          {sortedNodes.slice(0, 12).map((node) => (
            <div key={node.id} className="flex items-center gap-2">
              <span className="text-xs w-32 truncate font-mono text-gray-700 dark:text-gray-300">
                {node.label}
              </span>
              <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    node.type === "concept"
                      ? "bg-purple-500"
                      : "bg-emerald-500"
                  }`}
                  style={{
                    width: `${(node.rank / maxRank) * 100}%`,
                  }}
                />
              </div>
              <span className="text-[10px] text-gray-500 w-12 text-right font-mono">
                {node.rank.toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Edge list */}
      <div>
        <h4 className="text-sm font-semibold mb-2">
          Relations ({edges.length} edges)
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-40 overflow-y-auto">
          {edges.slice(0, 20).map((edge, i) => {
            const src = nodes.find((n) => n.id === edge.source);
            const tgt = nodes.find((n) => n.id === edge.target);
            return (
              <div
                key={i}
                className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1"
              >
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {src?.label || "?"}
                </span>
                <span className="text-gray-400">→</span>
                <span className="text-purple-600 dark:text-purple-400 text-[10px]">
                  {edge.relation}
                </span>
                <span className="text-gray-400">→</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {tgt?.label || "?"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IntegrityView({ report }: { report: IntegrityReport }) {
  return (
    <div className="space-y-4">
      <div
        className={`p-4 rounded-lg border-2 ${
          report.passed
            ? "bg-green-50 dark:bg-green-900/10 border-green-300 dark:border-green-700"
            : "bg-red-50 dark:bg-red-900/10 border-red-300 dark:border-red-700"
        }`}
      >
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">{report.passed ? "✅" : "❌"}</span>
          <div>
            <div className="text-lg font-bold">
              {report.passed
                ? "Integrity Verified"
                : "Integrity Check Failed"}
            </div>
            <div className="text-xs text-gray-500">
              Threshold: &lt; 0.01% loss (MAX_ACCEPTABLE_LOSS = 0.0001)
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-gray-500">Total Facts</div>
            <div className="font-bold text-lg">{report.totalFacts}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Retained</div>
            <div className="font-bold text-lg">{report.retainedFacts}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Loss Rate</div>
            <div
              className={`font-bold text-lg ${
                report.passed ? "text-green-600" : "text-red-600"
              }`}
            >
              {(report.lossRate * 100).toFixed(4)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Merkle Root</div>
            <div className="font-mono text-xs mt-1 truncate">
              {report.merkleRoot}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecallView({ result }: { result: RecallResult }) {
  return (
    <div className="space-y-4">
      {/* Gate Decision */}
      <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
        <h4 className="text-sm font-semibold mb-2 text-indigo-700 dark:text-indigo-300">
          FluxMem Gate Decision
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-gray-500">Interaction Type</div>
            <div className="font-medium mt-0.5">
              {result.gateDecision.interactionType}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Selected Structure</div>
            <div className="font-medium mt-0.5">
              {result.gateDecision.selectedStructure}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Confidence</div>
            <div className="font-medium mt-0.5">
              {(result.gateDecision.confidence * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-gray-500">Strategy</div>
            <div className="font-medium mt-0.5">
              {result.gateDecision.strategy}
            </div>
          </div>
        </div>
        <div className="mt-2 flex gap-1.5">
          {result.sourceTiers.map((tier) => (
            <span
              key={tier}
              className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300 rounded text-[10px] font-medium"
            >
              {tier}
            </span>
          ))}
        </div>
      </div>

      {/* Results */}
      <div>
        <h4 className="text-sm font-semibold mb-2">
          Results ({result.results.length})
        </h4>
        <div className="space-y-1.5">
          {result.results.map((r, i) => (
            <div
              key={i}
              className={`text-xs p-2 rounded border ${
                r.startsWith("[Graph]")
                  ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800"
                  : r.startsWith("[Curated]")
                    ? "bg-pink-50 dark:bg-pink-900/10 border-pink-200 dark:border-pink-800"
                    : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              }`}
            >
              {r}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TierSection({
  title,
  subtitle,
  color,
  children,
}: {
  title: string;
  subtitle: string;
  color: string;
  children: React.ReactNode;
}) {
  const dotColors: Record<string, string> = {
    yellow: "bg-yellow-500",
    orange: "bg-orange-500",
    blue: "bg-blue-500",
    purple: "bg-purple-500",
    pink: "bg-pink-500",
    cyan: "bg-cyan-500",
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${dotColors[color] || "bg-gray-500"}`} />
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-[10px] text-gray-400">{subtitle}</span>
      </div>
      {children}
    </div>
  );
}
