/**
 * UnifiedMemoryManager — Orchestrates all 9 memory research approaches.
 *
 * MemMachine:       EpisodeStore (sentence-level raw storage)
 * SimpleMem:        Compressor (SSC) + Consolidator (RC)
 * HippoRAG/Mem0:   KnowledgeGraph (PageRank associative recall)
 * LIGHT:            Memory tiers (Scratchpad/Working/Episodic/Semantic)
 * MemGPT:           Virtual context management (RAM + disk paging)
 * HiMem:            Conflict-aware consolidation
 * FluxMem:          MemoryGate (adaptive structure selection)
 * Cognitive WS:     ActiveCurator (deliberate curation)
 * ReMemR1:          CallbackMemory (non-linear evidence recall)
 */

import type {
  MemoryManagerConfig,
  MemoryStatus,
  RecallResult,
  IntegrityReport,
  AtomicFact,
  CompressedUnit,
  ContentHash,
} from "./types.js";
import { DEFAULT_MEMORY_CONFIG } from "./types.js";
import { EpisodeStore, extractAtomicFacts, splitSentences } from "./episode-store.js";
import { KnowledgeGraph, extractEntities } from "./knowledge-graph.js";
import {
  Scratchpad,
  WorkingMemory,
  EpisodicIndex,
  SemanticMemory,
} from "./tiers.js";
import { compressSentences } from "./compressor.js";
import { recursiveConsolidate, buildConsolidationTree } from "./consolidator.js";
import { computeGateDecision } from "./gate.js";
import { ActiveCurator } from "./curator.js";
import { CallbackMemory } from "./callback.js";
import { verifyIntegrity, quickIntegrityCheck } from "./integrity.js";

/**
 * UnifiedMemoryManager: The master orchestrator.
 *
 * Manages the full memory lifecycle:
 *   Ingest → Index → Tier → Compress → Consolidate → Recall → Verify
 */
export class UnifiedMemoryManager {
  readonly config: MemoryManagerConfig;
  readonly episodes: EpisodeStore;
  readonly graph: KnowledgeGraph;
  readonly scratchpad: Scratchpad;
  readonly working: WorkingMemory;
  readonly episodicIndex: EpisodicIndex;
  readonly semantic: SemanticMemory;
  readonly curator: ActiveCurator;
  readonly callbacks: CallbackMemory;

  private compressedHashes = new Map<string, Set<ContentHash>>(); // sessionId → hashes
  private lastIntegrity = new Map<string, IntegrityReport>();
  private turnCounters = new Map<string, number>();

  constructor(config: Partial<MemoryManagerConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    this.episodes = new EpisodeStore();
    this.graph = new KnowledgeGraph();
    this.scratchpad = new Scratchpad();
    this.working = new WorkingMemory(
      this.config.maxWorkingMemoryItems,
      this.config.workingMemoryDecayRate
    );
    this.episodicIndex = new EpisodicIndex(this.config.maxEpisodicIndex);
    this.semantic = new SemanticMemory();
    this.curator = new ActiveCurator(
      this.config.curationImportanceThreshold
    );
    this.callbacks = new CallbackMemory();
  }

