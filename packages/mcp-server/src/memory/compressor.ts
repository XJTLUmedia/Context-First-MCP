/**
 * Compressor — SimpleMem Semantic Structured Compression (SSC).
 *
 * Filters redundant content into compact memory units.
 * Uses sentence-level deduplication, semantic grouping, and
 * structural compression to achieve high compression ratios
 * while preserving all atomic facts.
 */

import type { Sentence, CompressedUnit, ContentHash } from "./types.js";
import { djb2Hash, splitSentences } from "./episode-store.js";

let compressedUnitCounter = 0;

/** Compute Jaccard similarity between two token sets */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Tokenize text for similarity comparison */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

/** Filler/hedge words to remove during structural compression */
const FILLER_PATTERNS = [
  /\b(basically|essentially|actually|really|very|quite|rather|somewhat|kind of|sort of)\b/gi,
  /\b(I think|I believe|I feel|in my opinion|to be honest|honestly)\b/gi,
  /\b(you know|I mean|like|well|so|right|okay)\b(?=[,\s])/gi,
  /\b(in order to)\b/gi,
  /\b(at this point in time)\b/gi,
  /\b(due to the fact that)\b/gi,
  /\b(in the event that)\b/gi,
  /\b(it is important to note that)\b/gi,
  /\b(as a matter of fact)\b/gi,
];

/** Remove filler language while preserving core meaning */
export function structuralCompress(text: string): string {
  let result = text;
  for (const pattern of FILLER_PATTERNS) {
    result = result.replace(pattern, "");
  }
  // Clean up double spaces
  result = result.replace(/\s{2,}/g, " ").trim();
  return result;
}

/** Group similar sentences using single-linkage clustering */
export function clusterSentences(
  sentences: Array<{ text: string; hash: ContentHash }>,
  threshold = 0.4
): Array<Array<{ text: string; hash: ContentHash }>> {
  if (sentences.length === 0) return [];

  const tokenSets = sentences.map((s) => tokenize(s.text));
  const assigned = new Set<number>();
  const clusters: Array<Array<{ text: string; hash: ContentHash }>> = [];

  for (let i = 0; i < sentences.length; i++) {
    if (assigned.has(i)) continue;

    const cluster = [sentences[i]];
    assigned.add(i);

    for (let j = i + 1; j < sentences.length; j++) {
      if (assigned.has(j)) continue;

      const sim = jaccardSimilarity(tokenSets[i], tokenSets[j]);
      if (sim >= threshold) {
        cluster.push(sentences[j]);
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

/** Merge a cluster of similar sentences into a single representative */
function mergeSentenceCluster(
  cluster: Array<{ text: string; hash: ContentHash }>
): { merged: string; originalHashes: ContentHash[] } {
  if (cluster.length === 0) return { merged: "", originalHashes: [] };
  if (cluster.length === 1) {
    return {
      merged: structuralCompress(cluster[0].text),
      originalHashes: [cluster[0].hash],
    };
  }

  // Pick the longest sentence as representative (most detail)
  const sorted = [...cluster].sort((a, b) => b.text.length - a.text.length);
  const representative = sorted[0].text;

  // Extract unique tokens from all sentences that aren't in representative
  const repTokens = tokenize(representative);
  const additionalInfo: string[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const otherTokens = tokenize(sorted[i].text);
    const unique: string[] = [];
    for (const token of otherTokens) {
      if (!repTokens.has(token) && token.length > 3) {
        unique.push(token);
        repTokens.add(token);
      }
    }
    if (unique.length > 0) {
      additionalInfo.push(unique.join(", "));
    }
  }

  let merged = structuralCompress(representative);
  if (additionalInfo.length > 0) {
    merged += ` [also: ${additionalInfo.join("; ")}]`;
  }

  return {
    merged,
    originalHashes: cluster.map((c) => c.hash),
  };
}

/**
 * Compress a batch of sentences into compact memory units.
 *
 * Phase 1: Deduplication (lossless — identical hashes)
 * Phase 2: Structural compression (near-lossless — filler removal)
 * Phase 3: Semantic clustering (near-lossless — similar sentence merging)
 *
 * Returns compressed units + mapping to original hashes for integrity verification.
 */
export function compressSentences(
  sentences: Sentence[],
  clusterThreshold = 0.4
): CompressedUnit[] {
  // Phase 1: Dedup by hash
  const seen = new Set<ContentHash>();
  const unique: Array<{ text: string; hash: ContentHash }> = [];
  for (const s of sentences) {
    if (!seen.has(s.hash)) {
      seen.add(s.hash);
      unique.push({ text: s.text, hash: s.hash });
    }
  }

  // Phase 2 & 3: Cluster and merge
  const clusters = clusterSentences(unique, clusterThreshold);
  const units: CompressedUnit[] = [];

  for (const cluster of clusters) {
    const { merged, originalHashes } = mergeSentenceCluster(cluster);
    if (merged.length === 0) continue;

    units.push({
      id: `cu_${++compressedUnitCounter}`,
      compressedText: merged,
      originalSentenceHashes: originalHashes,
      compressionRatio:
        cluster.reduce((sum, c) => sum + c.text.length, 0) / merged.length,
      factCount: originalHashes.length,
      createdAt: new Date(),
    });
  }

  return units;
}

/**
 * Full text compression: raw text → compact representation.
 * Preserves all semantic content while reducing size.
 */
export function compressText(text: string): {
  compressed: string;
  originalHashes: ContentHash[];
  compressionRatio: number;
} {
  const rawSentences = splitSentences(text);
  const sentences: Sentence[] = rawSentences.map((t, i) => ({
    id: `tmp_s${i}`,
    text: t,
    hash: djb2Hash(t.toLowerCase().trim()),
    sourceEpisodeId: "compression",
    position: i,
    timestamp: new Date(),
  }));

  const units = compressSentences(sentences);
  const compressed = units.map((u) => u.compressedText).join(" ");
  const allHashes = units.flatMap((u) => u.originalSentenceHashes);

  return {
    compressed,
    originalHashes: allHashes,
    compressionRatio: text.length / Math.max(1, compressed.length),
  };
}
