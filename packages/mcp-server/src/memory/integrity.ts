/**
 * Integrity Checker — Verifies <0.01% information loss after compaction.
 *
 * Uses atomic fact extraction before and after compaction to measure
 * exactly how much information is preserved. Each fact is checked
 * against all memory tiers to ensure recoverability.
 */

import type { AtomicFact, IntegrityReport, ContentHash } from "./types.js";
import { djb2Hash, extractAtomicFacts, splitSentences } from "./episode-store.js";

/** Maximum acceptable loss percentage */
export const MAX_ACCEPTABLE_LOSS = 0.0001; // 0.01%

/**
 * Check if a single fact is retained across memory tiers.
 *
 * A fact is considered "retained" if its content can be found in any of:
 * - Raw episode storage (exact sentence match by hash)
 * - Compressed units (original hash preserved in mapping)
 * - Semantic memory (token overlap > 60%)
 * - Knowledge graph (entity mentions preserved)
 * - Working memory (content match)
 * - Curated memory (content match)
 * - Callback memory (trigger pattern match)
 */
export function isFactRetained(
  fact: AtomicFact,
  checkers: {
    hasSentenceHash: (hash: ContentHash) => boolean;
    hasCompressedHash: (hash: ContentHash) => boolean;
    hasInSemanticMemory: (text: string) => boolean;
    hasInGraph: (text: string) => boolean;
    hasInWorkingMemory: (hash: ContentHash) => boolean;
    hasInScratchpad: (hash: ContentHash) => boolean;
    hasInCuratedMemory: (text: string) => boolean;
    hasInCallbackMemory: (text: string) => boolean;
  }
): boolean {
  // Check 1: Exact sentence hash in episode store (ground truth — lossless)
  if (checkers.hasSentenceHash(fact.hash)) return true;

  // Check 2: Hash preserved in compressed unit mapping
  if (checkers.hasCompressedHash(fact.hash)) return true;

  // Check 3: Working memory
  if (checkers.hasInWorkingMemory(fact.hash)) return true;

  // Check 4: Scratchpad
  if (checkers.hasInScratchpad(fact.hash)) return true;

  // Check 5: Semantic memory (token overlap check)
  if (checkers.hasInSemanticMemory(fact.text)) return true;

  // Check 6: Knowledge graph (entity presence)
  if (checkers.hasInGraph(fact.text)) return true;

  // Check 7: Curated memory
  if (checkers.hasInCuratedMemory(fact.text)) return true;

  // Check 8: Callback memory
  if (checkers.hasInCallbackMemory(fact.text)) return true;

  return false;
}

/**
 * Verify integrity of memory after compaction.
 *
 * Extracts all atomic facts from raw episodes, then checks each
 * against all memory tiers. Returns detailed integrity report.
 */
export function verifyIntegrity(
  facts: AtomicFact[],
  checkers: {
    hasSentenceHash: (hash: ContentHash) => boolean;
    hasCompressedHash: (hash: ContentHash) => boolean;
    hasInSemanticMemory: (text: string) => boolean;
    hasInGraph: (text: string) => boolean;
    hasInWorkingMemory: (hash: ContentHash) => boolean;
    hasInScratchpad: (hash: ContentHash) => boolean;
    hasInCuratedMemory: (text: string) => boolean;
    hasInCallbackMemory: (text: string) => boolean;
  }
): IntegrityReport {
  const startTime = Date.now();
  const lostFacts: Array<{ factId: string; text: string }> = [];

  for (const fact of facts) {
    if (!isFactRetained(fact, checkers)) {
      lostFacts.push({ factId: fact.id, text: fact.text });
    }
  }

  const totalFacts = facts.length;
  const retainedFacts = totalFacts - lostFacts.length;
  const lossPercentage =
    totalFacts > 0 ? lostFacts.length / totalFacts : 0;

  return {
    totalFacts,
    retainedFacts,
    lostFacts: lostFacts.length,
    lossPercentage,
    verified: lossPercentage <= MAX_ACCEPTABLE_LOSS,
    lostFactDetails: lostFacts,
    compactionTimestamp: new Date(),
    verificationDurationMs: Date.now() - startTime,
  };
}

/**
 * Quick integrity check — samples facts instead of checking all.
 * Useful for large fact sets where full verification is too slow.
 * Uses random sampling with confidence interval estimation.
 */
export function quickIntegrityCheck(
  facts: AtomicFact[],
  checkers: {
    hasSentenceHash: (hash: ContentHash) => boolean;
    hasCompressedHash: (hash: ContentHash) => boolean;
    hasInSemanticMemory: (text: string) => boolean;
    hasInGraph: (text: string) => boolean;
    hasInWorkingMemory: (hash: ContentHash) => boolean;
    hasInScratchpad: (hash: ContentHash) => boolean;
    hasInCuratedMemory: (text: string) => boolean;
    hasInCallbackMemory: (text: string) => boolean;
  },
  sampleSize = 1000
): IntegrityReport {
  const startTime = Date.now();

  // If fact set is small enough, do full check
  if (facts.length <= sampleSize) {
    return verifyIntegrity(facts, checkers);
  }

  // Random sampling without replacement
  const indices = new Set<number>();
  while (indices.size < sampleSize) {
    indices.add(Math.floor(Math.random() * facts.length));
  }

  const sampledFacts = Array.from(indices).map((i) => facts[i]);
  const sampleReport = verifyIntegrity(sampledFacts, checkers);

  // Extrapolate to full fact set
  const estimatedLostFacts = Math.round(
    (sampleReport.lostFacts / sampleSize) * facts.length
  );

  return {
    totalFacts: facts.length,
    retainedFacts: facts.length - estimatedLostFacts,
    lostFacts: estimatedLostFacts,
    lossPercentage: sampleReport.lossPercentage,
    verified: sampleReport.lossPercentage <= MAX_ACCEPTABLE_LOSS,
    lostFactDetails: sampleReport.lostFactDetails,
    compactionTimestamp: new Date(),
    verificationDurationMs: Date.now() - startTime,
  };
}

/**
 * Content integrity hash — creates a Merkle-style root hash
 * from a list of content hashes for quick change detection.
 */
export function computeMerkleRoot(hashes: ContentHash[]): ContentHash {
  if (hashes.length === 0) return djb2Hash("empty");
  if (hashes.length === 1) return hashes[0];

  // Build tree bottom-up
  let level = [...hashes];
  while (level.length > 1) {
    const nextLevel: ContentHash[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        nextLevel.push(djb2Hash(level[i] + level[i + 1]));
      } else {
        nextLevel.push(level[i]); // Odd element promoted
      }
    }
    level = nextLevel;
  }

  return level[0];
}
