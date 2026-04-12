import { access, mkdir, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import type { SiloManager } from "../state/silo.js";
import type { ToolCatalog } from "../registry/catalog.js";
import type { GroundTruthEntry } from "../state/types.js";
import type { UnifiedMemoryManager } from "../memory/manager.js";
import type { Episode } from "../memory/types.js";
import { runUnifiedLoop } from "../engine/loop.js";
import { recordLoopCall } from "../engine/loop-freshness.js";
import { runInftyThink } from "../engine/inftythink.js";
import { runCoconut } from "../engine/coconut.js";
import { runExtraCoT } from "../engine/extracot.js";
import { runMindEvolution } from "../engine/mindevolution.js";
import { runKAGThinker } from "../engine/kagthinker.js";
import { summarizeHistory } from "../engine/validator.js";
import { extractAtomicFacts } from "../memory/episode-store.js";

/**
 * research_pipeline — Structured orchestration for Context-First research workflows.
 *
 * Problem: LLMs optimize for efficiency and skip the memory, verification,
 * and context-health steps that make research durable.
 *
 * Solution: Bundle the relevant Context-First subsystems into a 5-phase flow.
 * Each phase auto-runs the appropriate internal layers:
 *
 *   init      → context_loop (17 stages) + memory_recall + state check + discover_tools
 *   gather    → memory_store + knowledge_graph + context_loop health check
 *   analyze   → inftythink + coconut + kagthinker + mindevolution + extracot + memory + context_loop
 *   verify    → context_loop (all 17 health+truth stages with strict thresholds) + memory inspect
 *   finalize  → memory_store + compact + graph query + curate + inspect + context_loop
 *
 * This guarantees the internal Context-First workflow executes in order.
 * It does NOT fetch external sources by itself, so depth still depends on the
 * evidence passed through gather.
 */

export const researchPipelineInputSchema = z.object({
  sessionId: z.string().default("default"),
  phase: z.enum(["init", "gather", "analyze", "verify", "finalize"]).describe(
    "Pipeline phase. Call in order: init → gather (repeatable) → analyze → verify → finalize. " +
    "Each phase auto-chains the appropriate layer tools internally. Analyze is blocked until gathered evidence clears the weak-evidence gate."
  ),
  content: z.string().describe(
    "Phase-specific content: " +
    "init=task description, " +
    "gather=WRITE a deeply researched section based on your LATEST web search. " +
    "CRITICAL WORKFLOW: Do ONE web search, then IMMEDIATELY call gather. Repeat. " +
    "Do NOT do multiple searches before calling gather — content gets lost to compaction. " +
    "You are a research AUTHOR: use the search result as input to write a comprehensive section " +
    "with specific facts, data, analysis, relationships, and expert commentary. " +
    "Each gather call writes one file to disk immediately — this is the pipeline's core output. " +
    "analyze=problem/question to reason about (runs on accumulated gather files), " +
    "verify=draft output to verify (runs on accumulated files), " +
    "finalize=final summary to persist (synthesizes all files)"
  ),
  outputDir: z.string().optional().describe(
    "RECOMMENDED. When provided, the pipeline autonomously writes enriched research files to this directory during gather, analyze, and finalize phases. " +
    "This eliminates the need for the LLM to write files manually — the pipeline writes them itself, like how export_research_files works but incrementally per-phase. " +
    "Files survive context compaction because they are on disk, not just in memory. Prefer an absolute path."
  ),
  baseFileName: z.string().default("research").describe(
    "Base filename prefix for autonomously written files when outputDir is set. " +
    "Produces files like research.batch-001.topic-slug.md, research.analysis-001.md, research.synthesis.md"
  ),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    turn: z.number(),
  })).default([]).describe("Recent conversation messages for context_loop"),
  claim: z.string().optional().describe("Specific claim to fact-check (verify phase)"),
  metadata: z.record(z.unknown()).optional().describe(
    "Optional metadata for memory storage and finalize/export controls. Supported conventions include sourceTools during gather, maxChunkChars during finalize, and exportChunkIndex during finalize chunk retrieval."
  ),
});

export const exportResearchFilesInputSchema = z.object({
  sessionId: z.string().default("default"),
  outputDir: z.string().describe(
    "Directory where research export files will be written. Prefer an absolute path so the caller knows exactly where the artifacts landed."
  ),
  baseFileName: z.string().default("research_export").describe(
    "Base filename prefix for all written research artifacts. The helper sanitizes it into a filesystem-safe ASCII stem."
  ),
  exportVerifiedReport: z.boolean().default(true).describe(
    "When true, automatically expands and writes the full verified report by looping all finalize chunks internally. This path remains blocked until verify has passed."
  ),
  exportRawEvidence: z.boolean().default(false).describe(
    "When true, writes every gathered research batch as raw evidence files even if verify has not passed, separating evidence capture from narrative approval."
  ),
  maxChunkChars: z.number().int().positive().max(500_000).default(60_000).describe(
    "Maximum size for each written markdown file. Large batches are automatically split across multiple files when needed."
  ),
  overwrite: z.boolean().default(false).describe(
    "Whether existing export files may be overwritten. Defaults to false so exports do not silently clobber prior artifacts."
  ),
  finalSummary: z.string().optional().describe(
    "Optional final summary override for verified report export. If omitted, the helper uses the stored pipeline summary or existing analysis and verification outputs."
  ),
});

export type ResearchPipelineInput = z.infer<typeof researchPipelineInputSchema>;
export type ExportResearchFilesInput = z.infer<typeof exportResearchFilesInputSchema>;

interface PhaseResult {
  phase: string;
  layersExecuted: string[];
  results: Record<string, unknown>;
  nextPhase: string | null;
  directive: string;
}

interface PhaseFileWriteResult {
  filePath: string;
  fileName: string;
  charCount: number;
  lineCount: number;
}

interface ResearchQualityProfile {
  wordCount: number;
  sectionHeadings: number;
  urls: number;
  citationSignals: number;
  sourceMentions: number;
  numericClaims: number;
  contrastMarkers: number;
  evidenceScore: number;
  quality: "weak" | "developing" | "strong";
  recommendation: string;
}

interface PipelineCoverageReport {
  totalUnderlyingToolEquivalents: number;
  allUnderlyingToolEquivalentsCovered: boolean;
  categories: Record<string, string[]>;
  note: string;
}

interface ExportChunk {
  chunkIndex: number;
  title: string;
  kind: "gather_batch" | "synthesis" | "raw_evidence";
  content: string;
  charCount: number;
  batchIndices: number[];
  sourceEpisodeIds: string[];
}

interface ExportManifest {
  preserveBatchBoundaries: boolean;
  totalGatherBatches: number;
  totalChunks: number;
  totalChars: number;
  retrievalHint: string;
  chunks: Array<{
    chunkIndex: number;
    title: string;
    kind: "gather_batch" | "synthesis" | "raw_evidence";
    charCount: number;
    batchIndices: number[];
  }>;
}

interface PlannedExportFile {
  fileName: string;
  filePath: string;
  chunkIndex: number;
  title: string;
  content: string;
  charCount: number;
  batchIndices: number[];
}

interface WrittenBundleSummary {
  manifestPath: string;
  fileCount: number;
  totalChars: number;
  files: string[];
}

// Evidence gate disabled — LLM decides when to move to analyze.
const MIN_ANALYZE_EVIDENCE_SCORE = 0;
const DEFAULT_EXPORT_CHUNK_CHARS = 60_000;

// Verify soft-pass: after N attempts, allow non-critical actions to pass
const MAX_VERIFY_ATTEMPTS_SOFT = 2;
const VERIFY_SOFT_PASS_ACTIONS: string[] = ["deepen", "clarify", "verify", "reset"];
const VERIFY_SOFT_PASS_HEALTH_THRESHOLD = 0.4;

// Gather content length warning thresholds — intentionally set to 0 so the
// pipeline never nags about "thin" content.  The LLM decides how much to write.
const MIN_GATHER_CONTENT_CHARS = 0;
const MIN_GATHER_CONTENT_LINES = 0;

// Only split a single gather call into multiple files when content is genuinely
// large.  For typical 5–15K-char gathers, one cohesive file preserves structure
// better than 10+ heading-fragmented files averaging 500–2000 bytes each.
const MAX_CHARS_BEFORE_SPLIT = 30_000;
const SPLIT_MIN_SECTION_CHARS = 5_000;

const PIPELINE_STATE_KEYS = [
  "research_task",
  "pipeline_phase",
  "pipeline_gather_count",
  "pipeline_evidence_score_total",
  "pipeline_last_gather_quality",
  "pipeline_verify_passed",
  "pipeline_last_verify_action",
  "pipeline_reasoning_methods",
  "pipeline_batch_manifest",
  "pipeline_export_manifest",
  "pipeline_last_final_summary",
  "pipeline_sandbox_problem",
  "pipeline_sandbox_analysis_summary",
  "pipeline_verify_attempt_count",
] as const;

const PIPELINE_TOOL_COVERAGE = {
  contextHealth: [
    "recap_conversation",
    "detect_conflicts",
    "check_ambiguity",
    "verify_execution",
    "entropy_monitor",
    "abstention_check",
    "check_grounding",
    "detect_drift",
    "check_depth",
  ],
  state: ["get_state", "set_state", "clear_state", "get_history_summary"],
  sandbox: ["discover_tools", "quarantine_context", "merge_quarantine"],
  memory: [
    "memory_store",
    "memory_recall",
    "memory_compact",
    "memory_graph",
    "memory_inspect",
    "memory_curate",
  ],
  reasoning: [
    "inftythink_reason",
    "coconut_reason",
    "extracot_compress",
    "mindevolution_solve",
    "kagthinker_solve",
  ],
  truthfulness: [
    "probe_internal_state",
    "detect_truth_direction",
    "ncb_check",
    "check_logical_consistency",
    "verify_first",
    "ioe_self_correct",
    "self_critique",
  ],
} as const;

