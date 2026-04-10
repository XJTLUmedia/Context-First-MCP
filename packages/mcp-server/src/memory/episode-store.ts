/**
 * EpisodeStore — MemMachine ground-truth-preserving architecture.
 *
 * Stores raw conversational episodes at sentence level.
 * Reduces token costs ~80% by providing high-level abstraction layer
 * while preserving raw sentence-level data for integrity verification.
 */

import type {
  Episode,
  Sentence,
  ContentHash,
  AtomicFact,
} from "./types.js";

/** DJB2 hash — fast, deterministic, collision-resistant for our use case */
export function djb2Hash(str: string): ContentHash {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return `h_${(hash >>> 0).toString(36)}`;
}

/** Split text into sentences with basic abbreviation awareness */
export function splitSentences(text: string): string[] {
  // Handle common abbreviations to avoid false splits
  const protected_ = text
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|i\.e|e\.g)\./gi, (m) =>
      m.replace(".", "\x00")
    )
    .replace(/(\d)\./g, "$1\x00");

  const raw = protected_.split(/(?<=[.!?])\s+/);
  return raw
    .map((s) => s.replace(/\x00/g, ".").trim())
    .filter((s) => s.length > 0);
}

/** Extract atomic facts from text for integrity verification */
export function extractAtomicFacts(
  text: string,
  episodeId: string
): AtomicFact[] {
  const facts: AtomicFact[] = [];
  const sentences = splitSentences(text);

  for (const sentence of sentences) {
    const normalized = sentence
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (normalized.length < 5) continue;

    const entities = extractEntitiesFromSentence(sentence);
    const hash = djb2Hash(normalized);

    // Declaration fact (every meaningful sentence)
    facts.push({
      id: `fact_${hash}`,
      hash,
      text: sentence,
      type: "declaration",
      entities,
      sourceEpisodeId: episodeId,
    });

    // Association facts from "X is Y" patterns
    const assocMatch = sentence.match(
      /\b(\w[\w\s]{0,30}?)\s+(?:is|are|was|were|equals?|means?)\s+(.{3,80})/i
    );
    if (assocMatch) {
      const assocHash = djb2Hash(
        `assoc:${assocMatch[1].trim().toLowerCase()}:${assocMatch[2].trim().toLowerCase()}`
      );
      facts.push({
        id: `fact_${assocHash}`,
        hash: assocHash,
        text: `${assocMatch[1].trim()} = ${assocMatch[2].trim()}`,
        type: "association",
        entities: [assocMatch[1].trim(), assocMatch[2].trim()],
        sourceEpisodeId: episodeId,
      });
    }

    // Triple facts from "X verb Y" patterns
    const tripleMatch = sentence.match(
      /\b([A-Z][\w]*(?:\s+[A-Z][\w]*)*)\s+([\w]+(?:s|ed|ing)?)\s+(?:the\s+|a\s+|an\s+)?([A-Z][\w]*(?:\s+[A-Z][\w]*)*)/
    );
    if (tripleMatch) {
      const tripleHash = djb2Hash(
        `triple:${tripleMatch[1].toLowerCase()}:${tripleMatch[2].toLowerCase()}:${tripleMatch[3].toLowerCase()}`
      );
      facts.push({
        id: `fact_${tripleHash}`,
        hash: tripleHash,
        text: `(${tripleMatch[1]}, ${tripleMatch[2]}, ${tripleMatch[3]})`,
        type: "triple",
        entities: [tripleMatch[1], tripleMatch[3]],
        sourceEpisodeId: episodeId,
      });
    }
  }

  // Deduplicate by hash
  const seen = new Set<string>();
  return facts.filter((f) => {
    if (seen.has(f.hash)) return false;
    seen.add(f.hash);
    return true;
  });
}

