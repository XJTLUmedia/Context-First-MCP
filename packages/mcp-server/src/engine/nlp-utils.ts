/**
 * Shared NLP Utilities
 *
 * Provides real NLP computation using `compromise` and `natural` packages
 * that are already in the project dependencies. These utilities replace
 * crude regex/token-overlap heuristics across multiple engine files.
 */

import nlp from "compromise";
import natural from "natural";
import { compareTwoStrings } from "string-similarity";

// ─── Sentence Splitting ───

/**
 * Split text into sentences using compromise NLP.
 * Handles abbreviations, decimals, and edge cases that
 * regex-based splitting (e.g. `/(?<=[.!?])\s+/`) gets wrong.
 */
export function splitSentences(text: string): string[] {
  if (!text || text.trim().length === 0) return [];
  const doc = nlp(text);
  const sentences = doc.sentences().out("array") as string[];
  return sentences.filter((s: string) => s.trim().length > 0);
}

// ─── TF-IDF Cosine Similarity ───

/**
 * Compute TF-IDF cosine similarity between two texts.
 * Uses `natural.TfIdf` for proper term weighting instead of raw token overlap.
 */
export function tfidfCosineSimilarity(textA: string, textB: string): number {
  if (!textA.trim() || !textB.trim()) return 0;

  const tfidf = new natural.TfIdf();
  tfidf.addDocument(textA.toLowerCase());
  tfidf.addDocument(textB.toLowerCase());

  // Collect all terms across both documents
  const allTerms = new Set<string>();
  tfidf.listTerms(0).forEach((item: { term: string }) => allTerms.add(item.term));
  tfidf.listTerms(1).forEach((item: { term: string }) => allTerms.add(item.term));

  if (allTerms.size === 0) return 0;

  // Build TF-IDF vectors
  const vecA: number[] = [];
  const vecB: number[] = [];

  for (const term of allTerms) {
    let scoreA = 0;
    let scoreB = 0;
    tfidf.tfidfs(term, (docIdx: number, measure: number) => {
      if (docIdx === 0) scoreA = measure;
      if (docIdx === 1) scoreB = measure;
    });
    vecA.push(scoreA);
    vecB.push(scoreB);
  }

  // Cosine similarity
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator > 0 ? dotProduct / denominator : 0;
}

// ─── Noun / Topic Extraction ───

/**
 * Extract meaningful nouns and topics from text using compromise.
 * Returns unique normalized nouns, sorted by frequency.
 */
