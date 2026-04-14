import type { SearchResult } from "./types.js";

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "and", "but", "or",
  "nor", "not", "no", "so", "yet", "both", "either", "neither", "each",
  "every", "all", "any", "few", "more", "most", "other", "some", "such",
  "than", "too", "very", "just", "also", "now", "then", "here", "there",
  "when", "where", "why", "how", "what", "which", "who", "whom", "this",
  "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
  "me", "him", "her", "us", "them", "my", "your", "his", "its", "our",
  "their", "if", "else", "about", "up", "out", "only", "over", "such",
]);

/**
 * Tokenize a string: lowercase, split on non-alphanumeric, remove stopwords.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Pure TypeScript TF-IDF indexer with cosine similarity search.
 * Zero external dependencies.
 */
export class TfIdfIndexer {
  private documents: string[] = [];
  private vocabulary: string[] = [];
  private vocabIndex = new Map<string, number>();
  private tfidfMatrix: number[][] = [];
  private idfValues: number[] = [];

  /**
   * Build the TF-IDF matrix from a set of document strings.
   * Call this whenever the document corpus changes.
   */
  index(documents: string[]): void {
    this.documents = documents;

    if (documents.length === 0) {
      this.vocabulary = [];
      this.vocabIndex.clear();
      this.tfidfMatrix = [];
      this.idfValues = [];
      return;
    }

    // Tokenize all documents
    const tokenizedDocs = documents.map(tokenize);

    // Build vocabulary
    const vocabSet = new Set<string>();
    for (const tokens of tokenizedDocs) {
      for (const token of tokens) {
        vocabSet.add(token);
      }
    }
    this.vocabulary = [...vocabSet].sort();
    this.vocabIndex.clear();
    for (let i = 0; i < this.vocabulary.length; i++) {
      this.vocabIndex.set(this.vocabulary[i], i);
    }

    const numDocs = documents.length;
    const vocabSize = this.vocabulary.length;

    // Compute DF (document frequency)
    const df = new Array<number>(vocabSize).fill(0);
    for (const tokens of tokenizedDocs) {
      const seen = new Set<string>();
      for (const token of tokens) {
        if (!seen.has(token)) {
          seen.add(token);
          const idx = this.vocabIndex.get(token);
          if (idx !== undefined) df[idx]++;
        }
      }
    }

    // Compute IDF
    this.idfValues = df.map((d) =>
      d > 0 ? Math.log(numDocs / d) : 0
    );

    // Compute TF-IDF vectors
    this.tfidfMatrix = [];
    for (const tokens of tokenizedDocs) {
      const vector = new Array<number>(vocabSize).fill(0);
      const totalTerms = tokens.length;

      if (totalTerms > 0) {
        // Count term frequencies
        const termCounts = new Map<string, number>();
        for (const token of tokens) {
          termCounts.set(token, (termCounts.get(token) || 0) + 1);
        }

        // TF * IDF
        for (const [term, count] of termCounts) {
          const idx = this.vocabIndex.get(term);
          if (idx !== undefined) {
            const tf = count / totalTerms;
            vector[idx] = tf * this.idfValues[idx];
          }
        }
      }

      this.tfidfMatrix.push(vector);
    }
  }

  /**
   * Search for the most relevant documents matching the query.
   * Returns scored results sorted by descending relevance.
   */
  search(query: string, topK: number = 5, minScore: number = 0): SearchResult[] {
    if (this.documents.length === 0 || this.vocabulary.length === 0) {
      return [];
    }

    // Build query vector
    const queryTokens = tokenize(query);
    const queryVector = new Array<number>(this.vocabulary.length).fill(0);
    const totalTerms = queryTokens.length;

    if (totalTerms === 0) {
      return [];
    }

    const termCounts = new Map<string, number>();
    for (const token of queryTokens) {
      termCounts.set(token, (termCounts.get(token) || 0) + 1);
    }

    for (const [term, count] of termCounts) {
      const idx = this.vocabIndex.get(term);
      if (idx !== undefined) {
        const tf = count / totalTerms;
        queryVector[idx] = tf * this.idfValues[idx];
      }
    }

    // Compute cosine similarity with each document
    const scores: Array<{ index: number; score: number }> = [];
    for (let i = 0; i < this.tfidfMatrix.length; i++) {
      const similarity = cosineSimilarity(queryVector, this.tfidfMatrix[i]);
      if (similarity >= minScore) {
        scores.push({ index: i, score: similarity });
      }
    }

    // Sort by score descending, take topK
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK).map((s) => ({
      entry: {
        name: "",
        description: this.documents[s.index],
        inputSchema: {},
        tags: [],
      },
      score: Math.round(s.score * 10000) / 10000,
    }));
  }

  /**
   * Get the TF-IDF vector for a document at a given index.
   */
  getVector(index: number): number[] | undefined {
    return this.tfidfMatrix[index];
  }

  /**
   * Get the TF-IDF vector for a query string.
   */
  computeQueryVector(query: string): number[] {
    const queryTokens = tokenize(query);
    const vector = new Array<number>(this.vocabulary.length).fill(0);
    const totalTerms = queryTokens.length;

    if (totalTerms === 0) return vector;

    const termCounts = new Map<string, number>();
    for (const token of queryTokens) {
      termCounts.set(token, (termCounts.get(token) || 0) + 1);
    }

    for (const [term, count] of termCounts) {
      const idx = this.vocabIndex.get(term);
      if (idx !== undefined) {
        const tf = count / totalTerms;
        vector[idx] = tf * this.idfValues[idx];
      }
    }

    return vector;
  }

  get documentCount(): number {
    return this.documents.length;
  }

  get vocabularySize(): number {
    return this.vocabulary.length;
  }
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
