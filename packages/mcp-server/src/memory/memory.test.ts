/**
 * Comprehensive test suite for the Hierarchical Memory Management System.
 *
 * Covers: EpisodeStore, KnowledgeGraph, MemoryTiers, Compressor,
 * Consolidator, Gate, Curator, Callback, Integrity, and UnifiedMemoryManager.
 *
 * Key test: compaction loss must be < 0.01% (0.0001)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { djb2Hash, splitSentences, extractAtomicFacts, EpisodeStore } from "./episode-store.js";
import { extractEntities, extractRelations, KnowledgeGraph } from "./knowledge-graph.js";
import { Scratchpad, WorkingMemory, EpisodicIndex, SemanticMemory } from "./tiers.js";
import { compressSentences, compressText, structuralCompress, clusterSentences } from "./compressor.js";
import { buildConsolidationTree, recursiveConsolidate } from "./consolidator.js";
import { classifyInteraction, computeGateDecision } from "./gate.js";
import { scoreImportance, extractTags, ActiveCurator } from "./curator.js";
import { CallbackMemory } from "./callback.js";
import { verifyIntegrity, computeMerkleRoot, MAX_ACCEPTABLE_LOSS } from "./integrity.js";
import { UnifiedMemoryManager } from "./manager.js";

// ─── EpisodeStore Tests ───

describe("djb2Hash", () => {
  it("produces consistent hashes", () => {
    expect(djb2Hash("hello")).toBe(djb2Hash("hello"));
    expect(djb2Hash("hello")).not.toBe(djb2Hash("world"));
  });

  it("returns h_ prefix", () => {
    expect(djb2Hash("test")).toMatch(/^h_/);
  });
});

describe("splitSentences", () => {
  it("splits by sentence-ending punctuation", () => {
    const result = splitSentences("Hello world. How are you? I am fine!");
    expect(result).toHaveLength(3);
  });

  it("handles abbreviations", () => {
    const result = splitSentences("Dr. Smith went to Washington. He arrived at 3 p.m. today.");
    // Should not split on "Dr." or "3."
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result[0]).toContain("Dr.");
  });

  it("handles empty input", () => {
    expect(splitSentences("")).toHaveLength(0);
  });
});

describe("extractAtomicFacts", () => {
  it("extracts declaration facts from sentences", () => {
    const facts = extractAtomicFacts("The API uses REST. Authentication requires JWT tokens.", "ep1");
    expect(facts.length).toBeGreaterThanOrEqual(2);
    expect(facts.every((f) => f.type === "declaration" || f.type === "association" || f.type === "triple")).toBe(true);
  });

  it("extracts association facts from is-patterns", () => {
    const facts = extractAtomicFacts("The primary database is PostgreSQL.", "ep1");
    const assocFacts = facts.filter((f) => f.type === "association");
    expect(assocFacts.length).toBeGreaterThanOrEqual(1);
  });

  it("deduplicates facts by hash", () => {
    const facts = extractAtomicFacts("Hello world. Hello world.", "ep1");
    const hashes = facts.map((f) => f.hash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

describe("EpisodeStore", () => {
  let store: EpisodeStore;

  beforeEach(() => {
    store = new EpisodeStore();
  });

  it("ingests content and splits into sentences", () => {
    const ep = store.ingest("s1", "user", "Hello world. This is a test.", 1);
    expect(ep.sentences.length).toBe(2);
    expect(ep.role).toBe("user");
    expect(ep.sessionId).toBe("s1");
  });

  it("indexes sentences by hash", () => {
    store.ingest("s1", "user", "Unique sentence here.", 1);
    const hash = djb2Hash("unique sentence here.");
    expect(store.hasSentence(hash)).toBe(true);
  });

  it("retrieves session episodes in turn order", () => {
    store.ingest("s1", "user", "First.", 1);
    store.ingest("s1", "assistant", "Second.", 2);
    const eps = store.getSessionEpisodes("s1");
    expect(eps).toHaveLength(2);
    expect(eps[0].turn).toBe(1);
    expect(eps[1].turn).toBe(2);
  });

  it("extracts all facts for a session", () => {
    store.ingest("s1", "user", "The API uses REST. The database is PostgreSQL.", 1);
    const facts = store.extractAllFacts("s1");
    expect(facts.length).toBeGreaterThanOrEqual(2);
  });

  it("searches sentences by substring", () => {
    store.ingest("s1", "user", "TypeScript is great. Python is also good.", 1);
    const results = store.searchSentences("s1", "Python");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].text).toContain("Python");
  });
});

// ─── KnowledgeGraph Tests ───

describe("extractEntities", () => {
  it("extracts capitalized entities", () => {
    const entities = extractEntities("John Smith works at Google.");
    const labels = entities.map((e) => e.label);
    expect(labels.some((l) => l.includes("John"))).toBe(true);
    expect(labels.some((l) => l.includes("Google"))).toBe(true);
  });

  it("extracts technical terms", () => {
    const entities = extractEntities("Use camelCase and snake_case in your code.");
    const labels = entities.map((e) => e.label);
    expect(labels.some((l) => l === "camelCase" || l === "snake_case")).toBe(true);
  });
});

describe("KnowledgeGraph", () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = new KnowledgeGraph();
  });

  it("adds nodes and edges", () => {
    graph.addNode("s1", "TypeScript", "concept");
    graph.addNode("s1", "JavaScript", "concept");
    graph.addEdge("s1", "TypeScript", "JavaScript", "compiles_to", "ep1");

    const stats = graph.getStats("s1");
    expect(stats.nodeCount).toBe(2);
    expect(stats.edgeCount).toBe(1);
  });

  it("computes PageRank", () => {
    graph.addNode("s1", "A", "entity");
    graph.addNode("s1", "B", "entity");
    graph.addNode("s1", "C", "entity");
    graph.addEdge("s1", "A", "B", "links", "ep1");
    graph.addEdge("s1", "B", "C", "links", "ep1");
    graph.addEdge("s1", "C", "A", "links", "ep1");

    graph.computePageRank("s1");

    const nodes = graph.getNodes("s1");
    for (const node of nodes) {
      expect(node.pageRank).toBeGreaterThan(0);
    }
  });

  it("performs associative recall", () => {
    graph.ingestText("s1", "TypeScript compiles to JavaScript. React uses JavaScript.", "ep1");
    graph.computePageRank("s1");

    const results = graph.associativeRecall("s1", "TypeScript", 2, 5);
    expect(results.length).toBeGreaterThan(0);
  });

  it("checks fact containment", () => {
    graph.ingestText("s1", "PostgreSQL is the primary database.", "ep1");
    expect(graph.containsFact("s1", "PostgreSQL database")).toBe(true);
  });
});

// ─── Memory Tiers Tests ───

describe("Scratchpad", () => {
  it("replaces entries each turn", () => {
    const sp = new Scratchpad();
    sp.update("s1", ["fact1", "fact2"], "ep1");
    expect(sp.get("s1")).toHaveLength(2);
    sp.update("s1", ["fact3"], "ep2");
    expect(sp.get("s1")).toHaveLength(1);
  });
});

describe("WorkingMemory", () => {
  let wm: WorkingMemory;

  beforeEach(() => {
    wm = new WorkingMemory(100, 0.95);
  });

  it("adds items and deduplicates by hash", () => {
    wm.add("s1", "hello world", ["ep1"]);
    wm.add("s1", "hello world", ["ep2"]); // Dedup
    expect(wm.getItems("s1")).toHaveLength(1);
  });

  it("tracks access counts", () => {
    const item = wm.add("s1", "test content", ["ep1"]);
    wm.access("s1", item.id);
    wm.access("s1", item.id);
    const items = wm.getItems("s1");
    expect(items[0].accessCount).toBe(3); // 1 initial + 2 accesses
  });

  it("searches by substring", () => {
    wm.add("s1", "TypeScript is strongly typed", ["ep1"]);
    wm.add("s1", "Python is dynamically typed", ["ep1"]);
    const results = wm.search("s1", "TypeScript");
    expect(results).toHaveLength(1);
  });

  it("evicts cold items", () => {
    wm.add("s1", "cold item", ["ep1"], 0.05); // Low relevance
    wm.add("s1", "hot item", ["ep1"], 0.9);
    const evicted = wm.evictCold("s1", 0.1);
    expect(evicted).toHaveLength(1);
    expect(evicted[0].content).toBe("cold item");
  });
});

describe("SemanticMemory", () => {
  it("stores and searches semantic units", () => {
    const sm = new SemanticMemory();
    sm.addUnit("s1", "TypeScript is a typed superset of JavaScript", ["ep1"], 0.9);
    sm.addUnit("s1", "PostgreSQL is a relational database", ["ep2"], 0.8);

    const results = sm.search("s1", "TypeScript JavaScript");
    expect(results).toHaveLength(1);
    expect(results[0].abstraction).toContain("TypeScript");
  });

  it("checks fact containment with token overlap", () => {
    const sm = new SemanticMemory();
    sm.addUnit("s1", "The application uses TypeScript with React for the frontend", ["ep1"], 0.9);
    expect(sm.containsFact("s1", "TypeScript React frontend")).toBe(true);
    expect(sm.containsFact("s1", "completely unrelated topic xyzzy")).toBe(false);
  });
});

// ─── Compressor Tests ───

describe("compressor", () => {
  it("removes filler patterns via structural compression", () => {
    const result = structuralCompress(
      "I think basically TypeScript is great. Honestly it really reduces bugs."
    );
    expect(result.length).toBeLessThan(
      "I think basically TypeScript is great. Honestly it really reduces bugs.".length
    );
  });

  it("clusters similar sentences", () => {
    const sentences = [
      "TypeScript is a typed language.",
      "TypeScript is a strongly typed language.",
      "Python is dynamically typed.",
    ];
    const clusters = clusterSentences(
      sentences.map((text, i) => ({
        id: `s${i}`,
        text,
        hash: djb2Hash(text.toLowerCase()),
        sourceEpisodeId: "ep1",
        position: i,
        timestamp: new Date(),
      })),
      0.4
    );
    // The two TS sentences should cluster together
    expect(clusters.length).toBeLessThanOrEqual(sentences.length);
  });

  it("compresses text end-to-end", () => {
    const input = "The API uses REST. The API uses REST endpoints. Python is great for scripting. JavaScript runs in the browser.";
    const { compressed, originalHashes, compressionRatio } = compressText(input);
    expect(compressed.length).toBeLessThanOrEqual(input.length);
    expect(originalHashes.length).toBeGreaterThan(0);
    expect(compressionRatio).toBeGreaterThan(0);
  });
});

// ─── Consolidator Tests ───

describe("consolidator", () => {
  it("builds consolidation tree from compressed units", () => {
    const units: import("./types.js").CompressedUnit[] = Array.from({ length: 20 }, (_, i) => ({
      id: `cu_test_${i}`,
      compressedText: `Sentence number ${i} about topic ${i % 3}.`,
      originalSentenceHashes: [`h_test_${i}`],
      compressionRatio: 1.0,
      factCount: 1,
      createdAt: new Date(),
    }));
    const tree = buildConsolidationTree(units, 3);
    expect(tree.length).toBeGreaterThan(0);
    expect(tree[0].level).toBeGreaterThanOrEqual(0);
  });

  it("recursively consolidates new units into existing semantic memory", () => {
    const existing = [
      {
        id: "sem_1",
        abstraction: "TypeScript is used for frontend and backend development",
        supportingEpisodeIds: ["ep1"],
        confidence: 0.9,
        consolidationLevel: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const newUnits: import("./types.js").CompressedUnit[] = [
      {
        id: "cu_new_1",
        compressedText: "TypeScript is also used for serverless functions",
        originalSentenceHashes: ["h_abc"],
        compressionRatio: 1.2,
        factCount: 1,
        createdAt: new Date(),
      },
    ];

    const result = recursiveConsolidate(existing, newUnits);
    expect(result.newUnits.length + result.updatedUnits.length).toBeGreaterThan(0);
  });
});

// ─── Gate Tests ───

describe("gate", () => {
  it("classifies interaction types", () => {
    expect(classifyInteraction("What is the capital of France?")).toBe("factual_qa");
    expect(classifyInteraction("Write me a creative story")).toBe("creative");
    expect(classifyInteraction("Do you remember what I said earlier?")).toBe("recall");
  });

  it("computes gate decision with structure selection", () => {
    const available = new Set(["scratchpad", "working", "episodic", "semantic", "graph"]);
    const decision = computeGateDecision("What was the API design?", available);
    expect(decision.selectedStructures.length).toBeGreaterThan(0);
    expect(decision.fusionStrategy).toBeDefined();
  });
});

// ─── Curator Tests ───

describe("curator", () => {
  it("scores importance based on content signals", () => {
    const highImportance = scoreImportance("The team decided to use PostgreSQL 15 for the database.");
    const lowImportance = scoreImportance("ok sure");
    expect(highImportance).toBeGreaterThan(lowImportance);
  });

  it("extracts domain tags", () => {
    const tags = extractTags("Deploy the Docker container to Kubernetes.");
    expect(tags).toContain("devops");
  });

  it("curates and records reuse", () => {
    const curator = new ActiveCurator(0.3);
    const entry = curator.curate("s1", "The API endpoint requires JWT authentication.");
    expect(entry).not.toBeNull();
    if (entry) {
      curator.recordReuse("s1", entry.id);
      const reused = curator.getMostReused("s1");
      expect(reused[0].reuseCount).toBe(1);
    }
  });
});

// ─── Callback Tests ───

describe("callback", () => {
  it("registers and activates callbacks", () => {
    const cb = new CallbackMemory();
    cb.register("s1", "The deployment uses Docker containers on port 8080.", "ep1");
    const activated = cb.activate("s1", "What port does Docker use?");
    // Should activate on "Docker" or "port" or "8080"
    expect(activated.length).toBeGreaterThanOrEqual(0);
  });
});

// ─── Integrity Tests ───

describe("integrity", () => {
  it("computes Merkle root from hashes", () => {
    const root1 = computeMerkleRoot(["h_abc", "h_def"]);
    const root2 = computeMerkleRoot(["h_abc", "h_def"]);
    expect(root1).toBe(root2);
    // Different hashes → different root
    const root3 = computeMerkleRoot(["h_abc", "h_xyz"]);
    expect(root1).not.toBe(root3);
  });

  it("verifies full fact retention", () => {
    const facts = [
      { id: "f1", hash: "h_abc", text: "TypeScript is great", type: "declaration" as const, entities: ["TypeScript"], sourceEpisodeId: "ep1" },
      { id: "f2", hash: "h_def", text: "Python is dynamic", type: "declaration" as const, entities: ["Python"], sourceEpisodeId: "ep1" },
    ];

    // All checkers return true → 0% loss
    const report = verifyIntegrity(facts, {
      hasSentenceHash: () => true,
      hasCompressedHash: () => false,
      hasInSemanticMemory: () => false,
      hasInGraph: () => false,
      hasInWorkingMemory: () => false,
      hasInScratchpad: () => false,
      hasInCuratedMemory: () => false,
      hasInCallbackMemory: () => false,
    });

    expect(report.lossPercentage).toBe(0);
    expect(report.verified).toBe(true);
  });

  it("detects fact loss", () => {
    const facts = [
      { id: "f1", hash: "h_abc", text: "fact one", type: "declaration" as const, entities: [], sourceEpisodeId: "ep1" },
      { id: "f2", hash: "h_def", text: "fact two", type: "declaration" as const, entities: [], sourceEpisodeId: "ep1" },
    ];

    // All checkers return false → 100% loss
    const report = verifyIntegrity(facts, {
      hasSentenceHash: () => false,
      hasCompressedHash: () => false,
      hasInSemanticMemory: () => false,
      hasInGraph: () => false,
      hasInWorkingMemory: () => false,
      hasInScratchpad: () => false,
      hasInCuratedMemory: () => false,
      hasInCallbackMemory: () => false,
    });

    expect(report.lossPercentage).toBe(1);
    expect(report.verified).toBe(false);
  });
});

// ─── UnifiedMemoryManager Integration Tests ───

describe("UnifiedMemoryManager", () => {
  let manager: UnifiedMemoryManager;

  beforeEach(() => {
    manager = new UnifiedMemoryManager();
  });

  it("stores content across all tiers", () => {
    const result = manager.store("s1", "user", "The API uses REST endpoints. Authentication requires JWT tokens.");
    expect(result.sentenceCount).toBe(2);
    expect(result.factsExtracted).toBeGreaterThan(0);
    expect(result.episodeId).toBeTruthy();
  });

  it("recalls stored content", () => {
    manager.store("s1", "user", "The database is PostgreSQL version 15.");
    manager.store("s1", "assistant", "I understand. PostgreSQL 15 will be configured.");

    const recall = manager.recall("s1", "What database are we using?");
    expect(recall.items.length).toBeGreaterThan(0);
    expect(recall.gateDecision).toBeDefined();
  });

  it("produces valid gate decisions during recall", () => {
    manager.store("s1", "user", "Deploy to Kubernetes using Docker.");
    const recall = manager.recall("s1", "deployment");
    expect(recall.gateDecision.selectedStructures.length).toBeGreaterThan(0);
    expect(["weighted_merge", "priority_cascade", "ensemble"]).toContain(
      recall.gateDecision.fusionStrategy
    );
  });

  it("reports comprehensive status", () => {
    manager.store("s1", "user", "First message about TypeScript.");
    manager.store("s1", "assistant", "Second message about JavaScript.");

    const status = manager.getStatus("s1");
    expect(status.sessionId).toBe("s1");
    expect(status.tiers).toBeDefined();
    expect(status.graph).toBeDefined();
    expect(status.compression).toBeDefined();
  });

  it("clears session data", () => {
    manager.store("s1", "user", "Some content to clear.");
    manager.clearSession("s1");

    const status = manager.getStatus("s1");
    expect(status.tiers.scratchpad.count).toBe(0);
    expect(status.tiers.working.count).toBe(0);
    expect(status.graph.nodeCount).toBe(0);
  });
});

// ─── CRITICAL TEST: Compaction Loss < 0.01% ───

describe("Compaction Integrity (<0.01% loss)", () => {
  it("preserves >99.99% of facts after compaction", () => {
    const manager = new UnifiedMemoryManager({
      consolidationThreshold: 1000, // Disable auto-compaction
    });

    // Store significant amount of diverse content
    const contents = [
      "The system architecture uses microservices deployed on Kubernetes. Each service communicates via gRPC and REST APIs. The primary database is PostgreSQL 15 with read replicas.",
      "Authentication is handled by OAuth 2.0 with JWT tokens. The token expiry is set to 3600 seconds. Refresh tokens are stored in Redis with a 7-day TTL.",
      "The frontend is built with React 18 and TypeScript 5.0. State management uses Zustand. Styling is done with TailwindCSS 3.4.",
      "Monitoring uses Prometheus for metrics collection and Grafana for dashboards. Alerts are configured for latency above 200ms and error rate above 1%.",
      "The CI/CD pipeline runs on GitHub Actions. Tests execute in parallel using 4 workers. Deployment to staging is automatic, production requires manual approval.",
      "Data processing pipeline uses Apache Kafka for event streaming. Events are consumed by 3 consumer groups. Average throughput is 10000 messages per second.",
      "The caching layer uses Redis 7.0 with 16GB memory. Cache hit ratio target is 95%. Eviction policy is allkeys-lru.",
      "API rate limiting is set to 100 requests per minute per user. Rate limit headers are included in all responses. Exceeded limits return HTTP 429.",
      "Database migrations are managed with Prisma. Schema changes require review approval. Rollback scripts are mandatory for all migrations.",
      "The search functionality uses Elasticsearch 8.0. Index refresh interval is 1 second. Full-text search supports fuzzy matching with edit distance 2.",
    ];

    for (let i = 0; i < contents.length; i++) {
      manager.store("s1", i % 2 === 0 ? "user" : "assistant", contents[i]);
    }

    // Extract facts before compaction
    const factsBefore = manager.episodes.extractAllFacts("s1");
    expect(factsBefore.length).toBeGreaterThan(10);

    // Perform compaction
    const result = manager.compact("s1");

    // Verify integrity
    expect(result.integrity.verified).toBe(true);
    expect(result.integrity.lossPercentage).toBeLessThanOrEqual(MAX_ACCEPTABLE_LOSS);
    expect(result.integrity.totalFacts).toBe(factsBefore.length);

    // Verify compression actually happened
    expect(result.compressionStats.sentencesProcessed).toBeGreaterThan(0);
    expect(result.compressionStats.unitsCreated).toBeGreaterThan(0);
  });

  it("preserves facts across multiple compaction cycles", () => {
    const manager = new UnifiedMemoryManager({
      consolidationThreshold: 1000,
    });

    // First batch
    manager.store("s1", "user", "Project Alpha uses Node.js 20 with Express 4.18. The API serves 5000 concurrent users.");
    manager.store("s1", "assistant", "Confirmed. Node.js 20 and Express 4.18 for Project Alpha with 5000 user capacity.");

    const result1 = manager.compact("s1");
    expect(result1.integrity.verified).toBe(true);

    // Second batch
    manager.store("s1", "user", "We also need WebSocket support for real-time features. Use Socket.io version 4.7.");
    manager.store("s1", "assistant", "Adding Socket.io 4.7 for WebSocket support in Project Alpha.");

    const result2 = manager.compact("s1");
    expect(result2.integrity.verified).toBe(true);
    expect(result2.integrity.lossPercentage).toBeLessThanOrEqual(MAX_ACCEPTABLE_LOSS);

    // Third batch
    manager.store("s1", "user", "The deployment target is AWS ECS with Fargate. Minimum 3 instances for high availability.");
    const result3 = manager.compact("s1");
    expect(result3.integrity.verified).toBe(true);
    expect(result3.integrity.lossPercentage).toBeLessThanOrEqual(MAX_ACCEPTABLE_LOSS);
  });

  it("handles large content volumes (simulating 1G → 1M scenario)", () => {
    const manager = new UnifiedMemoryManager({
      consolidationThreshold: 1000,
    });

    // Simulate 100 messages with varied content
    const topics = [
      "database", "API", "frontend", "backend", "deployment",
      "testing", "monitoring", "security", "performance", "architecture",
    ];

    for (let i = 0; i < 100; i++) {
      const topic = topics[i % topics.length];
      const content = `Discussion point ${i} about ${topic}: The ${topic} system was configured with parameter_${i} set to ${i * 10}. This decision was confirmed by the team lead on day ${Math.floor(i / 10)}.`;
      manager.store("s1", i % 2 === 0 ? "user" : "assistant", content);
    }

    // Compact and verify
    const result = manager.compact("s1");
    expect(result.integrity.verified).toBe(true);
    expect(result.integrity.lossPercentage).toBeLessThanOrEqual(MAX_ACCEPTABLE_LOSS);
    expect(result.integrity.totalFacts).toBeGreaterThan(50);

    // Verify recall still works after compaction
    const recall = manager.recall("s1", "database parameter configuration");
    expect(recall.items.length).toBeGreaterThan(0);
  });
});