function extractEntitiesFromSentence(sentence: string): string[] {
  const entities: string[] = [];

  // Capitalized multi-word names
  const nameMatches = sentence.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
  if (nameMatches) entities.push(...nameMatches);

  // Quoted strings
  const quotedMatches = sentence.match(/"([^"]{2,50})"/g);
  if (quotedMatches)
    entities.push(...quotedMatches.map((q) => q.replace(/"/g, "")));

  // Numbers with units
  const numMatches = sentence.match(/\d+(?:\.\d+)?(?:\s*(?:%|ms|s|MB|GB|KB|tokens?))?/g);
  if (numMatches) entities.push(...numMatches);

  return [...new Set(entities)];
}

let episodeCounter = 0;

/**
 * EpisodeStore: Sentence-level raw conversational storage.
 * Core of the MemMachine architecture.
 */
export class EpisodeStore {
  private episodes = new Map<string, Episode>();
  private sentenceIndex = new Map<ContentHash, Sentence>();
  private sessionEpisodes = new Map<string, string[]>(); // sessionId → episodeIds

  /** Ingest raw content, split into sentences, return episode */
  ingest(
    sessionId: string,
    role: "user" | "assistant" | "system",
    content: string,
    turn: number,
    metadata: Record<string, unknown> = {}
  ): Episode {
    const id = `ep_${++episodeCounter}_${Date.now().toString(36)}`;
    const sentences = splitSentences(content);
    const now = new Date();

    const sentenceObjs: Sentence[] = sentences.map((text, i) => {
      const hash = djb2Hash(text.toLowerCase().trim());
      const s: Sentence = {
        id: `${id}_s${i}`,
        text,
        hash,
        sourceEpisodeId: id,
        position: i,
        timestamp: now,
      };
      this.sentenceIndex.set(hash, s);
      return s;
    });

    const episode: Episode = {
      id,
      sessionId,
      role,
      rawContent: content,
      sentences: sentenceObjs,
      timestamp: now,
      turn,
      metadata,
    };

    this.episodes.set(id, episode);

    const sessionEps = this.sessionEpisodes.get(sessionId) ?? [];
    sessionEps.push(id);
    this.sessionEpisodes.set(sessionId, sessionEps);

    return episode;
  }

  /** Get episode by ID */
  getEpisode(episodeId: string): Episode | undefined {
    return this.episodes.get(episodeId);
  }

  /** Get all episodes for a session, ordered by turn */
  getSessionEpisodes(sessionId: string): Episode[] {
    const ids = this.sessionEpisodes.get(sessionId) ?? [];
    return ids
      .map((id) => this.episodes.get(id))
      .filter((e): e is Episode => !!e)
      .sort((a, b) => a.turn - b.turn);
  }

  /** Look up a sentence by content hash (dedup-safe) */
  getSentenceByHash(hash: ContentHash): Sentence | undefined {
    return this.sentenceIndex.get(hash);
  }

  /** Check if a sentence exists by hash */
  hasSentence(hash: ContentHash): boolean {
    return this.sentenceIndex.has(hash);
  }

  /** Get total sentence count for a session */
  getSessionSentenceCount(sessionId: string): number {
    const episodes = this.getSessionEpisodes(sessionId);
    return episodes.reduce((sum, ep) => sum + ep.sentences.length, 0);
  }

  /** Get total raw character count for a session */
  getSessionRawSize(sessionId: string): number {
    const episodes = this.getSessionEpisodes(sessionId);
    return episodes.reduce((sum, ep) => sum + ep.rawContent.length, 0);
  }

  /** Extract all atomic facts from a session's episodes */
  extractAllFacts(sessionId: string): AtomicFact[] {
    const episodes = this.getSessionEpisodes(sessionId);
    const allFacts: AtomicFact[] = [];
    const seen = new Set<string>();

    for (const ep of episodes) {
      const facts = extractAtomicFacts(ep.rawContent, ep.id);
      for (const fact of facts) {
        if (!seen.has(fact.hash)) {
          seen.add(fact.hash);
          allFacts.push(fact);
        }
      }
    }
    return allFacts;
  }

  /** Search sentences by text substring */
  searchSentences(
    sessionId: string,
    query: string,
    maxResults = 20
  ): Sentence[] {
    const queryLower = query.toLowerCase();
    const episodes = this.getSessionEpisodes(sessionId);
    const results: Sentence[] = [];

    for (const ep of episodes) {
      for (const s of ep.sentences) {
        if (s.text.toLowerCase().includes(queryLower)) {
          results.push(s);
          if (results.length >= maxResults) return results;
        }
      }
    }
    return results;
  }

  /** Get storage stats */
  getStats(sessionId: string) {
    const episodes = this.getSessionEpisodes(sessionId);
    return {
      totalEpisodes: episodes.length,
      totalSentences: episodes.reduce(
        (sum, ep) => sum + ep.sentences.length,
        0
      ),
      totalRawChars: episodes.reduce(
        (sum, ep) => sum + ep.rawContent.length,
        0
      ),
      uniqueSentenceHashes: new Set(
        episodes.flatMap((ep) => ep.sentences.map((s) => s.hash))
      ).size,
    };
  }

  /** Clear all data for a session */
  clearSession(sessionId: string): void {
    const ids = this.sessionEpisodes.get(sessionId) ?? [];
    for (const id of ids) {
      const ep = this.episodes.get(id);
      if (ep) {
        for (const s of ep.sentences) {
          this.sentenceIndex.delete(s.hash);
        }
      }
      this.episodes.delete(id);
    }
    this.sessionEpisodes.delete(sessionId);
  }
}
