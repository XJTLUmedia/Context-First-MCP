/**
 * Curator — Cognitive Workspace active memory management.
 *
 * Features deliberate information curation with importance scoring,
 * reuse tracking, and proactive memory management.
 * Target: ~60% memory reuse rate.
 */

import type { CurationEntry, CurationStats, ContentHash } from "./types.js";
import { djb2Hash } from "./episode-store.js";

let curationCounter = 0;

/**
 * Score the importance of a piece of content.
 *
 * Factors:
 * - Named entities and specific values (higher importance)
 * - Decision language (higher importance)
 * - Question marks and uncertainty (moderate importance)
 * - Generic/filler content (lower importance)
 */
export function scoreImportance(content: string): number {
  let score = 0.3; // Base importance

  const lower = content.toLowerCase();

  // Decision language → high importance
  if (
    /\b(decided|agreed|confirmed|must|should|will|require|chosen|selected|approved)\b/.test(
      lower
    )
  ) {
    score += 0.25;
  }

  // Specific values → high importance
  const valueCount = (
    content.match(/\d+(?:\.\d+)?(?:\s*(?:%|MB|GB|ms|s|tokens?))?/g) ?? []
  ).length;
  score += Math.min(0.2, valueCount * 0.05);

  // Named entities → moderate importance
  const entityCount = (content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) ?? []).length;
  score += Math.min(0.15, entityCount * 0.03);

  // Technical terms → moderate importance
  const techCount = (
    content.match(/\b[a-z]+(?:[A-Z][a-z]+)+\b|\b\w+_\w+\b/g) ?? []
  ).length;
  score += Math.min(0.15, techCount * 0.03);

  // Uncertainty markers → moderate (still useful for tracking open questions)
  if (/\b(maybe|possibly|might|could|unsure|unclear)\b/.test(lower)) {
    score += 0.05;
  }

  // Long content with structure → higher importance
  if (content.length > 200) score += 0.05;
  if (/[:\-•\*]/.test(content)) score += 0.05;

  return Math.min(1.0, Math.max(0.0, score));
}

/** Extract tag topics from content */
export function extractTags(content: string): string[] {
  const lower = content.toLowerCase();
  const tags: string[] = [];

  // Domain-specific tags
  const domainPatterns: [RegExp, string][] = [
    [/\b(api|endpoint|route|rest|graphql)\b/, "api"],
    [/\b(database|sql|query|table|schema|migration)\b/, "database"],
    [/\b(deploy|ci|cd|pipeline|docker|kubernetes)\b/, "devops"],
    [/\b(test|spec|assert|expect|mock|stub)\b/, "testing"],
    [/\b(auth|login|password|token|session|jwt)\b/, "authentication"],
    [/\b(ui|component|frontend|css|layout|style)\b/, "frontend"],
    [/\b(server|backend|middleware|controller)\b/, "backend"],
    [/\b(config|setting|environment|variable|env)\b/, "configuration"],
    [/\b(error|bug|fix|issue|debug|crash|exception)\b/, "debugging"],
    [/\b(performance|cache|optimize|speed|latency)\b/, "performance"],
  ];

  for (const [pattern, tag] of domainPatterns) {
    if (pattern.test(lower)) tags.push(tag);
  }

  // If no specific tags, add "general"
  if (tags.length === 0) tags.push("general");

  return tags;
}

/**
 * ActiveCurator: Manages deliberate information curation
 * with importance scoring and reuse tracking.
 */
export class ActiveCurator {
  private entries = new Map<string, CurationEntry[]>();
  private importanceThreshold: number;

  constructor(importanceThreshold = 0.4) {
    this.importanceThreshold = importanceThreshold;
  }

  /** Curate new content — automatically scores and tags */
  curate(
    sessionId: string,
    content: string,
    forceCurate = false
  ): CurationEntry | null {
    const importance = scoreImportance(content);

    // Auto-filter low-importance content unless forced
    if (!forceCurate && importance < this.importanceThreshold) {
      return null;
    }

    const hash = djb2Hash(content.toLowerCase());
    const entries = this.getOrCreate(sessionId);

    // Dedup check
    const existing = entries.find((e) => e.hash === hash);
    if (existing) {
      existing.reuseCount++;
      existing.lastReused = new Date();
      return existing;
    }

    const entry: CurationEntry = {
      id: `cur_${++curationCounter}`,
      content,
      hash,
      importance,
      reuseCount: 0,
      lastReused: new Date(),
      tags: extractTags(content),
      curated: true,
      curatedAt: new Date(),
    };

    entries.push(entry);
    return entry;
  }

  /** Record a reuse event for an entry */
  recordReuse(sessionId: string, entryId: string): void {
    const entries = this.getOrCreate(sessionId);
    const entry = entries.find((e) => e.id === entryId);
    if (entry) {
      entry.reuseCount++;
      entry.lastReused = new Date();
    }
  }

  /** Get entries by tags */
  getByTags(sessionId: string, tags: string[], limit = 20): CurationEntry[] {
    const entries = this.getOrCreate(sessionId);
    return entries
      .filter((e) => tags.some((tag) => e.tags.includes(tag)))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  /** Get top entries by importance */
  getTopEntries(sessionId: string, n = 20): CurationEntry[] {
    const entries = this.getOrCreate(sessionId);
    return entries
      .sort((a, b) => b.importance - a.importance)
      .slice(0, n);
  }

  /** Get most-reused entries */
  getMostReused(sessionId: string, n = 20): CurationEntry[] {
    const entries = this.getOrCreate(sessionId);
    return entries
      .sort((a, b) => b.reuseCount - a.reuseCount)
      .slice(0, n);
  }

  /** Check if content exists in curated memory */
  containsFact(sessionId: string, factText: string): boolean {
    const entries = this.getOrCreate(sessionId);
    const factLower = factText.toLowerCase();
    const factTokens = factLower.split(/\s+/).filter((t) => t.length > 3);

    for (const entry of entries) {
      const entryLower = entry.content.toLowerCase();
      let matches = 0;
      for (const token of factTokens) {
        if (entryLower.includes(token)) matches++;
      }
      if (factTokens.length > 0 && matches / factTokens.length > 0.6) {
        return true;
      }
    }
    return false;
  }

  /** Compute curation statistics */
  getStats(sessionId: string): CurationStats {
    const entries = this.getOrCreate(sessionId);
    const curated = entries.filter((e) => e.curated);
    const reused = entries.filter((e) => e.reuseCount > 0);
    const avgImportance =
      entries.length > 0
        ? entries.reduce((sum, e) => sum + e.importance, 0) / entries.length
        : 0;

    return {
      totalEntries: entries.length,
      curatedEntries: curated.length,
      reuseRate: entries.length > 0 ? reused.length / entries.length : 0,
      avgImportance,
    };
  }

  /** Prune low-importance, never-reused entries */
  prune(sessionId: string, maxAge = 3600000 /* 1 hour */): number {
    const entries = this.getOrCreate(sessionId);
    const now = Date.now();
    const before = entries.length;

    const retained = entries.filter((e) => {
      // Keep if high importance or ever reused
      if (e.importance >= 0.6 || e.reuseCount > 0) return true;
      // Remove old low-importance entries
      const age = now - e.lastReused.getTime();
      return age < maxAge;
    });

    this.entries.set(sessionId, retained);
    return before - retained.length;
  }

  clear(sessionId: string): void {
    this.entries.delete(sessionId);
  }

  private getOrCreate(sessionId: string): CurationEntry[] {
    let entries = this.entries.get(sessionId);
    if (!entries) {
      entries = [];
      this.entries.set(sessionId, entries);
    }
    return entries;
  }
}