function readStateValue<T>(
  store: SessionStore,
  sessionId: string,
  key: string
): T | undefined {
  const entry = store.getState(sessionId, [key])[key];
  return entry ? entry.value as T : undefined;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function roundTo(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function analyzeResearchQuality(findings: string): ResearchQualityProfile {
  const trimmed = findings.trim();
  const wordCount = trimmed.length > 0 ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const sectionHeadings = countMatches(findings, /^(?:#{1,6}\s+|\d+\.\s+)/gm);
  const urls = countMatches(findings, /https?:\/\/|www\./gi);
  const citationSignals = countMatches(
    findings,
    /\b(?:according to|study|studies|paper|research|backtest|dataset|sample|report|survey|journal|filing|evidence)\b/gi
  );
  const sourceMentions = countMatches(
    findings,
    /\b(?:Bloomberg|Reuters|SEC|NYSE|NASDAQ|CME|FRED|Federal Reserve|S&P|Dow Jones|MSCI|OECD|BIS|IMF|World Bank)\b/gi
  );
  const numericClaims = countMatches(findings, /\b\d+(?:\.\d+)?%?\b/g);
  const contrastMarkers = countMatches(
    findings,
    /\b(?:however|but|although|yet|whereas|while|in contrast|on the other hand)\b/gi
  );

  const evidenceScore = Math.min(
    1,
    roundTo(
      Math.min(urls, 3) * 0.35 +
      Math.min(citationSignals, 6) * 0.12 +
      Math.min(sourceMentions, 6) * 0.1 +
      Math.min(numericClaims, 14) * 0.03 +
      Math.min(sectionHeadings, 10) * 0.02 +
      Math.min(contrastMarkers, 6) * 0.03 +
      (wordCount >= 800 ? 0.12 : wordCount >= 400 ? 0.06 : 0),
      3
    )
  );

  let quality: ResearchQualityProfile["quality"] = "weak";
  if (evidenceScore >= 0.9) {
    quality = "strong";
  } else if (evidenceScore >= 0.45) {
    quality = "developing";
  }

  const recommendation = quality === "strong"
    ? "Evidence profile is strong enough to support analysis. Keep verifying claims before finalizing."
    : quality === "developing"
      ? "Evidence profile is partial. One more sourced batch or more empirical detail will materially improve downstream analysis."
      : "Evidence profile is weak. Gather sourced findings, concrete numbers, and counterarguments before relying on the analysis phase.";

  return {
    wordCount,
    sectionHeadings,
    urls,
    citationSignals,
    sourceMentions,
    numericClaims,
    contrastMarkers,
    evidenceScore,
    quality,
    recommendation,
  };
}

function createGroundTruthEntry(value: unknown, source: string): GroundTruthEntry {
  return {
    value,
    lockedAt: new Date(),
    source,
  };
}

function extractBatchLabel(findings: string, batchIndex: number): string {
  const lines = findings.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const heading = lines.find((line) =>
    /^(?:#{1,6}\s+|\*\*.+\*\*$|[A-Z][A-Za-z0-9\s:&/\-]{8,})/.test(line)
  );

  if (!heading) {
    return `Research Batch ${batchIndex}`;
  }

  return heading
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .slice(0, 120);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function getEpisodeType(episode: Episode): string | undefined {
  return typeof episode.metadata.type === "string" ? episode.metadata.type : undefined;
}

function getEpisodesByType(
  memory: UnifiedMemoryManager,
  sessionId: string,
  type: string
): Episode[] {
  return memory.episodes
    .getSessionEpisodes(sessionId)
    .filter((episode) => getEpisodeType(episode) === type)
    .sort((left, right) => {
      const leftBatch = typeof left.metadata.batchIndex === "number" ? left.metadata.batchIndex : left.turn;
      const rightBatch = typeof right.metadata.batchIndex === "number" ? right.metadata.batchIndex : right.turn;
      return leftBatch - rightBatch;
    });
}

/**
 * Enrich a single episode's content with extracted facts, knowledge graph
 * connections, and cross-batch entity references so that exported evidence
 * files contain substantially more detail than just rawContent.
 */
function enrichEpisodeContent(
  memory: UnifiedMemoryManager,
  sessionId: string,
  episode: Episode,
  batchIndex: number
): string {
  const sections: string[] = [episode.rawContent];

  // 1. Atomic facts — sentence-level declarations, associations, triples
  const facts = extractAtomicFacts(episode.rawContent, episode.id);
  const declarations = facts.filter((f) => f.type === "declaration");
  const associations = facts.filter((f) => f.type === "association");
  const triples = facts.filter((f) => f.type === "triple");

  if (declarations.length > 0) {
    sections.push(
      `\n\n---\n\n## Extracted Declarations (${declarations.length})\n\n` +
        declarations.map((f) => `- ${f.text}`).join("\n")
    );
  }
  if (associations.length > 0) {
    sections.push(
      `\n\n### Key Associations (${associations.length})\n\n` +
        associations.map((f) => `- ${f.text}`).join("\n")
    );
  }
  if (triples.length > 0) {
    sections.push(
      `\n\n### Structured Triples (${triples.length})\n\n` +
        triples.map((f) => `- ${f.text}`).join("\n")
    );
  }

  // 2. Knowledge graph edges associated with this episode
  try {
    const allEdges = memory.graph.getEdges(sessionId);
    const episodeEdges = allEdges.filter((e) => e.episodeIds.includes(episode.id));
    if (episodeEdges.length > 0) {
      const allNodes = memory.graph.getNodes(sessionId);
      const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

      sections.push(
        `\n\n## Knowledge Graph Connections (${episodeEdges.length} edges)\n\n` +
          episodeEdges
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 60)
            .map((e) => {
              const src = nodeMap.get(e.source);
              const tgt = nodeMap.get(e.target);
              return `- ${src?.label ?? e.source} --[${e.relation}]--> ${tgt?.label ?? e.target} (weight: ${e.weight.toFixed(2)})`;
            })
            .join("\n")
      );

      // Top entities by PageRank linked to this episode
      const entityIds = new Set(episodeEdges.flatMap((e) => [e.source, e.target]));
      const episodeEntities = allNodes
        .filter((n) => entityIds.has(n.id))
        .sort((a, b) => b.pageRank - a.pageRank);
      if (episodeEntities.length > 0) {
        sections.push(
          `\n\n### Key Entities (${episodeEntities.length})\n\n` +
            episodeEntities
              .slice(0, 40)
              .map(
                (n) =>
                  `- **${n.label}** (${n.type}, mentions: ${n.mentions}, pageRank: ${n.pageRank.toFixed(4)})`
              )
              .join("\n")
        );
      }

      // Cross-batch references: edges that connect this episode to other episodes
      const otherBatchEdges = episodeEdges.filter(
        (e) => e.episodeIds.some((id) => id !== episode.id)
      );
      if (otherBatchEdges.length > 0) {
        const crossBatchNodes = new Set<string>();
        for (const e of otherBatchEdges) {
          const src = nodeMap.get(e.source);
          const tgt = nodeMap.get(e.target);
          if (src) crossBatchNodes.add(src.label);
          if (tgt) crossBatchNodes.add(tgt.label);
        }
        sections.push(
          `\n\n### Cross-Batch References\n\nConcepts shared with other batches: ${[...crossBatchNodes].slice(0, 30).join(", ")}`
        );
      }
    }
  } catch {
    // Graph enrichment is best-effort; don't block export on graph errors
  }

  // 3. Semantic memory abstractions that reference this episode
  try {
    const semanticUnits = memory.semantic.getAll(sessionId);
    const relatedUnits = semanticUnits.filter((u) =>
      u.supportingEpisodeIds.includes(episode.id)
    );
    if (relatedUnits.length > 0) {
      sections.push(
        `\n\n## Semantic Abstractions (${relatedUnits.length})\n\n` +
          relatedUnits
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 20)
            .map(
              (u) =>
                `- ${u.abstraction} (confidence: ${u.confidence.toFixed(2)}, level: ${u.consolidationLevel})`
            )
            .join("\n")
      );
    }
  } catch {
    // Semantic enrichment is best-effort
  }

  return sections.join("");
}

function splitChunkContent(content: string, maxChars: number): string[] {
  if (content.length <= maxChars) {
    return [content];
  }

  const paragraphs = content.split(/\n\n+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current.length > 0 ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars && current.length > 0) {
      chunks.push(current);
      current = paragraph;
      continue;
    }

    current = candidate;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function buildCoverageReport(): PipelineCoverageReport {
  const categories = Object.fromEntries(
    Object.entries(PIPELINE_TOOL_COVERAGE).map(([category, tools]) => [category, [...tools]])
  );
  const totalUnderlyingToolEquivalents = Object.values(PIPELINE_TOOL_COVERAGE)
    .reduce((count, tools) => count + tools.length, 0);

  return {
    totalUnderlyingToolEquivalents,
    allUnderlyingToolEquivalentsCovered: totalUnderlyingToolEquivalents === 34,
    categories,
    note: "research_pipeline runs the public tool-equivalents internally. context_loop provides the context-health, truthfulness, and discover_tools equivalents as stages rather than separate public-tool calls.",
  };
}

function buildExportArtifacts(
  store: SessionStore,
  memory: UnifiedMemoryManager,
  sessionId: string,
  finalSummary: string,
  maxChunkChars: number
): {
  chunks: ExportChunk[];
  manifest: ExportManifest;
  historySummary: ReturnType<typeof summarizeHistory>;
} {
  const gatherEpisodes = getEpisodesByType(memory, sessionId, "research_finding");
  const analysisEpisodes = getEpisodesByType(memory, sessionId, "analysis");
  const verificationEpisodes = getEpisodesByType(memory, sessionId, "verification");
  const historySummary = summarizeHistory(store.getHistory(sessionId), 700);
  const chunks: ExportChunk[] = [];

  for (const [index, episode] of gatherEpisodes.entries()) {
    const batchIndex = typeof episode.metadata.batchIndex === "number"
      ? episode.metadata.batchIndex
      : index + 1;
    const batchLabel = typeof episode.metadata.batchLabel === "string"
      ? episode.metadata.batchLabel
      : extractBatchLabel(episode.rawContent, batchIndex);
    const sourceTools = normalizeStringArray(episode.metadata.sourceTools);
    const batchHeader = [
      `# Batch ${batchIndex}: ${batchLabel}`,
      sourceTools.length > 0 ? `Source tools: ${sourceTools.join(", ")}` : undefined,
      episode.rawContent,
    ].filter(Boolean).join("\n\n");

    const splitBatches = splitChunkContent(batchHeader, maxChunkChars);
    splitBatches.forEach((content, splitIndex) => {
      chunks.push({
        chunkIndex: chunks.length + 1,
        title: splitBatches.length > 1
          ? `Batch ${batchIndex}: ${batchLabel} (${splitIndex + 1}/${splitBatches.length})`
          : `Batch ${batchIndex}: ${batchLabel}`,
        kind: "gather_batch",
        content,
        charCount: content.length,
        batchIndices: [batchIndex],
        sourceEpisodeIds: [episode.id],
      });
    });
  }

  const synthesisParts: string[] = [];
  // Note: Conversation History and Analysis Outputs are intentionally omitted.
  // - History summary is internal pipeline metadata, not useful to end users.
  // - Analysis outputs contain raw reasoning engine traces stored in memory before
  //   cleanEngineOutput. The analysis file is written separately with cleaned output.

  if (verificationEpisodes.length > 0) {
    synthesisParts.push(
      [
        "# Verification Outputs",
        ...verificationEpisodes.map((episode, verificationIndex) => `## Verification ${verificationIndex + 1}\n\n${episode.rawContent}`),
      ].join("\n\n")
    );
  }

  if (finalSummary.trim().length > 0) {
    synthesisParts.push(["# Final Summary", finalSummary.trim()].join("\n\n"));
  }

  if (synthesisParts.length > 0) {
    const synthesisContent = synthesisParts.join("\n\n");
    const synthesisChunks = splitChunkContent(synthesisContent, maxChunkChars);
    const sourceEpisodeIds = [...analysisEpisodes, ...verificationEpisodes].map((episode) => episode.id);
    const batchIndices = gatherEpisodes.map((episode, index) =>
      typeof episode.metadata.batchIndex === "number" ? episode.metadata.batchIndex : index + 1
    );

    synthesisChunks.forEach((content, splitIndex) => {
      chunks.push({
        chunkIndex: chunks.length + 1,
        title: synthesisChunks.length > 1
          ? `Synthesis and Verification (${splitIndex + 1}/${synthesisChunks.length})`
          : "Synthesis and Verification",
        kind: "synthesis",
        content,
        charCount: content.length,
        batchIndices,
        sourceEpisodeIds,
      });
    });
  }

  const manifest: ExportManifest = {
    preserveBatchBoundaries: true,
    totalGatherBatches: gatherEpisodes.length,
    totalChunks: chunks.length,
    totalChars: chunks.reduce((sum, chunk) => sum + chunk.charCount, 0),
    retrievalHint: "Call research_pipeline phase='finalize' again with metadata.exportChunkIndex = N to retrieve a specific chunk's full content for writing.",
    chunks: chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      title: chunk.title,
      kind: chunk.kind,
      charCount: chunk.charCount,
      batchIndices: chunk.batchIndices,
    })),
  };

  return {
    chunks,
    manifest,
    historySummary,
  };
}

function buildRawEvidenceArtifacts(
  memory: UnifiedMemoryManager,
  sessionId: string,
  maxChunkChars: number
): {
  chunks: ExportChunk[];
  manifest: ExportManifest;
} {
  const gatherEpisodes = getEpisodesByType(memory, sessionId, "research_finding");
  const chunks: ExportChunk[] = [];

  for (const [index, episode] of gatherEpisodes.entries()) {
    const batchIndex = typeof episode.metadata.batchIndex === "number"
      ? episode.metadata.batchIndex
      : index + 1;
    const batchLabel = typeof episode.metadata.batchLabel === "string"
      ? episode.metadata.batchLabel
      : extractBatchLabel(episode.rawContent, batchIndex);
    const sourceTools = normalizeStringArray(episode.metadata.sourceTools);
    // Evidence file: clean header without internal scoring metrics
    const evidenceFileContent = [
      `# Raw Evidence Batch ${batchIndex}: ${batchLabel}`,
      sourceTools.length > 0 ? `Source: ${sourceTools.join(", ")}` : undefined,
      episode.rawContent,
    ].filter(Boolean).join("\n\n");

    const splitEvidence = splitChunkContent(evidenceFileContent, maxChunkChars);
    splitEvidence.forEach((content, splitIndex) => {
      chunks.push({
        chunkIndex: chunks.length + 1,
        title: splitEvidence.length > 1
          ? `Raw Evidence Batch ${batchIndex}: ${batchLabel} (${splitIndex + 1}/${splitEvidence.length})`
          : `Raw Evidence Batch ${batchIndex}: ${batchLabel}`,
        kind: "raw_evidence",
        content,
        charCount: content.length,
        batchIndices: [batchIndex],
        sourceEpisodeIds: [episode.id],
      });
    });
  }

  return {
    chunks,
    manifest: {
      preserveBatchBoundaries: true,
      totalGatherBatches: gatherEpisodes.length,
      totalChunks: chunks.length,
      totalChars: chunks.reduce((sum, chunk) => sum + chunk.charCount, 0),
      retrievalHint: "Raw evidence export writes gathered batches directly and does not require verify to pass.",
      chunks: chunks.map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        title: chunk.title,
        kind: chunk.kind,
        charCount: chunk.charCount,
        batchIndices: chunk.batchIndices,
      })),
    },
  };
}

