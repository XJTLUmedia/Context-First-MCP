import type { ToolRegistryEntry, SearchResult } from "./types.js";
import { TfIdfIndexer } from "./indexer.js";

/**
 * In-memory tool catalog backed by TF-IDF indexing for semantic search.
 */
export class ToolCatalog {
  private entries: ToolRegistryEntry[] = [];
  private indexer = new TfIdfIndexer();
  private dirty = false;

  /**
   * Register a single tool entry and mark the index as stale.
   */
  register(entry: ToolRegistryEntry): void {
    // Replace if already exists
    const existing = this.entries.findIndex((e) => e.name === entry.name);
    if (existing >= 0) {
      this.entries[existing] = entry;
    } else {
      this.entries.push(entry);
    }
    this.dirty = true;
  }

  /**
   * Register multiple tool entries at once.
   */
  registerBatch(entries: ToolRegistryEntry[]): void {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  /**
   * Search the catalog for tools matching a query string.
   * Re-indexes if the catalog has been modified since last search.
   */
  search(
    query: string,
    maxResults: number = 5,
    minScore: number = 0.01
  ): SearchResult[] {
    this.ensureIndexed();

    if (this.entries.length === 0) {
      return [];
    }

    // Build searchable documents: combine name, description, and tags
    const results = this.indexer.search(query, maxResults, minScore);

    // Map indexer results back to actual entries
    return results.map((r, _i) => {
      // Find the entry by matching the document string
      const entryIndex = this.findEntryIndexByDocument(r.entry.description);
      const entry = entryIndex >= 0 ? this.entries[entryIndex] : r.entry;
      return {
        entry,
        score: r.score,
      };
    });
  }

  /**
   * Get all registered entries.
   */
  getAll(): ToolRegistryEntry[] {
    return [...this.entries];
  }

  /**
   * Number of registered tools.
   */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Rebuild the TF-IDF index if entries have changed.
   */
  private ensureIndexed(): void {
    if (!this.dirty && this.indexer.documentCount === this.entries.length) {
      return;
    }

    const documents = this.entries.map(
      (e) => `${e.name} ${e.description} ${e.tags.join(" ")}`
    );
    this.indexer.index(documents);

    // Store vectors back on entries
    for (let i = 0; i < this.entries.length; i++) {
      this.entries[i].tfidfVector = this.indexer.getVector(i);
    }

    this.dirty = false;
  }

  /**
   * Find an entry index by its document string.
   */
  private findEntryIndexByDocument(document: string): number {
    for (let i = 0; i < this.entries.length; i++) {
      const doc = `${this.entries[i].name} ${this.entries[i].description} ${this.entries[i].tags.join(" ")}`;
      if (doc === document) {
        return i;
      }
    }
    return -1;
  }
}
