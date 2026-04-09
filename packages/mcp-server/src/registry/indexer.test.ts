import { describe, it, expect } from "vitest";
import { TfIdfIndexer, tokenize } from "./indexer.js";

describe("tokenize", () => {
  it("lowercases and splits on non-alphanumeric", () => {
    const tokens = tokenize("Hello World! This is a test.");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
    expect(tokens).toContain("test");
  });

  it("removes stopwords", () => {
    const tokens = tokenize("the quick brown fox is a very good animal");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("is");
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("very");
    expect(tokens).toContain("quick");
    expect(tokens).toContain("brown");
    expect(tokens).toContain("fox");
    expect(tokens).toContain("animal");
  });

  it("filters out single-character tokens", () => {
    const tokens = tokenize("a b c hello world");
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("b");
    expect(tokens).not.toContain("c");
    expect(tokens).toContain("hello");
  });

  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("TfIdfIndexer", () => {
  it("indexes documents and returns search results", () => {
    const indexer = new TfIdfIndexer();
    indexer.index([
      "manage conversation state and ground truth",
      "detect conflicts in user requirements",
      "analyze entropy and hedge word frequency",
    ]);

    expect(indexer.documentCount).toBe(3);
    expect(indexer.vocabularySize).toBeGreaterThan(0);

    const results = indexer.search("conflict detection requirements");
    expect(results.length).toBeGreaterThan(0);
    // The conflict-related document should rank highest
    expect(results[0].entry.description).toContain("conflict");
  });

  it("returns empty results for empty corpus", () => {
    const indexer = new TfIdfIndexer();
    indexer.index([]);
    expect(indexer.search("anything")).toEqual([]);
  });

  it("returns empty results for empty query", () => {
    const indexer = new TfIdfIndexer();
    indexer.index(["hello world"]);
    expect(indexer.search("")).toEqual([]);
  });

  it("respects minScore filter", () => {
    const indexer = new TfIdfIndexer();
    indexer.index([
      "conversation recap summary history",
      "completely unrelated document about cooking recipes",
    ]);

    const strictResults = indexer.search("conversation history", 5, 0.5);
    // Only the first document should match with high score
    for (const r of strictResults) {
      expect(r.score).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("respects topK limit", () => {
    const indexer = new TfIdfIndexer();
    indexer.index([
      "document one about testing",
      "document two about testing",
      "document three about testing",
      "document four about testing",
      "document five about testing",
    ]);

    const results = indexer.search("testing document", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("handles re-indexing correctly", () => {
    const indexer = new TfIdfIndexer();
    indexer.index(["first document"]);
    expect(indexer.documentCount).toBe(1);

    indexer.index(["second document", "third document"]);
    expect(indexer.documentCount).toBe(2);
  });

  it("computes query vectors", () => {
    const indexer = new TfIdfIndexer();
    indexer.index(["hello world", "goodbye world"]);

    const vector = indexer.computeQueryVector("hello");
    expect(vector.length).toBe(indexer.vocabularySize);
    // At least one non-zero entry for "hello"
    expect(vector.some((v) => v > 0)).toBe(true);
  });

  it("distinguishes between different topics", () => {
    const indexer = new TfIdfIndexer();
    indexer.index([
      "database migration SQL schema tables",
      "user authentication login password security",
      "frontend React component UI rendering",
    ]);

    const dbResults = indexer.search("database tables migration");
    expect(dbResults[0].entry.description).toContain("database");

    const authResults = indexer.search("login authentication");
    expect(authResults[0].entry.description).toContain("authentication");

    const uiResults = indexer.search("React component rendering");
    expect(uiResults[0].entry.description).toContain("React");
  });
});
