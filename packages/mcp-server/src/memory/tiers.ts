/**
 * MemoryTiers — LIGHT Framework + MemGPT virtual context management.
 *
 * Four-tier memory hierarchy:
 *   Scratchpad → Working Memory (hot/warm) → Episodic Index → Semantic Memory
 *
 * Treats the LLM's context window like RAM (working memory) and
 * external storage like a hard drive (episodic/semantic tiers).
 */

import type {
  ScratchpadEntry,
  WorkingMemoryItem,
  EpisodicIndexEntry,
  SemanticMemoryUnit,
  ContentHash,
  MemoryManagerConfig,
  DEFAULT_MEMORY_CONFIG,
} from "./types.js";
import { djb2Hash } from "./episode-store.js";

let wmItemCounter = 0;
let semUnitCounter = 0;

/**
 * Scratchpad: Records salient facts after each turn.
 * Replaced every turn — holds only current-turn context.
 */
export class Scratchpad {
  private entries = new Map<string, ScratchpadEntry[]>();

  /** Set scratchpad for current turn (replaces previous) */
  update(sessionId: string, facts: string[], sourceEpisodeId: string): ScratchpadEntry[] {
    const now = new Date();
    const entries: ScratchpadEntry[] = facts.map((fact) => ({
      fact,
      hash: djb2Hash(fact.toLowerCase()),
      extractedAt: now,
      sourceEpisodeId,
    }));
    this.entries.set(sessionId, entries);
    return entries;
  }

  /** Get current scratchpad entries */
  get(sessionId: string): ScratchpadEntry[] {
    return this.entries.get(sessionId) ?? [];
  }

  /** Check if scratchpad contains a fact by hash */
  containsHash(sessionId: string, hash: ContentHash): boolean {
    const entries = this.entries.get(sessionId) ?? [];
    return entries.some((e) => e.hash === hash);
  }

  /** Search scratchpad by text */
  search(sessionId: string, query: string): ScratchpadEntry[] {
    const entries = this.entries.get(sessionId) ?? [];
    const queryLower = query.toLowerCase();
    return entries.filter((e) => e.fact.toLowerCase().includes(queryLower));
  }

  getStats(sessionId: string) {
    const entries = this.entries.get(sessionId) ?? [];
    return {
      count: entries.length,
      totalChars: entries.reduce((sum, e) => sum + e.fact.length, 0),
    };
  }

  clear(sessionId: string): void {
    this.entries.delete(sessionId);
  }
}

/**
 * WorkingMemory: Recent turns + high-relevance items.
 * The "RAM" of the MemGPT virtual context architecture.
 * Items have hot/warm tiers based on recency and access patterns.
 */
export class WorkingMemory {
  private items = new Map<string, WorkingMemoryItem[]>();
  private maxItems: number;
  private decayRate: number;

  constructor(maxItems = 500, decayRate = 0.95) {
    this.maxItems = maxItems;
    this.decayRate = decayRate;
  }

  /** Add or promote an item to working memory */
  add(
    sessionId: string,
    content: string,
    sourceEpisodeIds: string[],
    initialRelevance = 1.0
  ): WorkingMemoryItem {
    const items = this.getOrCreate(sessionId);
    const hash = djb2Hash(content.toLowerCase());

    // Check for existing item (dedup by hash)
    const existing = items.find((i) => i.hash === hash);
    if (existing) {
      existing.relevanceScore = Math.min(
        1.0,
        existing.relevanceScore + 0.1
      );
      existing.accessCount++;
      existing.lastAccessed = new Date();
      existing.tier = "hot";
      for (const id of sourceEpisodeIds) {
        if (!existing.sourceEpisodeIds.includes(id)) {
          existing.sourceEpisodeIds.push(id);
        }
      }
      return existing;
    }

    const item: WorkingMemoryItem = {
      id: `wm_${++wmItemCounter}`,
      content,
      hash,
      relevanceScore: initialRelevance,
      accessCount: 1,
      lastAccessed: new Date(),
      sourceEpisodeIds,
      tier: "hot",
    };

    items.push(item);
    this.enforceLimit(sessionId);
    return item;
  }

  /** Access an item — boosts relevance, marks as hot */
  access(sessionId: string, itemId: string): WorkingMemoryItem | undefined {
    const items = this.getOrCreate(sessionId);
    const item = items.find((i) => i.id === itemId);
    if (item) {
      item.accessCount++;
      item.lastAccessed = new Date();
      item.relevanceScore = Math.min(1.0, item.relevanceScore + 0.05);
      item.tier = "hot";
    }
    return item;
  }

