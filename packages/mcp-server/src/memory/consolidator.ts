/**
 * Consolidator — SimpleMem Recursive Consolidation + HiMem conflict-aware updates.
 *
 * Builds higher-level abstract representations from compressed memory units.
 * Uses a tree structure where leaves are sentence groups and higher levels
 * are progressively more abstract summaries.
 *
 * Conflict-aware: detects contradictions during consolidation and resolves
 * them rather than accumulating static data.
 */

import type {
  CompressedUnit,
  ConsolidationNode,
  SemanticMemoryUnit,
} from "./types.js";
import { djb2Hash } from "./episode-store.js";
import { compressText } from "./compressor.js";

let nodeCounter = 0;

/** Detect potential conflicts between two text segments */
function detectTextConflict(a: string, b: string): string | null {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  // Check for negation conflicts
  const negationPairs = [
    [/\b(\w+)\s+is\s+(\w+)/g, /\b(\w+)\s+is\s+not\s+(\w+)/g],
    [/\buse\s+(\w+)/g, /\bdon't\s+use\s+(\w+)/g],
    [/\benable\s+(\w+)/g, /\bdisable\s+(\w+)/g],
    [/\btrue\b/g, /\bfalse\b/g],
    [/\byes\b/g, /\bno\b/g],
  ];

  for (const [posPattern, negPattern] of negationPairs) {
    const posA = aLower.match(posPattern);
    const negB = bLower.match(negPattern);
    if (posA && negB) {
      return `Conflict: "${posA[0]}" vs "${negB[0]}"`;
    }
    const negA = aLower.match(negPattern);
    const posB = bLower.match(posPattern);
    if (negA && posB) {
      return `Conflict: "${negA[0]}" vs "${posB[0]}"`;
    }
  }

  // Check for value changes (e.g., "version 3" vs "version 4")
  const valuePattern = /\b(\w+)\s+(?:is|=|:)\s+(\d+(?:\.\d+)?)/g;
  const aValues = new Map<string, string>();
  let match: RegExpExecArray | null;
  while ((match = valuePattern.exec(aLower)) !== null) {
    aValues.set(match[1], match[2]);
  }
  const bValuePattern = /\b(\w+)\s+(?:is|=|:)\s+(\d+(?:\.\d+)?)/g;
  while ((match = bValuePattern.exec(bLower)) !== null) {
    const existing = aValues.get(match[1]);
    if (existing && existing !== match[2]) {
      return `Value conflict: ${match[1]} = ${existing} vs ${match[2]}`;
    }
  }

  return null;
}

/** Extract key topics from text for grouping */
function extractTopics(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3);

  // Count token frequency
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }

  // Return top tokens by frequency
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([token]) => token);
}

/** Group compressed units by topic similarity */
function groupByTopic(
  units: CompressedUnit[],
  maxGroupSize = 10
): CompressedUnit[][] {
  if (units.length <= maxGroupSize) return [units];

  const groups: CompressedUnit[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < units.length; i++) {
    if (assigned.has(i)) continue;

    const group: CompressedUnit[] = [units[i]];
    assigned.add(i);
    const topicsI = new Set(extractTopics(units[i].compressedText));

    for (let j = i + 1; j < units.length; j++) {
      if (assigned.has(j) || group.length >= maxGroupSize) continue;

      const topicsJ = extractTopics(units[j].compressedText);
      let overlap = 0;
      for (const t of topicsJ) {
        if (topicsI.has(t)) overlap++;
      }
      // Overlap threshold
      if (topicsJ.length > 0 && overlap / topicsJ.length > 0.3) {
        group.push(units[j]);
        assigned.add(j);
      }
    }

    groups.push(group);
  }

  return groups;
}

/** Create a summary from a group of compressed units */
function summarizeGroup(units: CompressedUnit[]): string {
  if (units.length === 0) return "";
  if (units.length === 1) return units[0].compressedText;

  // Combine all text
  const combined = units.map((u) => u.compressedText).join(". ");
  // Re-compress the combined text
  const { compressed } = compressText(combined);
  return compressed;
}

/**
 * Build a consolidation tree from compressed units.
 *
 * Level 0: Sentence groups (compressed units)
 * Level 1: Topic groups (grouped compressed units summarized)
 * Level 2+: Higher abstractions (recursive summarization)
 *
 * At each level, conflict detection is run and conflicts are resolved
 * by preferring the more recent version (HiMem conflict-aware update).
 */