function sanitizeFileStem(input: string): string {
  const sanitized = input
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");

  return sanitized.length > 0 ? sanitized : "research_export";
}

function padNumber(value: number, width = 3): string {
  return String(value).padStart(width, "0");
}

function slugify(text: string, maxLength = 60): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, maxLength)
    .replace(/-$/, "");
}

/**
 * Strip engine-specific formatting markers from finalAnswer text,
 * producing clean readable content for end-user research files.
 * Preserves the actual analysis content while removing trace formatting.
 */
function cleanEngineOutput(engineName: string, text: string): string {
  if (!text || !text.trim()) return "";

  let cleaned = text;

  switch (engineName) {
    case "inftythink":
      // Remove framing lines
      cleaned = cleaned.replace(/^After \d+ iterative reasoning segment[s]?:\s*\n*/m, "");
      cleaned = cleaned.replace(/^Conclusion: The iterative analysis of .*bounded segments with sawtooth summarization\.\s*\n*/m, "");
      cleaned = cleaned.replace(/^Final synthesis: /m, "");
      // Remove [Depth N] prefixes but keep content
      cleaned = cleaned.replace(/^\[Depth \d+\]\s*/gm, "");
      // Remove segment markers from reasoning
      cleaned = cleaned.replace(/^\[Segment \d+: [^\]]+\]\s*\n/gm, "");
      cleaned = cleaned.replace(/^Focus: .+\(detected from problem text\)\s*\n/gm, "");
      cleaned = cleaned.replace(/^Evidence: /gm, "");
      cleaned = cleaned.replace(/^Carry-forward: .*\n/gm, "");
      cleaned = cleaned.replace(/^Instruction: Analyze .*\n/gm, "");
      cleaned = cleaned.replace(/^Prior context: .*\n/gm, "");
      break;

    case "coconut":
      // Remove framing
      cleaned = cleaned.replace(/^Multi-Perspective Analysis \(\d+ dimensions?\):\s*\n*/m, "");
      cleaned = cleaned.replace(/^Strongest dimension: .*\n/m, "");
      cleaned = cleaned.replace(/^Weakest dimension: .*\n/m, "");
      cleaned = cleaned.replace(/^Overall analysis confidence: [\d.]+%\s*$/m, "");
      // Remove step headers with progress bars but keep content
      cleaned = cleaned.replace(/^\s*Step \d+ \[[^\]]+\] \[[\s\u2588\u2591]+\] [\d.]+%\s*\n/gm, "");
      // Remove score= prefixes but keep the finding text
      cleaned = cleaned.replace(/^\s*score=[\d.]+:\s*/gm, "");
      break;

    case "kagthinker":
      // Remove framing
      cleaned = cleaned.replace(/^KAG-Thinker Structured Analysis \(\d+ sub-problems?\):\s*\n*/m, "");
      cleaned = cleaned.replace(/^All \d+ sub-problems? resolved successfully\.\s*\n/m, "");
      cleaned = cleaned.replace(/^\d+\/\d+ sub-problems? resolved\..+\n/m, "");
      cleaned = cleaned.replace(/^Problem: ".*" \u2014 analyzed through structured logical decomposition\.\s*$/m, "");
      // Remove depth headers
      cleaned = cleaned.replace(/^\s*Depth \d+:\s*\n/gm, "");
      // Remove status icons and logical form, keep result text
      cleaned = cleaned.replace(/^\s*[\u2713\u2717]\s*(?:ANALYZE|COMPARE|EVALUATE|EXTRACT_CONCEPTS|CLASSIFY|ENUMERATE_METHODS|EVALUATE_FEASIBILITY|SELECT_OPTIMAL|LIST_ALTERNATIVES|EVALUATE_CRITERIA|PROJECT_OUTCOMES|ASSESS_RISK)\([^)]*\)(?:\s*\(\d+%\))?\s*\n/gm, "");
      // Clean arrow prefixes and grounding notes
      cleaned = cleaned.replace(/^\s*\u2192 (?:Grounded against \d+ known fact\(s\)\. )?/gm, "");
      cleaned = cleaned.replace(/^\s*\u2192 From \d+ resolved dependenc(?:y|ies): .*\n/gm, "");
      break;

    case "extracot":
      // Remove framing
      cleaned = cleaned.replace(/^Extra-CoT Compressed Reasoning \(\d+ steps?\):\s*\n*/m, "");
      cleaned = cleaned.replace(/^Token savings: .*\n/m, "");
      cleaned = cleaned.replace(/^Problem: ".*" \u2014 reasoned with maximum density\.\s*$/m, "");
      // Remove step headers but keep content
      cleaned = cleaned.replace(/^\s*Step \d+ \[\d+(?:\.\d+)?% reduced, fidelity: \d+(?:\.\d+)?%\]:\s*/gm, "");
      break;

    case "mindevolution":
      // MindEvolution mixes Coconut/InftyThink formatting — apply both cleanups
      cleaned = cleaned.replace(/^Multi-Perspective Analysis \(\d+ dimensions?\):\s*\n*/m, "");
      cleaned = cleaned.replace(/^Strongest dimension: .*\n/m, "");
      cleaned = cleaned.replace(/^Weakest dimension: .*\n/m, "");
      cleaned = cleaned.replace(/^Overall analysis confidence: [\d.]+%?\s*$/m, "");
      cleaned = cleaned.replace(/^\s*Step \d+ \[[^\]]+\] \[[\s\u2588\u2591]+\] [\d.]+%?\s*\.?\s*$/gm, "");
      cleaned = cleaned.replace(/^\s*Step \d+ \[[^\]]+\] \[[^\]]+\] [\d.]+\.\s/gm, "");
      // Strip Coconut-style score= prefixes that leak into MindEvolution output
      cleaned = cleaned.replace(/^\s*score=[\d.]+:\s*/gm, "");
      // Also strip InftyThink-style carry-forward chains that leak in
      cleaned = cleaned.replace(/^\[Depth \d+\]\s*/gm, "");
      cleaned = cleaned.replace(/^\[Segment \d+: [^\]]+\]\s*\n/gm, "");
      cleaned = cleaned.replace(/^Focus: .+\(detected from problem text\)\s*\n/gm, "");
      cleaned = cleaned.replace(/^Evidence: /gm, "");
      cleaned = cleaned.replace(/^Carry-forward: .*\n/gm, "");
      cleaned = cleaned.replace(/^Instruction: Analyze .*\n/gm, "");
      cleaned = cleaned.replace(/^Conclusion: The iterative analysis of .*\n/gm, "");
      cleaned = cleaned.replace(/^Final synthesis: /m, "");
      break;
  }

  // General cleanup
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n"); // Collapse excessive blank lines
  return cleaned.trim();
}

/**
 * Split gathered content into per-topic sections by markdown headings.
 * Each section becomes its own file during autonomous gather writing.
 * Small sections are merged with the next one to avoid tiny files.
 */
function splitGatherByHeadings(
  content: string,
  minSectionChars = 500
): Array<{ heading: string; slug: string; content: string }> {
  const lines = content.split("\n");
  const sections: Array<{ heading: string; startLine: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,3})\s+(.+)/);
    if (match) {
      sections.push({ heading: match[2].trim(), startLine: i });
    }
  }

  if (sections.length <= 1) {
    // No meaningful heading structure — return as single section
    const heading = sections[0]?.heading ?? "Research Content";
    return [{ heading, slug: slugify(heading), content: content.trim() }];
  }

  // Capture any preamble text before the first heading
  const preamble = sections[0].startLine > 0
    ? lines.slice(0, sections[0].startLine).join("\n").trim()
    : "";

  const rawSections: Array<{ heading: string; slug: string; content: string }> = [];

  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].startLine;
    const end = i + 1 < sections.length ? sections[i + 1].startLine : lines.length;
    let sectionContent = lines.slice(start, end).join("\n").trim();

    // Prepend preamble text to the first section so it is not lost
    if (i === 0 && preamble.length > 0) {
      sectionContent = preamble + "\n\n" + sectionContent;
    }

    rawSections.push({
      heading: sections[i].heading,
      slug: slugify(sections[i].heading),
      content: sectionContent,
    });
  }

  // Merge small sections into preceding section to avoid tiny files
  const merged: Array<{ heading: string; slug: string; content: string }> = [];
  for (const section of rawSections) {
    if (section.content.length < minSectionChars && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.content += "\n\n" + section.content;
    } else {
      merged.push({ ...section });
    }
  }

  // Forward-merge: if the first section is still too small, merge it into the second
  if (merged.length > 1 && merged[0].content.length < minSectionChars) {
    merged[1].content = merged[0].content + "\n\n" + merged[1].content;
    merged.shift();
  }

  return merged;
}

/**
 * Write a research phase file to disk autonomously.
 * This is the key architectural fix: the pipeline writes files itself during each phase,
 * eliminating dependency on the LLM to write files (which fails due to compaction and
 * output-token competition with tool calls).
 */
async function writePhaseFile(
  outputDir: string,
  fileName: string,
  content: string
): Promise<PhaseFileWriteResult> {
  await mkdir(outputDir, { recursive: true });
  const filePath = join(resolve(outputDir), fileName);
  await writeFile(filePath, content, { encoding: "utf8" });
  return {
    filePath,
    fileName,
    charCount: content.length,
    lineCount: content.split("\n").length,
  };
}

function planExportFiles(
  outputDir: string,
  baseFileName: string,
  artifactType: "verified_report" | "raw_evidence",
  chunks: ExportChunk[]
): PlannedExportFile[] {
  if (artifactType === "verified_report") {
    return chunks.map((chunk) => ({
      fileName: `${baseFileName}.report.part-${padNumber(chunk.chunkIndex)}.md`,
      filePath: join(outputDir, `${baseFileName}.report.part-${padNumber(chunk.chunkIndex)}.md`),
      chunkIndex: chunk.chunkIndex,
      title: chunk.title,
      content: chunk.content,
      charCount: chunk.charCount,
      batchIndices: chunk.batchIndices,
    }));
  }

  const totalPartsPerBatch = new Map<number, number>();
  for (const chunk of chunks) {
    const batchIndex = chunk.batchIndices[0] ?? chunk.chunkIndex;
    totalPartsPerBatch.set(batchIndex, (totalPartsPerBatch.get(batchIndex) ?? 0) + 1);
  }

  const writtenPerBatch = new Map<number, number>();
  return chunks.map((chunk) => {
    const batchIndex = chunk.batchIndices[0] ?? chunk.chunkIndex;
    const currentPart = (writtenPerBatch.get(batchIndex) ?? 0) + 1;
    writtenPerBatch.set(batchIndex, currentPart);
    const totalParts = totalPartsPerBatch.get(batchIndex) ?? 1;
    const suffix = totalParts > 1 ? `.part-${padNumber(currentPart, 2)}` : "";
    const fileName = `${baseFileName}.evidence.batch-${padNumber(batchIndex)}${suffix}.md`;

    return {
      fileName,
      filePath: join(outputDir, fileName),
      chunkIndex: chunk.chunkIndex,
      title: chunk.title,
      content: chunk.content,
      charCount: chunk.charCount,
      batchIndices: chunk.batchIndices,
    };
  });
}