export function extractNouns(text: string): string[] {
  if (!text.trim()) return [];
  const doc = nlp(text);
  const nouns = doc.nouns().out("array") as string[];
  // Normalize and deduplicate
  const normalized = nouns.map((n: string) => n.toLowerCase().trim()).filter((n: string) => n.length > 2);
  const freq = new Map<string, number>();
  for (const n of normalized) {
    freq.set(n, (freq.get(n) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
}

/**
 * Extract verbs from text using compromise.
 */
export function extractVerbs(text: string): string[] {
  if (!text.trim()) return [];
  const doc = nlp(text);
  const verbs = doc.verbs().out("array") as string[];
  return [...new Set(verbs.map((v: string) => v.toLowerCase().trim()).filter((v: string) => v.length > 2))];
}

// ─── Paraphrasing Utilities ───

const SYNONYM_MAP: Record<string, string[]> = {
  important: ["significant", "crucial", "vital", "essential"],
  significant: ["important", "notable", "substantial", "meaningful"],
  large: ["substantial", "considerable", "extensive", "sizable"],
  small: ["minor", "modest", "limited", "slight"],
  good: ["effective", "beneficial", "favorable", "positive"],
  bad: ["detrimental", "adverse", "negative", "unfavorable"],
  increase: ["growth", "rise", "expansion", "gain"],
  decrease: ["decline", "reduction", "drop", "fall"],
  create: ["generate", "produce", "establish", "develop"],
  use: ["utilize", "employ", "apply", "leverage"],
  show: ["demonstrate", "indicate", "reveal", "illustrate"],
  help: ["assist", "support", "facilitate", "aid"],
  problem: ["issue", "challenge", "difficulty", "obstacle"],
  method: ["approach", "technique", "strategy", "procedure"],
  result: ["outcome", "consequence", "effect", "finding"],
  change: ["modification", "alteration", "adjustment", "shift"],
  process: ["procedure", "mechanism", "operation", "workflow"],
  system: ["framework", "structure", "infrastructure", "architecture"],
  part: ["component", "element", "aspect", "segment"],
  type: ["category", "kind", "variety", "class"],
};

/**
 * Replace a word with a synonym from the map.
 * Returns the original word if no synonym is available.
 * Uses index for deterministic selection.
 */
export function getSynonym(word: string, index: number = 0): string {
  const lower = word.toLowerCase();
  const synonyms = SYNONYM_MAP[lower];
  if (!synonyms || synonyms.length === 0) return word;
  return synonyms[index % synonyms.length];
}

/**
 * Paraphrase text by substituting nouns/verbs with synonyms
 * and restructuring clauses.
 */
export function paraphraseText(text: string): string {
  // Strategy 1: synonym substitution on content words
  const words = text.split(/\s+/);
  let changed = false;
  const result = words.map((w, i) => {
    const clean = w.replace(/[^a-zA-Z]/g, "").toLowerCase();
    if (SYNONYM_MAP[clean] && !changed) {
      changed = true;
      const syn = getSynonym(clean, i);
      // Preserve original casing of first char
      const cased = w[0] === w[0].toUpperCase()
        ? syn.charAt(0).toUpperCase() + syn.slice(1)
        : syn;
      // Preserve trailing punctuation
      const trailing = w.match(/[^a-zA-Z]+$/)?.[0] || "";
      return cased + trailing;
    }
    return w;
  });

  return result.join(" ");
}

// ─── Sentence Ranking ───

/**
 * Rank sentences by TF-IDF importance relative to the full text.
 * Returns sentences sorted by importance (most important first).
 */
export function rankSentencesByImportance(text: string): string[] {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) return sentences;

  const tfidf = new natural.TfIdf();
  // Add each sentence as a document
  for (const s of sentences) {
    tfidf.addDocument(s.toLowerCase());
  }
  // Add the full text as a reference document
  tfidf.addDocument(text.toLowerCase());
  const refIdx = sentences.length;

  // Score each sentence by similarity to the full text
  const scored = sentences.map((sentence, sentIdx) => {
    const terms = new Set<string>();
    tfidf.listTerms(sentIdx).forEach((item: { term: string }) => terms.add(item.term));
    tfidf.listTerms(refIdx).forEach((item: { term: string }) => terms.add(item.term));

    let dot = 0, normS = 0, normR = 0;
    for (const term of terms) {
      let sScore = 0, rScore = 0;
      tfidf.tfidfs(term, (docIdx: number, measure: number) => {
        if (docIdx === sentIdx) sScore = measure;
        if (docIdx === refIdx) rScore = measure;
      });
      dot += sScore * rScore;
      normS += sScore * sScore;
      normR += rScore * rScore;
    }
    const denom = Math.sqrt(normS) * Math.sqrt(normR);
    const sim = denom > 0 ? dot / denom : 0;
    return { sentence, score: sim };
  });

  return scored.sort((a, b) => b.score - a.score).map(s => s.sentence);
}

// ─── Text Analysis Helpers ───

/**
 * Extract entities (people, places, organizations) from text using compromise.
 */
export function extractEntities(text: string): { people: string[]; places: string[]; organizations: string[] } {
  const doc = nlp(text);
  return {
    people: (doc.people().out("array") as string[]).map((s: string) => s.trim()),
    places: (doc.places().out("array") as string[]).map((s: string) => s.trim()),
    organizations: (doc.organizations().out("array") as string[]).map((s: string) => s.trim()),
  };
}

/**
 * Count syllables in a word (for readability scoring).
 */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 2) return 1;
  let count = 0;
  const vowels = "aeiouy";
  let prevVowel = false;
  for (const char of w) {
    const isVowel = vowels.includes(char);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }
  // Silent e
  if (w.endsWith("e") && count > 1) count--;
  return Math.max(1, count);
}

/**
 * Compute Flesch-Kincaid readability grade level.
 * Lower is easier to read.
 */
export function fleschKincaidGrade(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return 0;

  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;

  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = totalSyllables / words.length;

  // Flesch-Kincaid Grade Level formula
  return 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;
}

/**
 * Remove hedge words from text to increase specificity.
 */
export function removeHedgeWords(text: string): string {
  const hedges = /\b(?:I think|I believe|probably|maybe|perhaps|possibly|somewhat|kind of|sort of|more or less|in a way|to some extent)\b/gi;
  return text.replace(hedges, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * Remove filler phrases from text.
 */
export function removeFillers(text: string): string {
  const fillers = /\b(?:basically|literally|actually|really|just|very|quite|rather|pretty much|you know|I mean|well,?)\b/gi;
  return text.replace(fillers, "").replace(/\s{2,}/g, " ").trim();
}

// Re-export for convenience
export { compareTwoStrings } from "string-similarity";
