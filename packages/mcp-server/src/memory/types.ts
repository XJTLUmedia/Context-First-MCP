/**
 * Type definitions for the Hierarchical Memory Management System (HMMS).
 *
 * Combines 9 research approaches:
 *   MemMachine, SimpleMem, HippoRAG/Mem0, HiMem, LIGHT, MemGPT,
 *   FluxMem, Cognitive Workspace, ReMemR1
 */

// ─── Content Primitives ───

/** DJB2-style content hash for deduplication and integrity */
export type ContentHash = string;

/** A single sentence extracted from raw content */
export interface Sentence {
  id: string;
  text: string;
  hash: ContentHash;
  sourceEpisodeId: string;
  position: number;
  timestamp: Date;
}

/** A raw conversational episode (MemMachine ground-truth-preserving) */
export interface Episode {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  rawContent: string;
  sentences: Sentence[];
  timestamp: Date;
  turn: number;
  metadata: Record<string, unknown>;
}

// ─── Knowledge Graph (HippoRAG / Mem0) ───

export interface GraphNode {
  id: string;
  label: string;
  type: "entity" | "concept" | "value" | "action";
  mentions: number;
  firstSeen: Date;
  lastSeen: Date;
  pageRank: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
  episodeIds: string[];
  timestamp: Date;
}

export interface KnowledgeGraphState {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}

// ─── Memory Tiers (LIGHT + MemGPT) ───

/** Scratchpad: salient facts from the current turn */
export interface ScratchpadEntry {
  fact: string;
  hash: ContentHash;
  extractedAt: Date;
  sourceEpisodeId: string;
}

/** Working memory item with relevance scoring */
export interface WorkingMemoryItem {
  id: string;
  content: string;
  hash: ContentHash;
  relevanceScore: number;
  accessCount: number;
  lastAccessed: Date;
  sourceEpisodeIds: string[];
  tier: "hot" | "warm";
}

/** Episodic memory index entry (references raw episodes) */
export interface EpisodicIndexEntry {
  episodeId: string;
  summary: string;
  keyEntities: string[];
  turn: number;
  timestamp: Date;
  accessCount: number;
}

/** Semantic memory: abstracted knowledge consolidated from episodes */
export interface SemanticMemoryUnit {
  id: string;
  abstraction: string;
  supportingEpisodeIds: string[];
  confidence: number;
  consolidationLevel: number; // 0 = raw, 1 = first consolidation, etc.
  createdAt: Date;
  updatedAt: Date;
}

// ─── Compression (SimpleMem SSC) ───

/** A compressed memory unit produced by Semantic Structured Compression */
export interface CompressedUnit {
  id: string;
  compressedText: string;
  originalSentenceHashes: ContentHash[];
  compressionRatio: number;
  factCount: number;
  createdAt: Date;
}

/** Consolidation node in the recursive tree (SimpleMem RC + HiMem) */
export interface ConsolidationNode {
  id: string;
  level: number; // 0 = leaf (sentence groups), 1+ = higher abstraction
  summary: string;
  childIds: string[];
  factHashes: ContentHash[];
  conflictsResolved: string[];
  createdAt: Date;
}

// ─── Adaptive Gate (FluxMem) ───

export type InteractionType =
  | "factual_qa"
  | "reasoning"
  | "creative"
  | "multi_turn_dialog"
  | "task_execution"
  | "recall";

export interface GateDecision {
  selectedStructures: Array<{
    structure: "episodic" | "semantic" | "graph" | "working" | "scratchpad";
    weight: number;
  }>;
  interactionType: InteractionType;
  confidence: number;
  fusionStrategy: "weighted_merge" | "priority_cascade" | "ensemble";
}

// ─── Active Curation (Cognitive Workspace) ───

export interface CurationEntry {
  id: string;
  content: string;
  hash: ContentHash;
  importance: number; // 0-1
  reuseCount: number;
  lastReused: Date;
  tags: string[];
  curated: boolean;
  curatedAt?: Date;
}

export interface CurationStats {
  totalEntries: number;
  curatedEntries: number;
  reuseRate: number;
  avgImportance: number;
}

// ─── Callback Memory (ReMemR1) ───

export interface CallbackEntry {
  id: string;
  triggerPattern: string;
  targetFactHash: ContentHash;
  targetContent: string;
  sourceEpisodeId: string;
  activationCount: number;
  createdAt: Date;
  lastActivated?: Date;
}

// ─── Integrity Verification ───

export interface AtomicFact {
  id: string;
  hash: ContentHash;
  text: string;
  type: "declaration" | "association" | "triple";
  entities: string[];
  sourceEpisodeId: string;
}

export interface IntegrityReport {
  totalFacts: number;
  retainedFacts: number;
  lostFacts: number;
  lossPercentage: number;
  verified: boolean; // true if lossPercentage < 0.01%
  lostFactDetails: Array<{ factId: string; text: string }>;
  compactionTimestamp: Date;
  verificationDurationMs: number;
}

// ─── Unified Manager ───

export interface MemoryManagerConfig {
  maxWorkingMemoryItems: number;
  maxScratchpadEntries: number;
  maxEpisodicIndex: number;
  consolidationThreshold: number; // Number of episodes before triggering consolidation
  compactionTargetRatio: number; // Target compression ratio (e.g., 0.001 = 1000:1)
  pageRankDamping: number;
  pageRankIterations: number;
  workingMemoryDecayRate: number; // Per-access decay multiplier
  gateConfidenceThreshold: number;
  curationImportanceThreshold: number;
}

export const DEFAULT_MEMORY_CONFIG: MemoryManagerConfig = {
  maxWorkingMemoryItems: 500,
  maxScratchpadEntries: 50,
  maxEpisodicIndex: 10000,
  consolidationThreshold: 20,
  compactionTargetRatio: 0.001,
  pageRankDamping: 0.85,
  pageRankIterations: 50,
  workingMemoryDecayRate: 0.95,
  gateConfidenceThreshold: 0.3,
  curationImportanceThreshold: 0.4,
};

export interface MemoryStatus {
  sessionId: string;
  tiers: {
    scratchpad: { count: number; totalChars: number };
    working: { count: number; totalChars: number; hotCount: number; warmCount: number };
    episodic: { count: number; totalEpisodes: number; totalSentences: number };
    semantic: { count: number; avgConfidence: number; maxLevel: number };
  };
  graph: {
    nodeCount: number;
    edgeCount: number;
    topEntities: Array<{ label: string; pageRank: number }>;
  };
  compression: {
    totalRawChars: number;
    totalCompressedChars: number;
    overallRatio: number;
  };
  curation: CurationStats;
  callbacks: { total: number; activePatterns: number };
  lastCompaction?: Date;
  lastIntegrity?: IntegrityReport;
}

/** Result from memory recall with provenance */
export interface RecallResult {
  items: Array<{
    content: string;
    source: "scratchpad" | "working" | "episodic" | "semantic" | "graph" | "callback";
    relevanceScore: number;
    sourceEpisodeIds: string[];
    confidence: number;
  }>;
  gateDecision: GateDecision;
  totalCandidates: number;
  retrievalDurationMs: number;
}