async function ensurePathsWritable(paths: string[], overwrite: boolean): Promise<void> {
  if (overwrite) {
    return;
  }

  for (const filePath of paths) {
    try {
      await access(filePath);
      throw new Error(`Export target already exists: ${filePath}`);
    } catch (error) {
      const errorWithCode = error as { code?: string };
      if (errorWithCode?.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

async function writeExportBundle(
  outputDir: string,
  baseFileName: string,
  artifactType: "verified_report" | "raw_evidence",
  chunks: ExportChunk[],
  manifest: ExportManifest,
  overwrite: boolean
): Promise<WrittenBundleSummary> {
  await mkdir(outputDir, { recursive: true });

  const plannedFiles = planExportFiles(outputDir, baseFileName, artifactType, chunks);
  const manifestPath = join(
    outputDir,
    artifactType === "verified_report"
      ? `${baseFileName}.report.manifest.json`
      : `${baseFileName}.evidence.manifest.json`
  );
  const targetPaths = [...plannedFiles.map((file) => file.filePath), manifestPath];
  await ensurePathsWritable(targetPaths, overwrite);

  for (const file of plannedFiles) {
    await writeFile(file.filePath, file.content, { encoding: "utf8", flag: overwrite ? "w" : "wx" });
  }

  const manifestPayload = {
    artifactType,
    writtenAt: new Date().toISOString(),
    outputDir,
    baseFileName,
    ...manifest,
    files: plannedFiles.map((file) => ({
      fileName: file.fileName,
      filePath: file.filePath,
      chunkIndex: file.chunkIndex,
      title: file.title,
      charCount: file.charCount,
      batchIndices: file.batchIndices,
    })),
  };
  await writeFile(manifestPath, JSON.stringify(manifestPayload, null, 2), {
    encoding: "utf8",
    flag: overwrite ? "w" : "wx",
  });

  return {
    manifestPath,
    fileCount: plannedFiles.length,
    totalChars: plannedFiles.reduce((sum, file) => sum + file.charCount, 0),
    files: plannedFiles.map((file) => file.filePath),
  };
}

function buildBlockedPhaseResult(
  phase: ResearchPipelineInput["phase"],
  nextPhase: string,
  reason: string,
  stateSnapshot: Record<string, unknown>
): PhaseResult {
  return {
    phase,
    layersExecuted: ["STATE:get_state"],
    results: {
      blocked: true,
      stateSnapshot,
    },
    nextPhase,
    directive: reason,
  };
}

function validatePipelineTransition(
  store: SessionStore,
  sessionId: string,
  phase: ResearchPipelineInput["phase"]
): PhaseResult | null {
  const currentPhase = readStateValue<string>(store, sessionId, "pipeline_phase");
  const gatherCount = readStateValue<number>(store, sessionId, "pipeline_gather_count") ?? 0;
  const verifyPassed = readStateValue<boolean>(store, sessionId, "pipeline_verify_passed") === true;
  const lastVerifyAction = readStateValue<string>(store, sessionId, "pipeline_last_verify_action") ?? "not_run";
  const evidenceScore = readStateValue<number>(store, sessionId, "pipeline_evidence_score_total") ?? 0;
  const lastGatherQuality = readStateValue<ResearchQualityProfile["quality"] | "none">(
    store,
    sessionId,
    "pipeline_last_gather_quality"
  ) ?? "none";

  if (phase === "init") {
    return null;
  }

  if (!currentPhase) {
    return buildBlockedPhaseResult(
      phase,
      "init",
      "Pipeline not initialized. Call research_pipeline phase='init' first so the task, state, and memory baseline are established.",
      { currentPhase: null, gatherCount, verifyPassed, evidenceScore, lastGatherQuality }
    );
  }

  if (phase === "analyze" && gatherCount < 1) {
    return buildBlockedPhaseResult(
      phase,
      "gather",
      "Analyze requires at least one gather batch. Call research_pipeline phase='gather' with sourced findings before analysis.",
      { currentPhase, gatherCount, verifyPassed, evidenceScore, lastGatherQuality }
    );
  }

  // Evidence gate removed — LLM decides when to analyze.
  // Previously blocked analyze when evidenceScore < MIN_ANALYZE_EVIDENCE_SCORE.

  if (phase === "verify" && currentPhase !== "analyze" && currentPhase !== "verify") {
    return buildBlockedPhaseResult(
      phase,
      "analyze",
      "Verify requires an analysis draft. Run research_pipeline phase='analyze' first, then verify the resulting draft.",
      { currentPhase, gatherCount, verifyPassed, evidenceScore, lastGatherQuality }
    );
  }

  // Finalize is no longer hard-blocked by verify — gather/analyze files are already on disk.
  // If verify hasn't passed, finalize still runs but adds a warning to the directive.
  // This prevents the LLM from giving up and producing no output at all.

  return null;
}

export async function handleResearchPipeline(
  store: SessionStore,
  catalog: ToolCatalog,
  memory: UnifiedMemoryManager,
  siloManager: SiloManager,
  rawInput: z.input<typeof researchPipelineInputSchema>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input = researchPipelineInputSchema.parse(rawInput);
  const { sessionId, phase, content, messages, claim, metadata, outputDir, baseFileName } = input;
  // Auto-generate outputDir if not provided — ensures autonomous file writing always fires
  // Reuse the previously stored outputDir for the same session to keep files in one directory
  const storedOutputDir = readStateValue<string>(store, sessionId, "pipeline_outputDir");
  const resolvedOutputDir = outputDir
    ? resolve(outputDir)
    : storedOutputDir
      ? storedOutputDir
      : resolve(join(process.cwd(), "context-first-research-output", `${sessionId.slice(0, 12)}-${Date.now()}`));
  const safeBase = sanitizeFileStem(baseFileName ?? "research");

  const blocked = validatePipelineTransition(store, sessionId, phase);
  if (blocked) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(blocked, null, 2),
      }],
    };
  }

  let result: PhaseResult;

  // Store resolved outputDir in state so it's visible across phases
  store.setState(sessionId, "pipeline_outputDir", resolvedOutputDir, "pipeline");
  store.setState(sessionId, "pipeline_baseFileName", safeBase, "pipeline");

  switch (phase) {
    case "init":
      result = runInitPhase(store, catalog, memory, sessionId, content, messages);
      // Inject outputDir info into init result so the LLM knows where files will go
      result.results.outputDir = resolvedOutputDir;
      result.results.baseFileName = safeBase;
      result.directive += ` Autonomous file writing ENABLED: files will be written to ${resolvedOutputDir} during gather/analyze/finalize.`;
      break;
    case "gather":
      result = await runGatherPhase(store, catalog, memory, sessionId, content, messages, metadata, resolvedOutputDir, safeBase);
      break;
    case "analyze":
      result = await runAnalyzePhase(store, catalog, memory, siloManager, sessionId, content, messages, resolvedOutputDir, safeBase);
      break;
    case "verify":
      result = runVerifyPhase(store, catalog, memory, sessionId, content, messages, claim);
      break;
    case "finalize":
      result = await runFinalizePhase(store, catalog, memory, sessionId, content, messages, metadata, resolvedOutputDir, safeBase);
      break;
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(result, null, 2),
    }],
  };
}

export async function handleExportResearchFiles(
  store: SessionStore,
  memory: UnifiedMemoryManager,
  input: ExportResearchFilesInput
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const {
    sessionId,
    outputDir,
    baseFileName,
    exportVerifiedReport,
    exportRawEvidence,
    maxChunkChars,
    overwrite,
    finalSummary,
  } = input;

  if (!exportVerifiedReport && !exportRawEvidence) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          sessionId,
          blocked: true,
          directive: "Nothing to export. Set exportVerifiedReport, exportRawEvidence, or both.",
        }, null, 2),
      }],
    };
  }

  const resolvedOutputDir = resolve(outputDir);
  const safeBaseFileName = sanitizeFileStem(baseFileName);
  const verifyPassed = readStateValue<boolean>(store, sessionId, "pipeline_verify_passed") === true;
  const lastVerifyAction = readStateValue<string>(store, sessionId, "pipeline_last_verify_action") ?? "not_run";
  const currentPhase = readStateValue<string>(store, sessionId, "pipeline_phase") ?? null;
  const storedFinalSummary = readStateValue<string>(store, sessionId, "pipeline_last_final_summary") ?? "";
  const effectiveFinalSummary = finalSummary?.trim().length
    ? finalSummary.trim()
    : storedFinalSummary;

  const wrote: {
    verifiedReport: WrittenBundleSummary | null;
    rawEvidence: WrittenBundleSummary | null;
  } = {
    verifiedReport: null,
    rawEvidence: null,
  };
  const skipped: Array<{ artifact: "verified_report" | "raw_evidence"; reason: string }> = [];

  if (exportRawEvidence) {
    const evidenceArtifacts = buildRawEvidenceArtifacts(memory, sessionId, maxChunkChars);
    if (evidenceArtifacts.chunks.length === 0) {
      skipped.push({
        artifact: "raw_evidence",
        reason: "No gathered research batches were found in memory for this session.",
      });
    } else {
      wrote.rawEvidence = await writeExportBundle(
        resolvedOutputDir,
        safeBaseFileName,
        "raw_evidence",
        evidenceArtifacts.chunks,
        evidenceArtifacts.manifest,
        overwrite
      );
    }
  }

  if (exportVerifiedReport) {
    if (!verifyPassed) {
      skipped.push({
        artifact: "verified_report",
        reason: `Verified report export remains blocked until verify passes. Current verify status: ${lastVerifyAction}.`,
      });
    } else {
      const reportArtifacts = buildExportArtifacts(
        store,
        memory,
        sessionId,
        effectiveFinalSummary,
        maxChunkChars
      );

      if (reportArtifacts.chunks.length === 0) {
        skipped.push({
          artifact: "verified_report",
          reason: "No report artifacts were available to write for this session.",
        });
      } else {
        wrote.verifiedReport = await writeExportBundle(
          resolvedOutputDir,
          safeBaseFileName,
          "verified_report",
          reportArtifacts.chunks,
          reportArtifacts.manifest,
          overwrite
        );
      }
    }
  }

  const blocked = wrote.verifiedReport === null && wrote.rawEvidence === null;

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        sessionId,
        blocked,
        outputDir: resolvedOutputDir,
        baseFileName: safeBaseFileName,
        verifyStatus: {
          currentPhase,
          passed: verifyPassed,
          lastAction: lastVerifyAction,
        },
        wrote,
        skipped,
        directive: blocked
          ? "No files were written. Export raw evidence, fix verify, or enable overwrite if existing export files are blocking the write."
          : wrote.verifiedReport && wrote.rawEvidence
            ? "Verified report and raw evidence exports were written successfully."
            : wrote.verifiedReport
              ? "Verified report export was written successfully."
              : "Raw evidence export was written successfully. Narrative approval remains separated from evidence capture.",
      }, null, 2),
    }],
  };
}