  /**
   * Store content into the hierarchical memory system.
   * This is the main ingestion point — content flows through all tiers.
   */
  store(
    sessionId: string,
    role: "user" | "assistant" | "system",
    content: string,
    metadata: Record<string, unknown> = {}
  ): {
    episodeId: string;
    sentenceCount: number;
    factsExtracted: number;
    graphNodesAdded: number;
    callbacksRegistered: number;
  } {
    const turn = this.getNextTurn(sessionId);

    // 1. MemMachine: Store raw episode at sentence level
    const episode = this.episodes.ingest(
      sessionId,
      role,
      content,
      turn,
      metadata
    );

    // 2. LIGHT Scratchpad: Extract salient facts for current turn
    const salientFacts = this.extractSalientFacts(content);
    this.scratchpad.update(sessionId, salientFacts, episode.id);

    // 3. Working Memory: Add to hot tier
    this.working.applyDecay(sessionId);
    for (const fact of salientFacts) {
      this.working.add(sessionId, fact, [episode.id], 1.0);
    }

    // 4. Episodic Index: Create summary for long-term index
    const entities = extractEntities(content);
    const summary = this.quickSummarize(content);
    this.episodicIndex.index(
      sessionId,
      episode.id,
      summary,
      entities.map((e) => e.label),
      turn
    );

    // 5. Knowledge Graph: Extract entities and relations
    this.graph.ingestText(sessionId, content, episode.id);
    this.graph.computePageRank(
      sessionId,
      this.config.pageRankDamping,
      this.config.pageRankIterations
    );

    // 6. Cognitive Workspace: Curate important content
    for (const fact of salientFacts) {
      this.curator.curate(sessionId, fact);
    }

    // 7. ReMemR1: Register callbacks for future activation
    const newCallbacks = this.callbacks.register(
      sessionId,
      content,
      episode.id
    );

    // 8. Check if consolidation is needed
    const episodes = this.episodes.getSessionEpisodes(sessionId);
    if (episodes.length % this.config.consolidationThreshold === 0) {
      this.compact(sessionId);
    }

    return {
      episodeId: episode.id,
      sentenceCount: episode.sentences.length,
      factsExtracted: salientFacts.length,
      graphNodesAdded: entities.length,
      callbacksRegistered: newCallbacks.length,
    };
  }