  /** Apply decay to all items — hot items that decay enough become warm */
  applyDecay(sessionId: string): void {
    const items = this.getOrCreate(sessionId);
    const now = Date.now();

    for (const item of items) {
      const ageSec = (now - item.lastAccessed.getTime()) / 1000;
      const decayFactor = Math.pow(this.decayRate, ageSec / 60); // Decay per minute
      item.relevanceScore *= decayFactor;
      item.tier = item.relevanceScore > 0.5 ? "hot" : "warm";
    }
  }

  /** Get items sorted by relevance */
  getItems(sessionId: string, tier?: "hot" | "warm"): WorkingMemoryItem[] {
    const items = this.getOrCreate(sessionId);
    const filtered = tier ? items.filter((i) => i.tier === tier) : items;
    return filtered.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /** Search working memory by text */
  search(
    sessionId: string,
    query: string,
    maxResults = 10
  ): WorkingMemoryItem[] {
    const items = this.getOrCreate(sessionId);
    const queryLower = query.toLowerCase();
    return items
      .filter((i) => i.content.toLowerCase().includes(queryLower))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults);
  }

  /** Check if working memory contains a fact by hash */
  containsHash(sessionId: string, hash: ContentHash): boolean {
    const items = this.getOrCreate(sessionId);
    return items.some((i) => i.hash === hash);
  }

  /** Evict warm items below threshold — returns evicted items for demotion to episodic */
  evictCold(sessionId: string, threshold = 0.1): WorkingMemoryItem[] {
    const items = this.getOrCreate(sessionId);
    const evicted: WorkingMemoryItem[] = [];
    const retained: WorkingMemoryItem[] = [];

    for (const item of items) {
      if (item.relevanceScore < threshold) {
        evicted.push(item);
      } else {
        retained.push(item);
      }
    }

    this.items.set(sessionId, retained);
    return evicted;
  }

  getStats(sessionId: string) {
    const items = this.getOrCreate(sessionId);
    const hot = items.filter((i) => i.tier === "hot");
    const warm = items.filter((i) => i.tier === "warm");
    return {
      count: items.length,
      totalChars: items.reduce((sum, i) => sum + i.content.length, 0),
      hotCount: hot.length,
      warmCount: warm.length,
    };
  }

  clear(sessionId: string): void {
    this.items.delete(sessionId);
  }

  private getOrCreate(sessionId: string): WorkingMemoryItem[] {
    let items = this.items.get(sessionId);
    if (!items) {
      items = [];
      this.items.set(sessionId, items);
    }
    return items;
  }

  private enforceLimit(sessionId: string): void {
    const items = this.getOrCreate(sessionId);
    if (items.length > this.maxItems) {
      items.sort((a, b) => b.relevanceScore - a.relevanceScore);
      this.items.set(sessionId, items.slice(0, this.maxItems));
    }
  }
}

/**
 * EpisodicIndex: Long-term episode index with summaries.
 * The "hard drive" of the MemGPT architecture — stores references to full episodes.
 */
export class EpisodicIndex {
  private entries = new Map<string, EpisodicIndexEntry[]>();
  private maxEntries: number;

  constructor(maxEntries = 10000) {
    this.maxEntries = maxEntries;
  }

  /** Index a new episode */
  index(
    sessionId: string,
    episodeId: string,
    summary: string,
    keyEntities: string[],
    turn: number
  ): EpisodicIndexEntry {
    const entries = this.getOrCreate(sessionId);
    const entry: EpisodicIndexEntry = {
      episodeId,
      summary,
      keyEntities,
      turn,
      timestamp: new Date(),
      accessCount: 0,
    };
    entries.push(entry);

    // Enforce limit — evict oldest with lowest access
    if (entries.length > this.maxEntries) {
      entries.sort(
        (a, b) => b.accessCount - a.accessCount || b.turn - a.turn
      );
      this.entries.set(sessionId, entries.slice(0, this.maxEntries));
    }

    return entry;
  }

  /** Search episodes by query */
  search(
    sessionId: string,
    query: string,
    maxResults = 10
  ): EpisodicIndexEntry[] {
    const entries = this.getOrCreate(sessionId);
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/);