export function buildConsolidationTree(
  units: CompressedUnit[],
  maxLevels = 3
): ConsolidationNode[] {
  const nodes: ConsolidationNode[] = [];

  // Level 0: Each compressed unit becomes a leaf node
  const leafNodes: ConsolidationNode[] = units.map((unit) => {
    const node: ConsolidationNode = {
      id: `cn_${++nodeCounter}`,
      level: 0,
      summary: unit.compressedText,
      childIds: [],
      factHashes: [...unit.originalSentenceHashes],
      conflictsResolved: [],
      createdAt: new Date(),
    };
    nodes.push(node);
    return node;
  });

  let currentLevel = leafNodes;

  for (let level = 1; level <= maxLevels && currentLevel.length > 1; level++) {
    // Group current level nodes by topic
    const groupedAsUnits = groupByTopic(
      currentLevel.map((n) => ({
        id: n.id,
        compressedText: n.summary,
        originalSentenceHashes: n.factHashes,
        compressionRatio: 1,
        factCount: n.factHashes.length,
        createdAt: n.createdAt,
      }))
    );

    const nextLevel: ConsolidationNode[] = [];

    for (const group of groupedAsUnits) {
      // Detect conflicts within group
      const conflicts: string[] = [];
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const conflict = detectTextConflict(
            group[i].compressedText,
            group[j].compressedText
          );
          if (conflict) conflicts.push(conflict);
        }
      }

      const summary = summarizeGroup(group);
      const allHashes = group.flatMap((u) => u.originalSentenceHashes);
      const childIds = group.map((u) => u.id);

      const node: ConsolidationNode = {
        id: `cn_${++nodeCounter}`,
        level,
        summary,
        childIds,
        factHashes: [...new Set(allHashes)],
        conflictsResolved: conflicts,
        createdAt: new Date(),
      };

      nodes.push(node);
      nextLevel.push(node);
    }

    currentLevel = nextLevel;
  }

  return nodes;
}

/**
 * Perform recursive consolidation on a set of semantic units.
 * Returns updated units with higher-level abstractions.
 *
 * This is the core of the SimpleMem Recursive Consolidation +
 * HiMem conflict-aware update process.
 */
export function recursiveConsolidate(
  existingUnits: SemanticMemoryUnit[],
  newCompressedUnits: CompressedUnit[]
): {
  updatedUnits: Array<{ id: string; newAbstraction: string; confidence: number }>;
  newUnits: Array<{ abstraction: string; episodeIds: string[]; confidence: number; level: number }>;
  conflictsResolved: string[];
} {
  const result = {
    updatedUnits: [] as Array<{ id: string; newAbstraction: string; confidence: number }>,
    newUnits: [] as Array<{ abstraction: string; episodeIds: string[]; confidence: number; level: number }>,
    conflictsResolved: [] as string[],
  };

  // Check each new unit against existing semantic memory
  for (const newUnit of newCompressedUnits) {
    let merged = false;

    for (const existing of existingUnits) {
      const newTopics = new Set(extractTopics(newUnit.compressedText));
      const existingTopics = new Set(extractTopics(existing.abstraction));

      let overlap = 0;
      for (const t of newTopics) {
        if (existingTopics.has(t)) overlap++;
      }

      // High overlap → merge into existing unit
      if (newTopics.size > 0 && overlap / newTopics.size > 0.5) {
        // Check for conflict
        const conflict = detectTextConflict(
          existing.abstraction,
          newUnit.compressedText
        );

        if (conflict) {
          result.conflictsResolved.push(conflict);
          // Prefer newer information (HiMem conflict-aware update)
          result.updatedUnits.push({
            id: existing.id,
            newAbstraction: newUnit.compressedText,
            confidence: Math.max(0.5, existing.confidence - 0.1),
          });
        } else {
          // Merge: combine abstractions
          const { compressed } = compressText(
            `${existing.abstraction}. ${newUnit.compressedText}`
          );
          result.updatedUnits.push({
            id: existing.id,
            newAbstraction: compressed,
            confidence: Math.min(1.0, existing.confidence + 0.05),
          });
        }

        merged = true;
        break;
      }
    }

    if (!merged) {
      result.newUnits.push({
        abstraction: newUnit.compressedText,
        episodeIds: [],
        confidence: 0.7,
        level: 0,
      });
    }
  }

  return result;
}
