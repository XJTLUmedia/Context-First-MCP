import { mkdtemp, readFile, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { UnifiedMemoryManager } from "../memory/manager.js";
import { ToolCatalog } from "../registry/catalog.js";
import { SiloManager } from "../state/silo.js";
import { SessionStore } from "../state/store.js";
import { handleExportResearchFiles, handleResearchPipeline } from "./research-pipeline.js";

function parseResult(
  result:
    | ReturnType<typeof handleResearchPipeline>
    | Awaited<ReturnType<typeof handleExportResearchFiles>>
) {
  return JSON.parse(result.content[0].text) as Record<string, any>;
}

function createHarness() {
  const store = new SessionStore();
  const siloManager = new SiloManager(store);
  const catalog = new ToolCatalog();
  const memory = new UnifiedMemoryManager();

  return {
    store,
    siloManager,
    catalog,
    memory,
    destroy() {
      siloManager.destroy();
      store.destroy();
    },
  };
}

async function createTempDir(prefix: string) {
  return mkdtemp(join(tmpdir(), prefix));
}

describe("handleExportResearchFiles", () => {
  it("exports raw evidence batches even when verify has not passed", async () => {
    const harness = createHarness();
    const outputDir = await createTempDir("context-first-evidence-only-");

    try {
      handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "evidence-only",
        phase: "init",
        content: "Research technical analysis and preserve each gathered batch.",
        messages: [{ role: "user", content: "Need raw research preserved.", turn: 1 }],
      });

      handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "evidence-only",
        phase: "gather",
        content: [
          "## External evidence batch one",
          "According to Reuters coverage, some momentum and moving-average signals have shown persistence in equity datasets before costs.",
          "Source: https://example.com/batch-one",
        ].join("\n"),
        messages: [],
        metadata: {
          sourceTools: ["vscode-websearchforcopilot_webSearch"],
        },
      });

      handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "evidence-only",
        phase: "gather",
        content: [
          "## External evidence batch two",
          "Counterarguments from weak-form EMH and data-snooping critiques say many chart patterns vanish out of sample.",
          "Source: https://example.com/batch-two",
        ].join("\n"),
        messages: [],
        metadata: {
          sourceTools: ["fetch_webpage"],
        },
      });

      const exportResult = parseResult(await handleExportResearchFiles(harness.store, harness.memory, {
        sessionId: "evidence-only",
        outputDir,
        baseFileName: "ta-evidence",
        exportVerifiedReport: false,
        exportRawEvidence: true,
        maxChunkChars: 50_000,
        overwrite: false,
      }));

      expect(exportResult.blocked).toBe(false);
      expect(exportResult.wrote.rawEvidence.fileCount).toBeGreaterThanOrEqual(2);
      expect(exportResult.wrote.verifiedReport).toBeNull();

      const exportedFiles = await readdir(outputDir);
      expect(exportedFiles).toContain("ta-evidence.evidence.batch-001.md");
      expect(exportedFiles).toContain("ta-evidence.evidence.batch-002.md");
      expect(exportedFiles).toContain("ta-evidence.evidence.manifest.json");

      const batchOne = await readFile(join(outputDir, "ta-evidence.evidence.batch-001.md"), "utf8");
      expect(batchOne).toContain("Raw Evidence Batch 1");
      expect(batchOne).toContain("External evidence batch one");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
      harness.destroy();
    }
  });

  it("writes raw evidence but skips verified report when verify has not passed", async () => {
    const harness = createHarness();
    const outputDir = await createTempDir("context-first-partial-export-");

    try {
      handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "partial-export",
        phase: "init",
        content: "Research technical analysis with separated evidence capture and narrative approval.",
        messages: [{ role: "user", content: "Need both evidence and a verified report when ready.", turn: 1 }],
      });

      handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "partial-export",
        phase: "gather",
        content: [
          "## External evidence batch one",
          "A summarized sample cited a 12% annualized return differential before costs in one regime-specific technical-analysis study.",
          "Source: https://example.com/batch-one",
        ].join("\n"),
        messages: [],
        metadata: {
          sourceTools: ["vscode-websearchforcopilot_webSearch"],
        },
      });

      const exportResult = parseResult(await handleExportResearchFiles(harness.store, harness.memory, {
        sessionId: "partial-export",
        outputDir,
        baseFileName: "ta-partial",
        exportVerifiedReport: true,
        exportRawEvidence: true,
        maxChunkChars: 50_000,
        overwrite: false,
      }));

      expect(exportResult.blocked).toBe(false);
      expect(exportResult.wrote.rawEvidence.fileCount).toBe(1);
      expect(exportResult.wrote.verifiedReport).toBeNull();
      expect(exportResult.skipped).toContainEqual({
        artifact: "verified_report",
        reason: "Verified report export remains blocked until verify passes. Current verify status: invalidated_by_new_findings.",
      });
    } finally {
      await rm(outputDir, { recursive: true, force: true });
      harness.destroy();
    }
  });

  it("writes the verified report automatically without manual finalize chunk looping", async () => {
    const harness = createHarness();
    const outputDir = await createTempDir("context-first-full-export-");

    try {
      handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "verified-export",
        phase: "init",
        content: "Build a comprehensive technical-analysis report for stock markets with batch-preserving export.",
        messages: [{ role: "user", content: "Need the final report written without manual chunk retrieval.", turn: 1 }],
      });

      handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "verified-export",
        phase: "gather",
        content: [
          "## External evidence batch one",
          "According to Reuters coverage and multiple academic studies, momentum and moving-average signals have shown persistence in some equity datasets, but much of the edge shrinks after costs.",
          "Source: https://example.com/batch-one",
        ].join("\n"),
        messages: [],
        metadata: {
          sourceTools: ["vscode-websearchforcopilot_webSearch"],
        },
      });

      handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "verified-export",
        phase: "gather",
        content: [
          "## External evidence batch two",
          "A GitHub backtest repository reported stronger performance in trending regimes and weaker performance in sideways markets for technical-analysis strategies.",
          "Source: https://github.com/example/ta-backtests",
        ].join("\n"),
        messages: [],
        metadata: {
          sourceTools: ["github_repo"],
        },
      });

      harness.store.setState("verified-export", "pipeline_phase", "verify", "test");
      harness.store.setState("verified-export", "pipeline_verify_passed", true, "test");
      harness.store.setState("verified-export", "pipeline_last_verify_action", "proceed", "test");

      const exportResult = parseResult(await handleExportResearchFiles(harness.store, harness.memory, {
        sessionId: "verified-export",
        outputDir,
        baseFileName: "ta-report",
        exportVerifiedReport: true,
        exportRawEvidence: true,
        maxChunkChars: 350,
        overwrite: false,
        finalSummary: "Integrated final summary: technical analysis may retain conditional value in stocks when regime filtering, execution costs, and disciplined risk management are handled explicitly.",
      }));

      expect(exportResult.blocked).toBe(false);
      expect(exportResult.wrote.verifiedReport.fileCount).toBeGreaterThanOrEqual(3);
      expect(exportResult.wrote.rawEvidence.fileCount).toBeGreaterThanOrEqual(2);

      const manifest = JSON.parse(
        await readFile(join(outputDir, "ta-report.report.manifest.json"), "utf8")
      ) as Record<string, any>;
      expect(manifest.artifactType).toBe("verified_report");
      expect(manifest.totalGatherBatches).toBe(2);
      expect(manifest.files.length).toBeGreaterThanOrEqual(3);

      const reportFiles = await readdir(outputDir);
      expect(reportFiles).toContain("ta-report.report.part-001.md");
      expect(reportFiles).toContain("ta-report.report.manifest.json");
      expect(reportFiles).toContain("ta-report.evidence.manifest.json");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
      harness.destroy();
    }
  });
});
