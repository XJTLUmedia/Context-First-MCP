/**
 * CallbackMemory — ReMemR1 callback-enhanced memory.
 *
 * Allows the model to revisit and integrate early evidence
 * during non-linear reasoning. Trigger patterns activate
 * retrieval of previously stored facts.
 */

import type { CallbackEntry, ContentHash } from "./types.js";
import { djb2Hash } from "./episode-store.js";

let callbackCounter = 0;

/** Generate trigger patterns from content */
function generateTriggerPatterns(content: string): string[] {
  const lower = content.toLowerCase();
  const patterns: string[] = [];

  // Extract key noun phrases as triggers
  const nounPhrases = content.match(
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g
  );
  if (nounPhrases) {
    patterns.push(...nounPhrases.map((p) => p.toLowerCase()));
  }

  // Technical terms
  const techTerms = content.match(
    /\b[a-z]+(?:[A-Z][a-z]+)+\b|\b\w+_\w+\b|\b\w+-\w+\b/g
  );
  if (techTerms) {
    patterns.push(...techTerms.map((t) => t.toLowerCase()));
  }

  // Key phrases with "is", "are", "means"
  const defMatches = lower.match(/(\w[\w\s]{2,20})\s+(?:is|are|means?)\s+/g);
  if (defMatches) {
    patterns.push(...defMatches.map((m) => m.trim().replace(/\s+(is|are|means?)\s*$/, "")));
  }

  // Numbers with context
  const numContext = content.match(
    /\b\d+(?:\.\d+)?\s*(?:%|MB|GB|ms|s|tokens?)\b/gi
  );
  if (numContext) {
    patterns.push(...numContext.map((n) => n.toLowerCase()));
  }

  // Deduplicate
  return [...new Set(patterns)].filter((p) => p.length >= 3);
}

/**
 * CallbackMemory: ReMemR1-style callback-enhanced recall.
 *
 * When new content contains trigger patterns that match previously
 * registered callbacks, those facts are "activated" — brought back
 * to the surface for integration with current reasoning.
 */
export class CallbackMemory {
  private callbacks = new Map<string, CallbackEntry[]>();

  /** Register callbacks for a piece of content */
  register(
    sessionId: string,
    content: string,
    sourceEpisodeId: string
  ): CallbackEntry[] {
    const entries = this.getOrCreate(sessionId);
    const patterns = generateTriggerPatterns(content);
    const hash = djb2Hash(content.toLowerCase());
    const newCallbacks: CallbackEntry[] = [];

    for (const pattern of patterns) {
      // Check if this exact trigger+target already exists
      const existing = entries.find(
        (e) => e.triggerPattern === pattern && e.targetFactHash === hash
      );
      if (existing) continue;

      const entry: CallbackEntry = {
        id: `cb_${++callbackCounter}`,
        triggerPattern: pattern,
        targetFactHash: hash,
        targetContent: content,
        sourceEpisodeId,
        activationCount: 0,
        createdAt: new Date(),
      };

      entries.push(entry);
      newCallbacks.push(entry);
    }

    return newCallbacks;
  }

  /**
   * Activate callbacks matching the given query.
   * Returns facts that should be revisited based on trigger patterns.
   */
  activate(
    sessionId: string,
    query: string
  ): Array<{ callback: CallbackEntry; matchedPattern: string }> {
    const entries = this.getOrCreate(sessionId);
    const queryLower = query.toLowerCase();
    const activated: Array<{
      callback: CallbackEntry;
      matchedPattern: string;
    }> = [];
    const activatedHashes = new Set<ContentHash>();

    for (const entry of entries) {
      if (
        queryLower.includes(entry.triggerPattern) &&
        !activatedHashes.has(entry.targetFactHash)
      ) {
        entry.activationCount++;
        entry.lastActivated = new Date();
        activated.push({
          callback: entry,
          matchedPattern: entry.triggerPattern,
        });
        activatedHashes.add(entry.targetFactHash);
      }
    }

    // Sort by activation count (most cited first)
    return activated.sort(
      (a, b) => b.callback.activationCount - a.callback.activationCount
    );
  }

  /** Get all active patterns */
  getActivePatterns(sessionId: string): string[] {
    const entries = this.getOrCreate(sessionId);
    return [...new Set(entries.map((e) => e.triggerPattern))];
  }

  /** Get callback stats */
  getStats(sessionId: string) {
    const entries = this.getOrCreate(sessionId);
    const activePatterns = new Set(entries.map((e) => e.triggerPattern));
    return {
      total: entries.length,
      activePatterns: activePatterns.size,
    };
  }

  /** Check if content matches any callback */
  containsFact(sessionId: string, factText: string): boolean {
    const entries = this.getOrCreate(sessionId);
    const factLower = factText.toLowerCase();

    return entries.some((e) =>
      e.targetContent.toLowerCase().includes(factLower) ||
      factLower.includes(e.targetContent.toLowerCase())
    );
  }

  clear(sessionId: string): void {
    this.callbacks.delete(sessionId);
  }

  private getOrCreate(sessionId: string): CallbackEntry[] {
    let entries = this.callbacks.get(sessionId);
    if (!entries) {
      entries = [];
      this.callbacks.set(sessionId, entries);
    }
    return entries;
  }
}