  /**
   * Recall: Retrieve relevant memories using adaptive gate selection.
   * FluxMem gate decides which structures to query and how to fuse.
   */
  recall(
    sessionId: string,
    query: string,
    maxResults = 10,
    contextSignals?: {
      turnCount?: number;
      recentEntropy?: number;
      hasConflicts?: boolean;
    }
  ): RecallResult {
    const startTime = Date.now();

    // FluxMem Gate: Decide which structures to query
    const availableStructures = new Set<string>();
    if (this.scratchpad.get(sessionId).length > 0)
      availableStructures.add("scratchpad");
    if (this.working.getItems(sessionId).length > 0)
      availableStructures.add("working");
    if (this.episodicIndex.getAll(sessionId).length > 0)
      availableStructures.add("episodic");
    if (this.semantic.getAll(sessionId).length > 0)
      availableStructures.add("semantic");
    if (this.graph.getNodes(sessionId).length > 0)
      availableStructures.add("graph");

    const gateDecision = computeGateDecision(
      query,
      availableStructures,
      {
        ...contextSignals,
        turnCount:
          contextSignals?.turnCount ?? this.turnCounters.get(sessionId) ?? 0,
      }
    );

    // ReMemR1: Activate callbacks first
    const activatedCallbacks = this.callbacks.activate(sessionId, query);

    // Collect candidates from each selected structure
    const allCandidates: RecallResult["items"] = [];

    for (const { structure, weight } of gateDecision.selectedStructures) {
      switch (structure) {
        case "scratchpad": {
          const entries = this.scratchpad.search(sessionId, query);
          for (const e of entries.slice(0, maxResults)) {
            allCandidates.push({
              content: e.fact,
              source: "scratchpad",
              relevanceScore: weight,
              sourceEpisodeIds: [e.sourceEpisodeId],
              confidence: 0.9,
            });
          }
          break;
        }
        case "working": {
          const items = this.working.search(sessionId, query, maxResults);
          for (const item of items) {
            this.working.access(sessionId, item.id);
            allCandidates.push({
              content: item.content,
              source: "working",
              relevanceScore: item.relevanceScore * weight,
              sourceEpisodeIds: item.sourceEpisodeIds,
              confidence: 0.85,
            });
          }
          break;
        }
        case "episodic": {
          const entries = this.episodicIndex.search(
            sessionId,
            query,
            maxResults
          );
          for (const e of entries) {
            allCandidates.push({
              content: e.summary,
              source: "episodic",
              relevanceScore: weight * 0.8,
              sourceEpisodeIds: [e.episodeId],
              confidence: 0.7,
            });
          }
          break;
        }
        case "semantic": {
          const units = this.semantic.search(sessionId, query, maxResults);
          for (const u of units) {
            allCandidates.push({
              content: u.abstraction,
              source: "semantic",
              relevanceScore: u.confidence * weight,
              sourceEpisodeIds: u.supportingEpisodeIds,
              confidence: u.confidence,
            });
          }
          break;
        }
        case "graph": {
          const results = this.graph.associativeRecall(
            sessionId,
            query,
            2,
            maxResults
          );
          for (const r of results) {
            // Present graph connections as natural language, not raw metadata.
            // Internal scores (PageRank, distance) are used for ranking but NOT
            // exposed in content — otherwise reasoning engines and the LLM echo
            // them into user-facing output files.
            const pathDescription = r.path.length > 1
              ? r.path.join(" → ")
              : r.node.label;
            allCandidates.push({
              content: pathDescription,
              source: "graph",
              relevanceScore:
                weight * (1 / (1 + r.distance)) * r.node.pageRank,
              sourceEpisodeIds: [],
              confidence: r.node.pageRank,
            });
          }
          break;
        }
      }
    }

    // Add activated callback memories
    for (const { callback } of activatedCallbacks) {
      allCandidates.push({
        content: callback.targetContent,
        source: "callback",
        relevanceScore: 0.9,
        sourceEpisodeIds: [callback.sourceEpisodeId],
        confidence: 0.8,
      });
    }

    // Record reuse for curated items
    for (const candidate of allCandidates) {
      // Boost curator reuse tracking
      const curatorStats = this.curator.getStats(sessionId);
      if (curatorStats.totalEntries > 0) {
        // Record reuse for matching curated entries
        const topCurated = this.curator.getTopEntries(sessionId, 5);
        for (const entry of topCurated) {
          if (
            candidate.content
              .toLowerCase()
              .includes(entry.content.toLowerCase().slice(0, 30))
          ) {
            this.curator.recordReuse(sessionId, entry.id);
          }
        }
      }
    }

    // Fuse and rank results based on gate decision fusion strategy
    let items: RecallResult["items"];

    switch (gateDecision.fusionStrategy) {
      case "priority_cascade":
        // Return items from highest-weight structure first
        items = allCandidates
          .sort((a, b) => b.relevanceScore - a.relevanceScore)
          .slice(0, maxResults);
        break;

      case "ensemble":
        // Deduplicate and combine scores
        items = this.deduplicateAndMerge(allCandidates).slice(0, maxResults);
        break;

      case "weighted_merge":
      default:
        // Sort by weighted relevance
        items = allCandidates
          .sort((a, b) => b.relevanceScore - a.relevanceScore)
          .slice(0, maxResults);
        break;
    }

    return {
      items,
      gateDecision,
      totalCandidates: allCandidates.length,
      retrievalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Compact: Trigger memory compaction with integrity verification.
   * This is the core operation that enables 1G → 1M context management.
   *
   * Process:
   * 1. Extract all facts (pre-compaction baseline)
   * 2. Compress sentences (SimpleMem SSC)
   * 3. Consolidate into semantic memory (SimpleMem RC + HiMem)
   * 4. Evict cold working memory items
   * 5. Verify integrity (<0.01% loss)
   */
  compact(
    sessionId: string
  ): {
    integrity: IntegrityReport;
    compressionStats: {
      beforeChars: number;
      afterChars: number;
      ratio: number;
      sentencesProcessed: number;
      unitsCreated: number;
    };
  } {
    // Step 1: Extract all facts as baseline
    const allFacts = this.episodes.extractAllFacts(sessionId);

    // Step 2: Compress all episode sentences
    const episodes = this.episodes.getSessionEpisodes(sessionId);
    const allSentences = episodes.flatMap((ep) => ep.sentences);
    const compressedUnits = compressSentences(allSentences);

    // Track compressed hashes for integrity
    const sessionHashes = this.compressedHashes.get(sessionId) ?? new Set();
    for (const unit of compressedUnits) {
      for (const hash of unit.originalSentenceHashes) {
        sessionHashes.add(hash);
      }
    }
    this.compressedHashes.set(sessionId, sessionHashes);

    // Step 3: Consolidate into semantic memory
    const existingUnits = this.semantic.getAll(sessionId);
    const consolidation = recursiveConsolidate(
      existingUnits,
      compressedUnits
    );

    // Apply consolidation results
    for (const update of consolidation.updatedUnits) {
      this.semantic.updateUnit(
        sessionId,
        update.id,
        update.newAbstraction,
        [],
        update.confidence
      );
    }
    for (const newUnit of consolidation.newUnits) {
      this.semantic.addUnit(
        sessionId,
        newUnit.abstraction,
        newUnit.episodeIds,
        newUnit.confidence,
        newUnit.level
      );
    }

    // Step 4: Evict cold working memory
    const evicted = this.working.evictCold(sessionId, 0.1);
    // Demote evicted items to episodic index
    for (const item of evicted) {
      if (item.sourceEpisodeIds.length > 0) {
        this.episodicIndex.index(
          sessionId,
          item.sourceEpisodeIds[0],
          item.content,
          [],
          0
        );
      }
    }

    // Step 5: Verify integrity
    const integrity = this.verifyIntegrity(sessionId, allFacts);
    this.lastIntegrity.set(sessionId, integrity);

    // Compute compression stats
    const beforeChars = episodes.reduce(
      (sum, ep) => sum + ep.rawContent.length,
      0
    );
    const afterChars = compressedUnits.reduce(
      (sum, u) => sum + u.compressedText.length,
      0
    );

    return {
      integrity,
      compressionStats: {
        beforeChars,
        afterChars,
        ratio: beforeChars / Math.max(1, afterChars),
        sentencesProcessed: allSentences.length,
        unitsCreated: compressedUnits.length,
      },
    };
  }

  /** Verify integrity across all memory tiers */
  verifyIntegrity(
    sessionId: string,
    facts?: AtomicFact[]
  ): IntegrityReport {
    const allFacts = facts ?? this.episodes.extractAllFacts(sessionId);
    const sessionHashes = this.compressedHashes.get(sessionId) ?? new Set();

    const checkers = {
      hasSentenceHash: (hash: ContentHash) =>
        this.episodes.hasSentence(hash),
      hasCompressedHash: (hash: ContentHash) => sessionHashes.has(hash),
      hasInSemanticMemory: (text: string) =>
        this.semantic.containsFact(sessionId, text),
      hasInGraph: (text: string) =>
        this.graph.containsFact(sessionId, text),
      hasInWorkingMemory: (hash: ContentHash) =>
        this.working.containsHash(sessionId, hash),
      hasInScratchpad: (hash: ContentHash) =>
        this.scratchpad.containsHash(sessionId, hash),
      hasInCuratedMemory: (text: string) =>
        this.curator.containsFact(sessionId, text),
      hasInCallbackMemory: (text: string) =>
        this.callbacks.containsFact(sessionId, text),
    };

    // Use quick check for large fact sets, full check for small ones
    if (allFacts.length > 5000) {
      return quickIntegrityCheck(allFacts, checkers);
    }
    return verifyIntegrity(allFacts, checkers);
  }

  /** Get comprehensive memory status */
  getStatus(sessionId: string): MemoryStatus {
    const episodeStats = this.episodes.getStats(sessionId);
    const graphStats = this.graph.getStats(sessionId);
    const workingStats = this.working.getStats(sessionId);
    const scratchpadStats = this.scratchpad.getStats(sessionId);
    const episodicStats = this.episodicIndex.getStats(sessionId);
    const semanticStats = this.semantic.getStats(sessionId);
    const curationStats = this.curator.getStats(sessionId);
    const callbackStats = this.callbacks.getStats(sessionId);

    const semanticUnits = this.semantic.getAll(sessionId);
    const compressedChars = semanticUnits.reduce(
      (sum, u) => sum + u.abstraction.length,
      0
    );

    return {
      sessionId,
      tiers: {
        scratchpad: scratchpadStats,
        working: workingStats,
        episodic: {
          count: episodicStats.count,
          totalEpisodes: episodeStats.totalEpisodes,
          totalSentences: episodeStats.totalSentences,
        },
        semantic: semanticStats,
      },
      graph: graphStats,
      compression: {
        totalRawChars: episodeStats.totalRawChars,
        totalCompressedChars: compressedChars,
        overallRatio:
          episodeStats.totalRawChars / Math.max(1, compressedChars),
      },
      curation: curationStats,
      callbacks: callbackStats,
      lastIntegrity: this.lastIntegrity.get(sessionId),
    };
  }

  /** Clear all memory for a session */
  clearSession(sessionId: string): void {
    this.episodes.clearSession(sessionId);
    this.graph.clearSession(sessionId);
    this.scratchpad.clear(sessionId);
    this.working.clear(sessionId);
    this.episodicIndex.clear(sessionId);
    this.semantic.clear(sessionId);
    this.curator.clear(sessionId);
    this.callbacks.clear(sessionId);
    this.compressedHashes.delete(sessionId);
    this.lastIntegrity.delete(sessionId);
    this.turnCounters.delete(sessionId);
  }

  /** Extract salient facts from content */
  private extractSalientFacts(content: string): string[] {
    const sentences = splitSentences(content);
    // Filter for sentences that contain specific information
    return sentences.filter((s) => {
      const lower = s.toLowerCase();
      // Keep sentences with: named entities, numbers, decisions, technical terms
      return (
        /[A-Z][a-z]+/.test(s) ||
        /\d/.test(s) ||
        /\b(decided|agreed|must|should|will|use|require|is|are|has|have)\b/.test(
          lower
        ) ||
        /\b[a-z]+(?:[A-Z][a-z]+)+\b/.test(s) || // camelCase
        s.length > 50 // Longer sentences tend to contain more info
      );
    });
  }

  /** Quick summarize for episodic index */
  private quickSummarize(content: string): string {
    const sentences = splitSentences(content);
    if (sentences.length <= 2) return content;

    // Take first sentence + any sentence with decision/action language
    const summary = [sentences[0]];
    for (let i = 1; i < sentences.length; i++) {
      if (
        /\b(decided|agreed|confirmed|will|must|should|therefore|conclusion)\b/i.test(
          sentences[i]
        )
      ) {
        summary.push(sentences[i]);
      }
    }

    return summary.join(" ").slice(0, 500);
  }

  /** Get and increment turn counter for a session */
  private getNextTurn(sessionId: string): number {
    const current = this.turnCounters.get(sessionId) ?? 0;
    const next = current + 1;
    this.turnCounters.set(sessionId, next);
    return next;
  }

  /** Deduplicate and merge candidates for ensemble fusion */
  private deduplicateAndMerge(
    candidates: RecallResult["items"]
  ): RecallResult["items"] {
    const merged = new Map<
      string,
      RecallResult["items"][0]
    >();

    for (const candidate of candidates) {
      const key = candidate.content.slice(0, 100).toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        existing.relevanceScore = Math.max(
          existing.relevanceScore,
          candidate.relevanceScore
        );
        existing.confidence = Math.max(
          existing.confidence,
          candidate.confidence
        );
      } else {
        merged.set(key, { ...candidate });
      }
    }

    return Array.from(merged.values()).sort(
      (a, b) => b.relevanceScore - a.relevanceScore
    );
  }
}