// ─── Phase 1: INIT ────────────────────────────────────────────────
function runInitPhase(
  store: SessionStore,
  catalog: ToolCatalog,
  memory: UnifiedMemoryManager,
  sessionId: string,
  taskDescription: string,
  messages: ResearchPipelineInput["messages"]
): PhaseResult {
  const layersExecuted: string[] = [];
  const results: Record<string, unknown> = {};

  // 1. context_loop — runs ALL 17 health + truthfulness stages
  recordLoopCall(sessionId);
  const loopResult = runUnifiedLoop(store, catalog, {
    sessionId,
    messages,
    currentInput: taskDescription,
    discoveryQuery: taskDescription,
    lookbackTurns: 10,
  });
  layersExecuted.push(
    "ORCHESTRATOR:context_loop",
    "HEALTH:recap", "HEALTH:conflict", "HEALTH:ambiguity",
    "HEALTH:entropy", "HEALTH:abstention", "HEALTH:discovery",
    "HEALTH:grounding", "HEALTH:drift", "HEALTH:depth",
    "TRUTH:internal_state", "TRUTH:neighborhood", "TRUTH:verify_first",
    "TRUTH:truth_direction", "TRUTH:logical_consistency",
    "TRUTH:ioe_correction", "TRUTH:self_critique"
  );
  results.contextLoop = {
    action: loopResult.action,
    directive: loopResult.directive.instruction,
    stagesCompleted: loopResult.stages.filter(s => s.status === "completed").length,
    stagesTotal: loopResult.stages.length,
    contextHealth: loopResult.directive.contextHealth,
  };

  // 2. memory_recall — check prior knowledge
  const recallResult = memory.recall(sessionId, taskDescription, 5);
  layersExecuted.push("MEMORY:memory_recall");
  results.priorKnowledge = {
    memoriesFound: recallResult.totalCandidates,
    itemsReturned: recallResult.items.length,
    topItems: recallResult.items.slice(0, 3).map(r => ({
      content: r.content.slice(0, 200),
      source: r.source,
      relevance: Number(r.relevanceScore.toFixed(4)),
    })),
    gateDecision: recallResult.gateDecision.fusionStrategy,
    durationMs: recallResult.retrievalDurationMs,
  };

  // 3. get_state — check current ground truth
  const stateEntries = store.getState(sessionId);
  layersExecuted.push("STATE:get_state");
  results.currentState = {
    groundTruthEntries: Object.keys(stateEntries).length,
    keys: Object.keys(stateEntries).slice(0, 10),
  };

  // 3b. clear_state — clear previous pipeline keys so reruns don't inherit stale export or verify status
  const clearedPipelineKeys = store.clearState(sessionId, [...PIPELINE_STATE_KEYS]);
  layersExecuted.push("STATE:clear_state");
  results.stateReset = {
    clearedPipelineKeys,
  };

  // 4. memory_store — persist the task description
  const storeResult = memory.store(sessionId, "user", `[RESEARCH TASK] ${taskDescription}`, { type: "task_init" });
  layersExecuted.push("MEMORY:memory_store");
  results.taskStored = {
    episodeId: storeResult.episodeId,
    factsExtracted: storeResult.factsExtracted,
  };

  // 5. set_state — lock the task into ground truth
  store.setState(sessionId, "research_task", taskDescription, "pipeline_init");
  store.setState(sessionId, "pipeline_phase", "init", "pipeline");
  store.setState(sessionId, "pipeline_gather_count", 0, "pipeline");
  store.setState(sessionId, "pipeline_evidence_score_total", 0, "pipeline");
  store.setState(sessionId, "pipeline_last_gather_quality", "none", "pipeline");
  store.setState(sessionId, "pipeline_verify_passed", false, "pipeline");
  store.setState(sessionId, "pipeline_last_verify_action", "not_run", "pipeline");
  layersExecuted.push("STATE:set_state");
  results.pipelineReset = {
    gatherCount: 0,
    evidenceScoreTotal: 0,
    verifyPassed: false,
    clearedPipelineKeys,
  };

  // 6. discover_tools — show what tools are available
  if (loopResult.discovery) {
    results.suggestedTools = loopResult.discovery.suggestedTools.slice(0, 5);
  }

  return {
    phase: "init",
    layersExecuted,
    results,
    nextPhase: "gather",
    directive: `Initialization complete. Context health: ${loopResult.directive.contextHealth ?? "N/A"}. ` +
      `Action: ${loopResult.action}. ` +
      `Prior memories: ${recallResult.items.length}. ` +
      `CRITICAL WORKFLOW — Interleave search and gather strictly: ` +
      `(1) Do ONE web search on a specific topic. ` +
      `(2) IMMEDIATELY call gather with deeply written research content based on that search. ` +
      `(3) Gather writes a file to disk automatically — this is the core output of the pipeline. ` +
      `(4) Repeat steps 1-3 for the next topic. ` +
      `Do NOT batch multiple searches before calling gather — context compaction will lose the earlier search results. ` +
      `You are a research AUTHOR: for each gather, write a comprehensive section (not a raw paste) with facts, data, analysis, relationships, and expert commentary. ` +
      `After all topics gathered, call analyze → verify → finalize (these operate on the accumulated files).`,
  };
}