    return entries
      .map((e) => {
        const summaryLower = e.summary.toLowerCase();
        const entityStr = e.keyEntities.join(" ").toLowerCase();
        let score = 0;
        for (const token of queryTokens) {
          if (summaryLower.includes(token)) score += 1;
          if (entityStr.includes(token)) score += 0.5;
        }
        return { entry: e, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((r) => {
        r.entry.accessCount++;
        return r.entry;
      });
  }

  /** Get all indexed episodes */
  getAll(sessionId: string): EpisodicIndexEntry[] {
    return this.getOrCreate(sessionId);
  }

  getStats(sessionId: string) {
    const entries = this.getOrCreate(sessionId);
    return {
      count: entries.length,
    };
  }

  clear(sessionId: string): void {
    this.entries.delete(sessionId);
  }

  private getOrCreate(sessionId: string): EpisodicIndexEntry[] {
    let entries = this.entries.get(sessionId);
    if (!entries) {
      entries = [];
      this.entries.set(sessionId, entries);
    }
    return entries;
  }
}

/**
 * SemanticMemory: Abstracted knowledge consolidated from episodes.
 * Higher consolidation levels represent more abstract knowledge.
 */
export class SemanticMemory {
  private units = new Map<string, SemanticMemoryUnit[]>();

  /** Add a new semantic unit */
  addUnit(
    sessionId: string,
    abstraction: string,
    supportingEpisodeIds: string[],
    confidence: number,
    consolidationLevel = 0
  ): SemanticMemoryUnit {
    const units = this.getOrCreate(sessionId);
    const unit: SemanticMemoryUnit = {
      id: `sem_${++semUnitCounter}`,
      abstraction,
      supportingEpisodeIds,
      confidence,
      consolidationLevel,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    units.push(unit);
    return unit;
  }

  /** Update an existing unit (HiMem conflict-aware update) */
  updateUnit(
    sessionId: string,
    unitId: string,
    newAbstraction: string,
    additionalEpisodeIds: string[],
    newConfidence: number
  ): SemanticMemoryUnit | undefined {
    const units = this.getOrCreate(sessionId);
    const unit = units.find((u) => u.id === unitId);
    if (!unit) return undefined;

    unit.abstraction = newAbstraction;
    unit.confidence = newConfidence;
    unit.updatedAt = new Date();
    for (const id of additionalEpisodeIds) {
      if (!unit.supportingEpisodeIds.includes(id)) {
        unit.supportingEpisodeIds.push(id);
      }
    }
    return unit;
  }

  /** Search semantic memory */
  search(
    sessionId: string,
    query: string,
    maxResults = 10
  ): SemanticMemoryUnit[] {
    const units = this.getOrCreate(sessionId);
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/);

    return units
      .map((u) => {
        const absLower = u.abstraction.toLowerCase();
        let score = 0;
        for (const token of queryTokens) {
          if (absLower.includes(token)) score += 1;
        }
        return { unit: u, score: score * u.confidence };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((r) => r.unit);
  }

  /** Get units by consolidation level */
  getByLevel(sessionId: string, level: number): SemanticMemoryUnit[] {
    const units = this.getOrCreate(sessionId);
    return units.filter((u) => u.consolidationLevel === level);
  }

  /** Check if semantic memory contains information about a fact */
  containsFact(sessionId: string, factText: string): boolean {
    const units = this.getOrCreate(sessionId);
    const factLower = factText.toLowerCase();
    const factTokens = factLower.split(/\s+/).filter((t) => t.length > 3);

    for (const unit of units) {
      const absLower = unit.abstraction.toLowerCase();
      let matches = 0;
      for (const token of factTokens) {
        if (absLower.includes(token)) matches++;
      }
      // If >60% of fact tokens are in the abstraction, consider it retained
      if (factTokens.length > 0 && matches / factTokens.length > 0.6) {
        return true;
      }
    }
    return false;
  }

  getStats(sessionId: string) {
    const units = this.getOrCreate(sessionId);
    const avgConfidence =
      units.length > 0
        ? units.reduce((sum, u) => sum + u.confidence, 0) / units.length
        : 0;
    const maxLevel = units.reduce(
      (max, u) => Math.max(max, u.consolidationLevel),
      0
    );
    return { count: units.length, avgConfidence, maxLevel };
  }

  getAll(sessionId: string): SemanticMemoryUnit[] {
    return this.getOrCreate(sessionId);
  }

  clear(sessionId: string): void {
    this.units.delete(sessionId);
  }

  private getOrCreate(sessionId: string): SemanticMemoryUnit[] {
    let units = this.units.get(sessionId);
    if (!units) {
      units = [];
      this.units.set(sessionId, units);
    }
    return units;
  }
}