// ─── Phase 2: GATHER ──────────────────────────────────────────────
async function runGatherPhase(
  store: SessionStore,
  catalog: ToolCatalog,
  memory: UnifiedMemoryManager,
  sessionId: string,
  findings: string,
  messages: ResearchPipelineInput["messages"],
  metadata?: Record<string, unknown>,
  outputDir?: string,
  baseFileName?: string
): Promise<PhaseResult> {
  const layersExecuted: string[] = [];
  const results: Record<string, unknown> = {};
  const priorGatherCount = readStateValue<number>(store, sessionId, "pipeline_gather_count") ?? 0;
  const priorEvidenceScore = readStateValue<number>(store, sessionId, "pipeline_evidence_score_total") ?? 0;
  const priorBatchManifest = readStateValue<Array<Record<string, unknown>>>(store, sessionId, "pipeline_batch_manifest") ?? [];
  const researchQuality = analyzeResearchQuality(findings);
  const gatherCount = priorGatherCount + 1;
  const cumulativeEvidenceScore = roundTo(priorEvidenceScore + researchQuality.evidenceScore);
  const batchLabel = extractBatchLabel(findings, gatherCount);
  const sourceTools = normalizeStringArray(metadata?.sourceTools);

  // 1. memory_store — persist findings across all 9 memory tiers
  const storeResult = memory.store(sessionId, "assistant", findings, {
    ...metadata,
    type: "research_finding",
    batchIndex: gatherCount,
    batchLabel,
    evidenceScore: researchQuality.evidenceScore,
    researchQuality: researchQuality.quality,
    sourceTools,
  });
  layersExecuted.push("MEMORY:memory_store");
  results.memoryStore = {
    episodeId: storeResult.episodeId,
    sentenceCount: storeResult.sentenceCount,
    factsExtracted: storeResult.factsExtracted,
    graphNodesAdded: storeResult.graphNodesAdded,
    callbacksRegistered: storeResult.callbacksRegistered,
  };

  // 1b. Return a brief confirmation of stored content to the LLM.
  //     Previously returned enrichEpisodeContent() with graph edges, PageRank, triples —
  //     but the LLM echoed that noise into the finalSummary, polluting user-facing files.
  //     Now returns only a content preview so the LLM knows what was stored.
  results.storedContentPreview = findings.slice(0, 1500) + (findings.length > 1500 ? "\n\n[...truncated — full content stored in memory and written to disk]" : "");
  results.storedContentLength = findings.length;

  // 2. memory_graph — query knowledge graph for connections
  const graphResults = memory.graph.associativeRecall(sessionId, findings.slice(0, 1500), 2, 10);
  layersExecuted.push("MEMORY:memory_graph");
  results.knowledgeGraph = {
    nodesFound: graphResults.length,
    topConnections: graphResults.slice(0, 5).map(r => ({
      label: r.node.label,
      type: r.node.type,
      pageRank: Number(r.node.pageRank.toFixed(4)),
      distance: r.distance,
    })),
  };
  results.researchQuality = {
    ...researchQuality,
    gatherCount,
    cumulativeEvidenceScore,
  };
  results.batch = {
    batchIndex: gatherCount,
    batchLabel,
    sourceTools,
  };

  // 3. context_loop — health check after ingestion
  recordLoopCall(sessionId);
  const loopResult = runUnifiedLoop(store, catalog, {
    sessionId,
    messages,
    currentInput: findings.slice(0, 2000),
    lookbackTurns: 5,
  });
  layersExecuted.push("ORCHESTRATOR:context_loop", "HEALTH:all_9_stages", "TRUTH:all_7_stages");
  results.healthCheck = {
    action: loopResult.action,
    contextHealth: loopResult.directive.contextHealth,
    instruction: loopResult.directive.instruction,
  };

  // 4. set_state
  const batchManifest = [
    ...priorBatchManifest,
    {
      batchIndex: gatherCount,
      batchLabel,
      episodeId: storeResult.episodeId,
      evidenceScore: researchQuality.evidenceScore,
      quality: researchQuality.quality,
      sourceTools,
    },
  ];
  store.setState(sessionId, "pipeline_phase", "gather", "pipeline");
  store.setState(sessionId, "pipeline_gather_count", gatherCount, "pipeline");
  store.setState(sessionId, "pipeline_evidence_score_total", cumulativeEvidenceScore, "pipeline");
  store.setState(sessionId, "pipeline_last_gather_quality", researchQuality.quality, "pipeline");
  store.setState(sessionId, "pipeline_batch_manifest", batchManifest, "pipeline");
  store.setState(sessionId, "pipeline_verify_passed", false, "pipeline");
  store.setState(sessionId, "pipeline_last_verify_action", "invalidated_by_new_findings", "pipeline");
  layersExecuted.push("STATE:set_state");

  const qualityDirective = "Evidence stored. Continue searching and gathering, or move to analyze when you decide you have enough material.";

  // Content length warning — detect when the LLM passes a short summary instead of full source content
  const contentChars = findings.length;
  const contentLines = findings.split("\n").length;
  let contentWarning = "";
  if (contentChars < MIN_GATHER_CONTENT_CHARS || contentLines < MIN_GATHER_CONTENT_LINES) {
    contentWarning = ` NOTE: This batch is only ${contentChars} chars / ${contentLines} lines — this is thin. ` +
      `You are a research AUTHOR: enrich and expand the search results with analysis, context, connections, and expert commentary. ` +
      `Each gather call writes one file to disk — make it count. Aim for 4000+ chars per gather.`;
    results.contentLengthWarning = {
      chars: contentChars,
      lines: contentLines,
      minChars: MIN_GATHER_CONTENT_CHARS,
      minLines: MIN_GATHER_CONTENT_LINES,
      belowThreshold: true,
    };
  }

  // 5. Autonomous file writing — write 1 cohesive file per gather call.
  //    Previous approach split by ## headings, producing 10+ tiny files (~500-2000
  //    bytes) per gather.  The correct model: 1 gather = 1 output file, with all
  //    headings preserved as internal structure.  Only split when content is
  //    genuinely large (>30K chars) to avoid >500-line monoliths.
  const fileWriteResults: PhaseFileWriteResult[] = [];
  if (outputDir) {
    if (findings.length > MAX_CHARS_BEFORE_SPLIT) {
      // Large content: split by headings with aggressive merging (5K min per section)
      const topicSections = splitGatherByHeadings(findings, SPLIT_MIN_SECTION_CHARS);

      for (let sectionIndex = 0; sectionIndex < topicSections.length; sectionIndex++) {
        const section = topicSections[sectionIndex];
        const sectionSuffix = `-${String(sectionIndex + 1).padStart(2, "0")}`;
        const topicSlug = section.slug || `batch-${gatherCount}`;
        const fileName = `${baseFileName}.batch-${padNumber(gatherCount)}${sectionSuffix}.${topicSlug}.md`;

        const bodyContent = section.content.replace(/^#{1,3}\s+.+\n*/, "").trim();
        const fileContent = [
          `# ${section.heading}`,
          "",
          `> Research batch ${gatherCount}, section ${sectionIndex + 1}/${topicSections.length}`,
          sourceTools.length > 0 ? `> Source: ${sourceTools.join(", ")}` : undefined,
          "",
          "---",
          "",
          bodyContent,
        ].filter((line) => line !== undefined).join("\n");

        const writeResult = await writePhaseFile(outputDir, fileName, fileContent);
        fileWriteResults.push(writeResult);
      }
    } else {
      // Normal content (<30K chars): write 1 cohesive file per gather call.
      // Headings stay inside the file as internal structure.
      const topicSlug = slugify(batchLabel) || `batch-${gatherCount}`;
      const fileName = `${baseFileName}.batch-${padNumber(gatherCount)}.${topicSlug}.md`;

      const fileContent = [
        `# ${batchLabel}`,
        "",
        `> Research batch ${gatherCount}`,
        sourceTools.length > 0 ? `> Source: ${sourceTools.join(", ")}` : undefined,
        "",
        "---",
        "",
        findings.trim(),
      ].filter((line) => line !== undefined).join("\n");

      const writeResult = await writePhaseFile(outputDir, fileName, fileContent);
      fileWriteResults.push(writeResult);
    }

    layersExecuted.push("DISK:write_batch_files");
    results.autonomousFileWrites = fileWriteResults;
  }

  const totalFilesWritten = fileWriteResults.length;
  const totalLinesWritten = fileWriteResults.reduce((sum, f) => sum + f.lineCount, 0);
  const totalCharsWritten = fileWriteResults.reduce((sum, f) => sum + f.charCount, 0);

  return {
    phase: "gather",
    layersExecuted,
    results,
    nextPhase: researchQuality.quality === "weak" ? "gather" : "gather or analyze",
    directive: `Findings stored: ${storeResult.sentenceCount} sentences, ${storeResult.factsExtracted} facts, ` +
      `${storeResult.graphNodesAdded} graph nodes. ` +
      `Evidence quality: ${researchQuality.quality} (score ${researchQuality.evidenceScore.toFixed(2)}, urls=${researchQuality.urls}, citations=${researchQuality.citationSignals}, numericClaims=${researchQuality.numericClaims}). ` +
      `Health: ${loopResult.directive.contextHealth ?? "N/A"}. ` +
      `${qualityDirective} ` +
      `${loopResult.action === "proceed" ? "Context health supports continuing." : `Warning: ${loopResult.action} — ${loopResult.directive.instruction}`}` +
      contentWarning +
      (totalFilesWritten > 0
        ? ` FILE SAVED: ${totalFilesWritten} file(s) to disk (${totalLinesWritten} lines, ${totalCharsWritten} chars). ` +
          `Files: ${fileWriteResults.map(f => f.fileName).join(", ")}. ` +
          `NEXT: Do your next web search NOW, then IMMEDIATELY call gather again with deeply written content. ` +
          `When all topics are covered, proceed to analyze.`
        : ` TIP: Pass outputDir to research_pipeline to enable autonomous file writing per batch.`),
  };
}

// ─── Phase 3: ANALYZE ─────────────────────────────────────────────
async function runAnalyzePhase(
  store: SessionStore,
  catalog: ToolCatalog,
  memory: UnifiedMemoryManager,
  siloManager: SiloManager,
  sessionId: string,
  problem: string,
  messages: ResearchPipelineInput["messages"],
  outputDir?: string,
  baseFileName?: string
): Promise<PhaseResult> {
  const layersExecuted: string[] = [];
  const results: Record<string, unknown> = {};

  // 0. quarantine_context — isolate exploratory analysis state before promoting distilled results
  const analysisSilo = siloManager.createSilo(
    sessionId,
    `research_pipeline_analyze_${Date.now().toString(36)}`,
    ["research_task", "pipeline_gather_count", "pipeline_evidence_score_total"],
    300_000
  );
  const sandboxResult = {
    siloId: analysisSilo.siloId,
    inheritedKeys: [...analysisSilo.state.keys()],
  };
  analysisSilo.state.set(
    "pipeline_sandbox_problem",
    createGroundTruthEntry(problem, "research_pipeline")
  );
  layersExecuted.push("SANDBOX:quarantine_context");
  results.sandbox = sandboxResult;

  // 1. memory_recall — gather all relevant stored knowledge
  const recalled = memory.recall(sessionId, problem, 12);
  layersExecuted.push("MEMORY:memory_recall");
  const contextFromMemory = recalled.items.map(r => r.content).join("\n\n");
  const knownFacts = recalled.items.slice(0, 8).map(r => r.content.slice(0, 1200));
  results.recalledMemories = {
    count: recalled.items.length,
    totalCandidates: recalled.totalCandidates,
    gate: recalled.gateDecision.fusionStrategy,
    injectedCharacters: contextFromMemory.length,
  };
  // Return full recalled context so the LLM can use it for writing detailed analysis files
  results.recalledContext = contextFromMemory;

  // 2. InftyThink — iterative bounded-segment reasoning
  const enrichedProblem = contextFromMemory
    ? `${problem}\n\n[Context from memory]:\n${contextFromMemory}`
    : problem;

  const inftyResult = runInftyThink({
    problem: enrichedProblem,
    maxSegments: 14,
    maxSegmentTokens: 1200,
  });
  layersExecuted.push("REASONING:inftythink_reason");
  results.inftythink = {
    segments: inftyResult.totalSegments,
    converged: inftyResult.converged,
    convergenceReason: inftyResult.convergenceReason,
    depthAchieved: inftyResult.depthAchieved,
    totalTokens: inftyResult.totalTokens,
    compression: Number(inftyResult.overallCompression.toFixed(3)),
    finalAnswer: inftyResult.finalAnswer,
  };

  // 3. Coconut — multi-perspective continuous thought
  const coconutResult = runCoconut({
    problem: enrichedProblem,
    maxSteps: 14,
    breadth: 6,
    enableBreadthExploration: true,
  });
  layersExecuted.push("REASONING:coconut_reason");
  results.coconut = {
    totalSteps: coconutResult.totalSteps,
    latentOperations: coconutResult.latentOperations,
    compressionFactor: Number(coconutResult.compressionFactor.toFixed(2)),
    planningScore: Number(coconutResult.planningScore.toFixed(3)),
    usedBreadth: coconutResult.usedBreadthExploration,
    finalAnswer: coconutResult.finalAnswer,
  };

  // 4. KAG-Thinker — structured decomposition and dependency-grounded analysis
  const kagResult = runKAGThinker({
    problem: enrichedProblem,
    knownFacts,
    maxDepth: 6,
    maxSteps: 40,
  });
  layersExecuted.push("REASONING:kagthinker_solve");
  results.kagthinker = {
    totalSubProblems: kagResult.totalSubProblems,
    resolvedCount: kagResult.resolvedCount,
    failedCount: kagResult.failedCount,
    maxDepth: kagResult.maxDepth,
    interactiveSteps: kagResult.interactiveSteps,
    stabilityScore: Number(kagResult.stabilityScore.toFixed(3)),
    finalAnswer: kagResult.finalAnswer,
  };

  // 5. Mind Evolution — evolutionary search over synthesized candidate answers
  const seedResponses = Array.from(new Set([
    inftyResult.finalAnswer,
    coconutResult.finalAnswer,
    kagResult.finalAnswer,
    contextFromMemory.slice(0, 800),
  ].filter((item): item is string => Boolean(item && item.trim()))));
  const mindEvolutionResult = runMindEvolution({
    problem: enrichedProblem,
    criteria: [
      "coverage of the research question",
      "specificity and concrete evidence",
      "internal consistency",
      "actionable synthesis",
    ],
    populationSize: 10,
    maxGenerations: 6,
    seedResponses: seedResponses.slice(0, 4),
  });
  layersExecuted.push("REASONING:mindevolution_solve");
  results.mindevolution = {
    generations: mindEvolutionResult.totalGenerations,
    converged: mindEvolutionResult.converged,
    diversityScore: Number(mindEvolutionResult.diversityScore.toFixed(3)),
    totalEvaluated: mindEvolutionResult.totalEvaluated,
    bestFitness: Number(mindEvolutionResult.bestCandidate.fitness.toFixed(3)),
    finalAnswer: mindEvolutionResult.finalAnswer,
  };

  // 6. ExtraCoT — compress the combined reasoning
  const combinedSteps = [
    inftyResult.finalAnswer,
    coconutResult.finalAnswer,
    kagResult.finalAnswer,
    mindEvolutionResult.finalAnswer,
  ];
  const extracotResult = runExtraCoT({
    reasoningSteps: combinedSteps,
    problem: enrichedProblem,
    maxBudget: 1500,
    targetCompression: 0.27,
  });
  layersExecuted.push("REASONING:extracot_compress");
  results.extracot = {
    originalTokens: extracotResult.totalOriginalTokens,
    compressedTokens: extracotResult.totalCompressedTokens,
    compressionRatio: Number(extracotResult.overallCompressionRatio.toFixed(3)),
    avgFidelity: Number(extracotResult.avgSemanticFidelity.toFixed(3)),
    stepsWithinBudget: extracotResult.stepsWithinBudget,
    finalAnswer: extracotResult.finalAnswer,
  };

  analysisSilo.state.set(
    "pipeline_sandbox_analysis_summary",
    createGroundTruthEntry(
      {
        inftythink: inftyResult.finalAnswer.slice(0, 4000),
        coconut: coconutResult.finalAnswer.slice(0, 4000),
        kagthinker: kagResult.finalAnswer.slice(0, 4000),
        mindevolution: mindEvolutionResult.finalAnswer.slice(0, 4000),
        extracot: extracotResult.finalAnswer.slice(0, 4000),
      },
      "research_pipeline"
    )
  );
  const mergedSandbox = siloManager.mergeSilo(analysisSilo.siloId, [
    "pipeline_sandbox_problem",
    "pipeline_sandbox_analysis_summary",
  ]);
  layersExecuted.push("SANDBOX:merge_quarantine");
  results.sandbox = {
    ...sandboxResult,
    promotedCount: mergedSandbox.promotedCount,
    promotedKeys: mergedSandbox.promotedKeys,
  };

  // 7. memory_store — persist analysis results (full, no truncation)
  const analysisText = `[ANALYSIS] InftyThink(${inftyResult.totalSegments} segs, ${inftyResult.converged ? "converged" : "partial"}):\n${inftyResult.finalAnswer}\n\n` +
    `Coconut(${coconutResult.totalSteps} steps, planning=${coconutResult.planningScore.toFixed(2)}):\n${coconutResult.finalAnswer}\n\n` +
    `KAGThinker(subproblems=${kagResult.totalSubProblems}, stability=${kagResult.stabilityScore.toFixed(2)}):\n${kagResult.finalAnswer}\n\n` +
    `MindEvolution(generations=${mindEvolutionResult.totalGenerations}, bestFitness=${mindEvolutionResult.bestCandidate.fitness.toFixed(2)}):\n${mindEvolutionResult.finalAnswer}`;
  memory.store(sessionId, "assistant", analysisText, {
    type: "analysis",
    methods: ["inftythink", "coconut", "kagthinker", "mindevolution", "extracot"],
  });
  layersExecuted.push("MEMORY:memory_store");

  // 8. context_loop — health check after analysis
  recordLoopCall(sessionId);
  const loopResult = runUnifiedLoop(store, catalog, {
    sessionId,
    messages,
    currentInput: problem,
    claim: extracotResult.finalAnswer.slice(0, 2000),
    lookbackTurns: 10,
  });
  layersExecuted.push("ORCHESTRATOR:context_loop", "HEALTH:all_9_stages", "TRUTH:all_7_stages");
  results.healthCheck = {
    action: loopResult.action,
    contextHealth: loopResult.directive.contextHealth,
  };

  store.setState(sessionId, "pipeline_phase", "analyze", "pipeline");
  store.setState(sessionId, "pipeline_verify_passed", false, "pipeline");
  store.setState(sessionId, "pipeline_last_verify_action", "not_run", "pipeline");
  store.setState(sessionId, "pipeline_reasoning_methods", ["inftythink", "coconut", "kagthinker", "mindevolution", "extracot"], "pipeline");
  layersExecuted.push("STATE:set_state");

  // 9. Autonomous file writing — write ONE clean analysis file with engine output
  //    cleaned of trace formatting (no [Depth N], progress bars, ✓/✗ icons, etc.)
  //    Previous approach of 5 per-engine trace files produced noise that end users
  //    cannot understand. Now writes 1 readable analysis synthesis file.
  const analysisFileResults: PhaseFileWriteResult[] = [];
  if (outputDir) {
    // Clean engine outputs: strip all engine-specific trace formatting
    const cleanedInfty = cleanEngineOutput("inftythink", inftyResult.finalAnswer);
    const cleanedCoconut = cleanEngineOutput("coconut", coconutResult.finalAnswer);
    const cleanedKag = cleanEngineOutput("kagthinker", kagResult.finalAnswer);
    const cleanedMindEvo = cleanEngineOutput("mindevolution", mindEvolutionResult.finalAnswer);
    const cleanedExtraCot = cleanEngineOutput("extracot", extracotResult.finalAnswer);

    // Write the clean analysis synthesis file
    const synthesisFileName = `${baseFileName}.analysis.md`;
    const analysisSections: string[] = [
      "# Research Analysis",
      "",
      `> Topic: ${problem.slice(0, 300)}`,
      `> Based on ${recalled.items.length} memory items (${contextFromMemory.length} chars of context)`,
      "",
      "---",
      "",
    ];

    // Add each cleaned engine output as a section (skip empty ones)
    const engineOutputs = [
      { title: "Iterative Deep Analysis", content: cleanedInfty },
      { title: "Multi-Perspective Analysis", content: cleanedCoconut },
      { title: "Structured Decomposition Analysis", content: cleanedKag },
      { title: "Evolutionary Synthesis", content: cleanedMindEvo },
      { title: "Compressed Reasoning Summary", content: cleanedExtraCot },
    ];

    for (const engine of engineOutputs) {
      if (engine.content.length > 50) {
        analysisSections.push(
          `## ${engine.title}`,
          "",
          engine.content,
          "",
          "---",
          ""
        );
      }
    }

    // Note: Recalled context is NOT appended here — it already exists in the
    // batch files written during gather phase. Including it again creates duplication.

    const synthesisContent = analysisSections.join("\n");
    const synthesisWriteResult = await writePhaseFile(outputDir, synthesisFileName, synthesisContent);
    analysisFileResults.push(synthesisWriteResult);

    layersExecuted.push("DISK:write_analysis_file");
    results.autonomousFileWrites = analysisFileResults;
  }

  const filesSummary = analysisFileResults.length > 0
    ? ` FILES WRITTEN: ${analysisFileResults.length} analysis files (${analysisFileResults.map(f => `${f.fileName}: ${f.lineCount} lines`).join(", ")}). ` +
      `Total chars: ${analysisFileResults.reduce((sum, f) => sum + f.charCount, 0)}. The pipeline wrote these files autonomously.`
    : ` TIP: Pass outputDir to research_pipeline to enable autonomous analysis file writing.`;

  return {
    phase: "analyze",
    layersExecuted,
    results,
    nextPhase: "verify",
    directive: `Analysis complete with 5 reasoning methods. ` +
      `InftyThink: ${inftyResult.totalSegments} segments, ${inftyResult.converged ? "converged" : "partial"}. ` +
      `Coconut: ${coconutResult.totalSteps} steps, planning=${coconutResult.planningScore.toFixed(2)}. ` +
      `KAGThinker: ${kagResult.totalSubProblems} sub-problems, stability=${kagResult.stabilityScore.toFixed(2)}. ` +
      `MindEvolution: ${mindEvolutionResult.totalGenerations} generations, bestFitness=${mindEvolutionResult.bestCandidate.fitness.toFixed(2)}. ` +
      `ExtraCoT: ${extracotResult.overallCompressionRatio.toFixed(0)}x compression, fidelity=${extracotResult.avgSemanticFidelity.toFixed(2)}.` +
      filesSummary +
      ` Next: call research_pipeline phase='verify' with your draft output.`,
  };
}

// ─── Phase 4: VERIFY ──────────────────────────────────────────────
function runVerifyPhase(
  store: SessionStore,
  catalog: ToolCatalog,
  memory: UnifiedMemoryManager,
  sessionId: string,
  draftOutput: string,
  messages: ResearchPipelineInput["messages"],
  claim?: string
): PhaseResult {
  const layersExecuted: string[] = [];
  const results: Record<string, unknown> = {};

  // Track verify attempt count for soft-pass logic
  const priorAttempts = readStateValue<number>(store, sessionId, "pipeline_verify_attempt_count") ?? 0;
  const attemptCount = priorAttempts + 1;
  store.setState(sessionId, "pipeline_verify_attempt_count", attemptCount, "pipeline");
  results.attemptCount = attemptCount;

  // 1. memory_recall — cross-check draft against stored knowledge
  const crossCheck = memory.recall(sessionId, draftOutput.slice(0, 2000), 10);
  layersExecuted.push("MEMORY:memory_recall");
  results.crossCheck = {
    memoriesChecked: crossCheck.items.length,
    totalCandidates: crossCheck.totalCandidates,
    gate: crossCheck.gateDecision.fusionStrategy,
  };

  // 2. context_loop — FULL verification
  //    Internally runs all 17 stages:
  //    recap, conflict, ambiguity, entropy, abstention, discovery,
  //    grounding, drift, depth, internal_state, neighborhood,
  //    verify_first, truth_direction, logical_consistency,
  //    ioe_correction, self_critique, synthesis
  //
  //    NOTE: Use default thresholds (0.6) instead of overly strict 0.5,
  //    which caused infinite verify loops for research content.
  recordLoopCall(sessionId);
  const verifyMessages: Array<{ role: "user" | "assistant"; content: string; turn: number }> = [
    ...messages,
    { role: "assistant", content: draftOutput, turn: messages.length + 1 },
  ];
  const loopResult = runUnifiedLoop(store, catalog, {
    sessionId,
    messages: verifyMessages,
    currentInput: claim ?? draftOutput.slice(0, 2000),
    claim: claim ?? draftOutput.slice(0, 2000),
    lookbackTurns: 15,
  });
  layersExecuted.push(
    "ORCHESTRATOR:context_loop",
    "HEALTH:recap", "HEALTH:conflict", "HEALTH:ambiguity",
    "HEALTH:entropy", "HEALTH:abstention", "HEALTH:discovery",
    "HEALTH:grounding", "HEALTH:drift", "HEALTH:depth",
    "TRUTH:internal_state", "TRUTH:neighborhood", "TRUTH:verify_first",
    "TRUTH:truth_direction", "TRUTH:logical_consistency",
    "TRUTH:ioe_correction", "TRUTH:self_critique"
  );

  // Extract per-stage results for transparency
  const stageResults: Record<string, { status: string; durationMs: number }> = {};
  for (const stage of loopResult.stages) {
    stageResults[stage.name] = {
      status: stage.status,
      durationMs: stage.durationMs,
    };
  }
  results.verification = {
    action: loopResult.action,
    contextHealth: loopResult.directive.contextHealth,
    instruction: loopResult.directive.instruction,
    constraints: loopResult.directive.constraints,
    stagesRun: stageResults,
    completed: loopResult.stages.filter(s => s.status === "completed").length,
    skipped: loopResult.stages.filter(s => s.status === "skipped").length,
    errored: loopResult.stages.filter(s => s.status === "error").length,
  };

  // 3. memory_inspect — check overall memory health
  const memStatus = memory.getStatus(sessionId);
  layersExecuted.push("MEMORY:memory_inspect");
  results.memoryHealth = {
    tiers: memStatus.tiers,
    graph: memStatus.graph,
    compression: memStatus.compression,
    curation: memStatus.curation,
    lastIntegrity: memStatus.lastIntegrity,
  };

  const verificationStoreResult = memory.store(
    sessionId,
    "assistant",
    [
      `[VERIFICATION] action=${loopResult.action} attempt=${attemptCount}`,
      `Health=${loopResult.directive.contextHealth ?? "N/A"}`,
      `Instruction=${loopResult.directive.instruction}`,
      `CompletedStages=${loopResult.stages.filter(s => s.status === "completed").length}`,
      `ErroredStages=${loopResult.stages.filter(s => s.status === "error").length}`,
    ].join("\n"),
    {
      type: "verification",
      verificationAction: loopResult.action,
      contextHealth: loopResult.directive.contextHealth,
      attemptCount,
    }
  );
  layersExecuted.push("MEMORY:memory_store");
  results.verificationStored = {
    episodeId: verificationStoreResult.episodeId,
    factsExtracted: verificationStoreResult.factsExtracted,
  };

  // Determine pass status with soft-pass logic:
  // - Hard pass: action === "proceed"
  // - Soft pass: after MAX_VERIFY_ATTEMPTS_SOFT attempts, allow non-critical actions
  //   ("deepen", "clarify") if contextHealth meets the threshold
  // - This prevents infinite verify loops for research content where
  //   depth/ambiguity flags are expected (multiple perspectives, inherently complex topics)
  const hardPass = loopResult.action === "proceed";
  const contextHealth = loopResult.directive.contextHealth ?? 0;
  const softPassEligible = attemptCount >= MAX_VERIFY_ATTEMPTS_SOFT
    && VERIFY_SOFT_PASS_ACTIONS.includes(loopResult.action)
    && contextHealth >= VERIFY_SOFT_PASS_HEALTH_THRESHOLD;
  const passed = hardPass || softPassEligible;

  store.setState(sessionId, "pipeline_phase", "verify", "pipeline");
  store.setState(sessionId, "pipeline_verify_passed", passed, "pipeline");
  store.setState(sessionId, "pipeline_last_verify_action", loopResult.action, "pipeline");
  layersExecuted.push("STATE:set_state");

  results.passDecision = {
    hardPass,
    softPassEligible,
    passed,
    attemptCount,
    maxAttemptsForSoftPass: MAX_VERIFY_ATTEMPTS_SOFT,
    contextHealth,
    softPassHealthThreshold: VERIFY_SOFT_PASS_HEALTH_THRESHOLD,
    action: loopResult.action,
  };

  return {
    phase: "verify",
    layersExecuted,
    results,
    nextPhase: passed ? "finalize" : "verify (fix issues first)",
    directive: hardPass
      ? `Verification PASSED (hard pass). Health: ${contextHealth}. ` +
        `${loopResult.stages.filter(s => s.status === "completed").length} stages completed. Proceed to finalize.`
      : softPassEligible
        ? `Verification SOFT-PASSED after ${attemptCount} attempts. Action was "${loopResult.action}" but health ${contextHealth.toFixed(2)} meets threshold. ` +
          `Note: ${loopResult.directive.instruction} — Consider addressing this in the final output. Proceed to finalize.`
        : `Verification BLOCKED (attempt ${attemptCount}/${MAX_VERIFY_ATTEMPTS_SOFT}): ${loopResult.action} — ${loopResult.directive.instruction}. ` +
          `Health: ${contextHealth.toFixed(2)}. ` +
          (attemptCount >= MAX_VERIFY_ATTEMPTS_SOFT - 1
            ? `Next attempt will allow soft-pass for "${VERIFY_SOFT_PASS_ACTIONS.join('", "')}" actions if health >= ${VERIFY_SOFT_PASS_HEALTH_THRESHOLD}.`
            : `Fix the flagged issues and re-run verify. After ${MAX_VERIFY_ATTEMPTS_SOFT} attempts, soft-pass becomes available for non-critical actions.`),
  };
}

// ─── Phase 5: FINALIZE ───────────────────────────────────────────
async function runFinalizePhase(
  store: SessionStore,
  catalog: ToolCatalog,
  memory: UnifiedMemoryManager,
  sessionId: string,
  finalSummary: string,
  messages: ResearchPipelineInput["messages"],
  metadata?: Record<string, unknown>,
  outputDir?: string,
  baseFileName?: string
): Promise<PhaseResult> {
  const exportChunkIndex = typeof metadata?.exportChunkIndex === "number"
    ? metadata.exportChunkIndex
    : undefined;
  const maxChunkChars = typeof metadata?.maxChunkChars === "number"
    ? metadata.maxChunkChars
    : DEFAULT_EXPORT_CHUNK_CHARS;
  const storedFinalSummary = readStateValue<string>(store, sessionId, "pipeline_last_final_summary") ?? "";
  const effectiveFinalSummary = finalSummary.trim().length > 0 ? finalSummary.trim() : storedFinalSummary;
  const { chunks, manifest, historySummary } = buildExportArtifacts(
    store,
    memory,
    sessionId,
    effectiveFinalSummary,
    maxChunkChars
  );
  const coverage = buildCoverageReport();
  const verifyPassed = readStateValue<boolean>(store, sessionId, "pipeline_verify_passed") === true;

  // Only use the fast chunk-retrieval path if autonomous file writing has already completed.
  // Previously, ANY finalize call with exportChunkIndex would skip all file writing,
  // so if the LLM's first finalize call included exportChunkIndex, the synthesis.md
  // and finalize chunk files were never produced.
  const alreadyFinalized = readStateValue<string>(store, sessionId, "pipeline_phase") === "finalized";
  if (exportChunkIndex !== undefined && alreadyFinalized) {
    const requestedChunk = chunks.find((chunk) => chunk.chunkIndex === exportChunkIndex);

    return {
      phase: "finalize",
      layersExecuted: ["STATE:get_state", "STATE:get_history_summary"],
      results: {
        exportChunk: requestedChunk
          ? {
              chunkIndex: requestedChunk.chunkIndex,
              title: requestedChunk.title,
              kind: requestedChunk.kind,
              charCount: requestedChunk.charCount,
              batchIndices: requestedChunk.batchIndices,
              content: requestedChunk.content,
            }
          : null,
        exportPlan: manifest,
        coverage,
      },
      nextPhase: requestedChunk ? `write chunk ${requestedChunk.chunkIndex}` : "finalize",
      directive: requestedChunk
        ? `Export chunk ${requestedChunk.chunkIndex} ready. Write this chunk to disk before requesting the next one so no gathered batch is skipped.`
        : `Requested exportChunkIndex ${exportChunkIndex} was not found. Available chunks: ${chunks.length}. Call finalize without exportChunkIndex to get the manifest.`,
    };
  }

  const layersExecuted: string[] = [];
  const results: Record<string, unknown> = {};

  // 1. memory_store — persist final results
  const storeResult = memory.store(sessionId, "assistant", `[FINAL] ${effectiveFinalSummary}`, {
    type: "final_result",
    importance: "high",
  });
  layersExecuted.push("MEMORY:memory_store");
  results.stored = {
    episodeId: storeResult.episodeId,
    sentences: storeResult.sentenceCount,
    facts: storeResult.factsExtracted,
    graphNodes: storeResult.graphNodesAdded,
  };

  // 2. memory_compact — compress and consolidate
  const compactResult = memory.compact(sessionId);
  layersExecuted.push("MEMORY:memory_compact");
  results.compaction = {
    integrity: {
      totalFacts: compactResult.integrity.totalFacts,
      retained: compactResult.integrity.retainedFacts,
      lost: compactResult.integrity.lostFacts,
      lossPercent: Number((compactResult.integrity.lossPercentage * 100).toFixed(4)),
      verified: compactResult.integrity.verified,
    },
    compression: {
      beforeChars: compactResult.compressionStats.beforeChars,
      afterChars: compactResult.compressionStats.afterChars,
      ratio: Number(compactResult.compressionStats.ratio.toFixed(2)),
      sentencesProcessed: compactResult.compressionStats.sentencesProcessed,
      unitsCreated: compactResult.compressionStats.unitsCreated,
    },
  };

  // 3. memory_graph — query final knowledge graph structure
  const graphResults = memory.graph.associativeRecall(sessionId, finalSummary.slice(0, 1500), 2, 10);
  const graphStats = memory.graph.getStats(sessionId);
  layersExecuted.push("MEMORY:memory_graph");
  results.knowledgeGraph = {
    stats: graphStats,
    topEntities: graphResults.slice(0, 10).map(r => ({
      label: r.node.label,
      type: r.node.type,
      pageRank: Number(r.node.pageRank.toFixed(4)),
    })),
  };

  // 4. memory_curate — get top curated entries
  const topCurated = memory.curator.getTopEntries(sessionId, 20);
  layersExecuted.push("MEMORY:memory_curate");
  results.curation = {
    topEntries: topCurated.length,
    entries: topCurated.slice(0, 5).map(e => ({
      content: e.content.slice(0, 150),
      importance: e.importance,
    })),
  };

  // 4b. get_history_summary — capture the conversation/history trace alongside the report export
  layersExecuted.push("STATE:get_history_summary");
  results.historySummary = historySummary;

  // 5. memory_inspect — final status
  const finalStatus = memory.getStatus(sessionId);
  layersExecuted.push("MEMORY:memory_inspect");
  results.finalMemoryState = {
    tiers: finalStatus.tiers,
    graph: finalStatus.graph,
    compression: finalStatus.compression,
  };

  // 6. context_loop — final pass
  recordLoopCall(sessionId);
  const loopResult = runUnifiedLoop(store, catalog, {
    sessionId,
    messages,
    currentInput: "Research complete. Final verification.",
    lookbackTurns: 15,
  });
  layersExecuted.push("ORCHESTRATOR:context_loop", "HEALTH:all_9_stages", "TRUTH:all_7_stages");
  results.finalHealth = {
    action: loopResult.action,
    contextHealth: loopResult.directive.contextHealth,
  };

  // 7. set_state — mark finalized
  store.setState(sessionId, "pipeline_phase", "finalized", "pipeline");
  store.setState(sessionId, "pipeline_last_final_summary", effectiveFinalSummary, "pipeline");
  store.setState(sessionId, "pipeline_export_manifest", manifest, "pipeline");
  layersExecuted.push("STATE:set_state");
  results.exportPlan = manifest;
  results.coverage = coverage;
  // Return all enriched chunk content inline so the LLM can write a final synthesis file
  results.allChunks = chunks.map(c => ({
    chunkIndex: c.chunkIndex,
    title: c.title,
    kind: c.kind,
    content: c.content,
  }));

  // 8. Autonomous file writing — write synthesis + all enriched chunks to disk
  //
  // FIX (Round 6 — P10 quality audit):
  // - Skip gather_batch chunks: those files already exist from the gather phase
  //   (research.batch-00X.*.md). Writing them again as final-00X creates duplicates.
  // - Master synthesis: use raw episode content for gather batches, not enriched
  //   content (which includes noisy graph edges, extracted declarations, triples).
  // - Remove double Final Summary (buildExportArtifacts already includes it in
  //   the synthesis chunk; appending it again created a duplicate).
  // - Filter curated key findings to exclude reasoning engine traces.
  // - Remove Knowledge Graph raw metadata section (low signal-to-noise).
  const finalizeFileResults: PhaseFileWriteResult[] = [];
  if (outputDir) {
    // Write only non-gather chunks (synthesis, analysis) as individual files.
    // Gather batch files were already written during the gather phase.
    const nonGatherChunks = chunks.filter(c => c.kind !== "gather_batch");
    for (const chunk of nonGatherChunks) {
      const chunkSlug = slugify(chunk.title) || `chunk-${chunk.chunkIndex}`;
      const fileName = `${baseFileName}.final-${padNumber(chunk.chunkIndex)}.${chunkSlug}.md`;
      const fileContent = [
        `# ${chunk.title}`,
        "",
        "---",
        "",
        chunk.content,
      ].join("\n");

      const writeResult = await writePhaseFile(outputDir, fileName, fileContent);
      finalizeFileResults.push(writeResult);
    }

    // Build the master synthesis using raw episode content for gather batches
    // (no graph metadata, declarations, triples that pollute readability)
    const gatherEpisodes = getEpisodesByType(memory, sessionId, "research_finding");

    // Build TOC entries — synthesis sections only (batch content is in separate batch files)
    const tocEntries: string[] = [
      `1. [Research Sources](#research-sources)`,
      `2. [Executive Summary & Synthesis](#executive-summary--synthesis)`,
      `3. [Key Findings](#key-findings)`,
    ];

    // Build gather batch reference list — NOT full content (those already exist as separate batch files)
    // User explicitly requested: "when there are enough parts there is no need of full content"
    const gatherReferenceSections: string[] = [];
    for (const [index, episode] of gatherEpisodes.entries()) {
      const batchIndex = typeof episode.metadata.batchIndex === "number" ? episode.metadata.batchIndex : index + 1;
      const batchLabel = typeof episode.metadata.batchLabel === "string"
        ? episode.metadata.batchLabel
        : extractBatchLabel(episode.rawContent, batchIndex);
      const preview = episode.rawContent.slice(0, 300).replace(/\n/g, " ").trim();
      gatherReferenceSections.push(
        `${index + 1}. **${batchLabel}** (batch ${batchIndex}) — ${preview}...`
      );
    }

    // Filter curated findings: exclude reasoning engine traces and internal markers
    const CURATED_NOISE_PATTERNS = [
      "[ANALYSIS]", "[VERIFICATION]", "[FINAL]", "[RESEARCH TASK]",
      "Carry-forward:", "Coconut(", "KAGThinker(", "MindEvolution(",
      "InftyThink(", "ExtraCoT(", "[Depth ", "[Segment ",
      "Instruction: Analyze", "Final synthesis:", "convergenceReason",
    ];
    const filteredCurated = topCurated
      .filter(e => !CURATED_NOISE_PATTERNS.some(pattern => e.content.includes(pattern)))
      .slice(0, 15)
      .map(e => {
        // Strip [importance: N.NN] prefix that the curator adds internally
        let content = e.content.replace(/^\[importance:\s*[\d.]+\]\s*/i, "");
        const truncated = content.length > 600 ? content.slice(0, 600) + "..." : content;
        return `- ${truncated}`;
      });

    const masterFileName = `${baseFileName}.synthesis.md`;
    const masterContent = [
      "# Research Synthesis: Final Report",
      "",
      `> Generated: ${new Date().toISOString()}`,
      `> Sources analyzed: ${manifest.totalGatherBatches} research batches`,
      `> Total content: ${manifest.totalChars.toLocaleString()} characters`,
      "",
      "---",
      "",
      "## Table of Contents",
      "",
      ...tocEntries,
      "",
      "---",
      "",
      // Gather batch references — brief previews, not full content (batch files already exist on disk)
      "## Research Sources",
      "",
      ...gatherReferenceSections,
      "",
      "---",
      "",
      // Executive Summary — the effectiveFinalSummary (not duplicated; buildExportArtifacts
      // synthesis chunks are used for individual final-00X files, not the master)
      "## Executive Summary & Synthesis",
      "",
      effectiveFinalSummary,
      "",
      "---",
      "",
      // Key Findings — curated entries filtered of reasoning engine noise
      "## Key Findings",
      "",
      filteredCurated.length > 0
        ? filteredCurated.join("\n")
        : "_No curated findings available after filtering._",
    ].join("\n");

    const masterWriteResult = await writePhaseFile(outputDir, masterFileName, masterContent);
    finalizeFileResults.push(masterWriteResult);

    layersExecuted.push("DISK:write_finalize_files");
    results.autonomousFileWrites = finalizeFileResults;
  }

  const filesSummary = finalizeFileResults.length > 0
    ? ` FILES WRITTEN: ${finalizeFileResults.length} files (${finalizeFileResults.reduce((sum, f) => sum + f.lineCount, 0)} total lines, ${finalizeFileResults.reduce((sum, f) => sum + f.charCount, 0)} total chars). ` +
      `Master synthesis: ${finalizeFileResults[finalizeFileResults.length - 1]?.fileName ?? "N/A"}. ` +
      `All files written autonomously by the pipeline to ${outputDir}.`
    : ` TIP: Pass outputDir to research_pipeline to enable autonomous file writing.`;

  const verifyWarning = verifyPassed
    ? ""
    : " WARNING: Verify phase did not pass — output may contain unverified claims. Consider re-running verify on the written files.";

  // If the first finalize call also requested a specific chunk, include it in results
  // (the full finalize with autonomous file writing has already completed above)
  if (exportChunkIndex !== undefined) {
    const requestedChunk = chunks.find((chunk) => chunk.chunkIndex === exportChunkIndex);
    results.exportChunk = requestedChunk
      ? {
          chunkIndex: requestedChunk.chunkIndex,
          title: requestedChunk.title,
          kind: requestedChunk.kind,
          charCount: requestedChunk.charCount,
          batchIndices: requestedChunk.batchIndices,
          content: requestedChunk.content,
        }
      : null;
  }

  return {
    phase: "finalize",
    layersExecuted,
    results,
    nextPhase: null,
    directive: `Pipeline complete. ` +
      `Memory: ${finalStatus.tiers.episodic.totalEpisodes ?? 0} episodes, ${graphStats.nodeCount ?? 0} graph nodes. ` +
      `Compaction: ${compactResult.compressionStats.ratio.toFixed(1)}x, integrity=${compactResult.integrity.verified ? "OK" : "DEGRADED"}. ` +
      `Final health: ${loopResult.directive.contextHealth ?? "N/A"}. ` +
      `Export: ${chunks.length} chunk(s) preserving ${manifest.totalGatherBatches} gathered batch(es), ${manifest.totalChars} total chars.` +
      filesSummary +
      verifyWarning,
  };
}
