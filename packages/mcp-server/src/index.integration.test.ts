import { mkdtemp, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createContextFirstServer } from "./index.js";

type PipelineToolResult = {
  phase: string;
  layersExecuted: string[];
  results: Record<string, any>;
  nextPhase: string | null;
  directive: string;
};

function parseToolJson(result: Awaited<ReturnType<Client["callTool"]>>): PipelineToolResult {
  const jsonBlock = result.content.find(
    (entry): entry is Extract<(typeof result.content)[number], { type: "text" }> =>
      entry.type === "text" && entry.text.trim().startsWith("{")
  );

  if (!jsonBlock) {
    throw new Error(`Expected JSON text content in tool result, received: ${JSON.stringify(result.content)}`);
  }

  return JSON.parse(jsonBlock.text) as PipelineToolResult;
}

async function createServerHarness() {
  const { server, store, siloManager } = createContextFirstServer({
    name: "context-first-test-server",
    version: "test",
  });
  const client = new Client({
    name: "context-first-test-client",
    version: "test",
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    async destroy() {
      await Promise.allSettled([client.close(), server.close()]);
      siloManager.destroy();
      store.destroy();
    },
  };
}

describe("Context-First MCP server surface", () => {
  it("invokes research_pipeline through the registered MCP tool path", async () => {
    const harness = await createServerHarness();

    try {
      const listedTools = await harness.client.listTools();
      const researchPipelineTool = listedTools.tools.find((tool) => tool.name === "research_pipeline");

      expect(researchPipelineTool).toBeDefined();
      expect(researchPipelineTool?.description).toContain("Orchestrates all underlying Context-First layers through 6 phases");
      expect(researchPipelineTool?.inputSchema.properties).toHaveProperty("phase");

      const sessionId = "server-surface-research-pipeline";

      const initResult = parseToolJson(await harness.client.callTool({
        name: "research_pipeline",
        arguments: {
          sessionId,
          phase: "init",
          content: "Build a comprehensive technical-analysis report for stock markets with explicit evidence handling and batch-preserving export.",
          messages: [{ role: "user", content: "Need the full research export preserved across all gathered batches.", turn: 1 }],
        },
      }));

      expect(initResult.phase).toBe("init");
      expect(initResult.nextPhase).toBe("gather");

      const firstGather = parseToolJson(await harness.client.callTool({
        name: "research_pipeline",
        arguments: {
          sessionId,
          phase: "gather",
          content: [
            "## External evidence batch one",
            "According to Reuters coverage and multiple academic studies, momentum and moving-average signals have shown persistence in some equity datasets, but much of the edge shrinks after costs.",
            "One summary cited a 12% annualized return differential before costs in a sample period.",
            "Source: https://example.com/batch-one",
          ].join("\n"),
          messages: [],
          metadata: {
            sourceTools: ["vscode-websearchforcopilot_webSearch"],
          },
        },
      }));

      expect(["developing", "strong"]).toContain(firstGather.results.researchQuality.quality);

      const secondGather = parseToolJson(await harness.client.callTool({
        name: "research_pipeline",
        arguments: {
          sessionId,
          phase: "gather",
          content: [
            "## External evidence batch two",
            "A GitHub backtest repository comparing breakout, volatility-filter, and 50/200-day moving-average strategies reported better performance in trending regimes and materially weaker results in sideways conditions.",
            "Counterarguments from weak-form EMH and data-snooping critiques said many technical patterns vanish out of sample once realistic slippage is applied.",
            "Source: https://github.com/example/ta-backtests",
          ].join("\n"),
          messages: [],
          metadata: {
            sourceTools: ["github_repo"],
          },
        },
      }));

      expect(secondGather.results.researchQuality.cumulativeEvidenceScore).toBeGreaterThanOrEqual(0.45);

      const analyzeResult = parseToolJson(await harness.client.callTool({
        name: "research_pipeline",
        arguments: {
          sessionId,
          phase: "analyze",
          content: "Synthesize the implications of the gathered technical-analysis evidence with emphasis on market regime, transaction costs, and risk management.",
          messages: [],
        },
      }));

      expect(analyzeResult.phase).toBe("analyze");
      expect(analyzeResult.nextPhase).toBe("verify");
      expect(analyzeResult.layersExecuted).toContain("SANDBOX:quarantine_context");
      expect(analyzeResult.layersExecuted).toContain("REASONING:kagthinker_solve");

      const blockedFinalize = parseToolJson(await harness.client.callTool({
        name: "research_pipeline",
        arguments: {
          sessionId,
          phase: "finalize",
          content: "Attempting to finalize before verify should stay blocked.",
          messages: [],
        },
      }));

      // Finalize no longer blocks on verify (Round 5) — runs with a warning instead
      expect(blockedFinalize.phase).toBe("finalize");
      expect(blockedFinalize.directive).toContain("WARNING");
      expect(blockedFinalize.directive).toContain("Verify phase did not pass");

      await harness.client.callTool({
        name: "context_loop",
        arguments: {
          sessionId,
          messages: [{ role: "user", content: "Bootstrap state tools for the finalize integration check.", turn: 1 }],
        },
      });

      await harness.client.callTool({
        name: "context_health",
        arguments: {
          sessionId,
          check: "set_state",
          params: {
            key: "pipeline_phase",
            value: "verify",
            source: "integration-test",
          },
        },
      });

      await harness.client.callTool({
        name: "context_health",
        arguments: {
          sessionId,
          check: "set_state",
          params: {
            key: "pipeline_verify_passed",
            value: true,
            source: "integration-test",
          },
        },
      });

      await harness.client.callTool({
        name: "context_health",
        arguments: {
          sessionId,
          check: "set_state",
          params: {
            key: "pipeline_last_verify_action",
            value: "proceed",
            source: "integration-test",
          },
        },
      });

      const finalizeResult = parseToolJson(await harness.client.callTool({
        name: "research_pipeline",
        arguments: {
          sessionId,
          phase: "finalize",
          content: "Integrated final summary: technical analysis may retain conditional value in stocks when regime filtering, execution costs, and disciplined risk management are handled explicitly.",
          messages: [],
          metadata: {
            maxChunkChars: 350,
          },
        },
      }));

      expect(finalizeResult.phase).toBe("finalize");
      expect(finalizeResult.layersExecuted).toContain("STATE:get_history_summary");
      expect(finalizeResult.results.exportPlan.preserveBatchBoundaries).toBe(true);
      expect(finalizeResult.results.exportPlan.totalGatherBatches).toBe(2);
      expect(finalizeResult.results.exportPlan.totalChunks).toBeGreaterThanOrEqual(3);
      expect(finalizeResult.results.coverage.totalUnderlyingToolEquivalents).toBe(34);
      expect(finalizeResult.results.coverage.allUnderlyingToolEquivalentsCovered).toBe(true);

      const firstChunk = parseToolJson(await harness.client.callTool({
        name: "research_pipeline",
        arguments: {
          sessionId,
          phase: "finalize",
          content: "",
          messages: [],
          metadata: {
            exportChunkIndex: 1,
          },
        },
      }));

      expect(firstChunk.results.exportChunk.chunkIndex).toBe(1);
      expect(firstChunk.results.exportChunk.title).toContain("Batch 1");
      expect(firstChunk.results.exportChunk.content).toContain("External evidence batch one");
      expect(firstChunk.directive).toContain("Write this chunk to disk");
    } finally {
      await harness.destroy();
    }
  });

  it("invokes export_research_files through the registered MCP tool path", async () => {
    const harness = await createServerHarness();
    const outputDir = await mkdtemp(join(tmpdir(), "context-first-server-export-"));

    try {
      const listedTools = await harness.client.listTools();
      const exportTool = listedTools.tools.find((tool) => tool.name === "export_research_files");

      expect(exportTool).toBeDefined();
      expect(exportTool?.description).toContain("writes research artifacts to disk");

      const sessionId = "server-surface-export-helper";

      await harness.client.callTool({
        name: "research_pipeline",
        arguments: {
          sessionId,
          phase: "init",
          content: "Preserve gathered technical-analysis research and export it without manual chunk-loop decisions.",
          messages: [{ role: "user", content: "Need report and evidence exports written automatically.", turn: 1 }],
        },
      });

      await harness.client.callTool({
        name: "research_pipeline",
        arguments: {
          sessionId,
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
        },
      });

      await harness.client.callTool({
        name: "research_pipeline",
        arguments: {
          sessionId,
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
        },
      });

      await harness.client.callTool({
        name: "context_loop",
        arguments: {
          sessionId,
          messages: [{ role: "user", content: "Bootstrap state writes for export helper integration.", turn: 1 }],
        },
      });

      await harness.client.callTool({
        name: "context_health",
        arguments: {
          sessionId,
          check: "set_state",
          params: {
            key: "pipeline_phase",
            value: "verify",
            source: "integration-test",
          },
        },
      });

      await harness.client.callTool({
        name: "context_health",
        arguments: {
          sessionId,
          check: "set_state",
          params: {
            key: "pipeline_verify_passed",
            value: true,
            source: "integration-test",
          },
        },
      });

      await harness.client.callTool({
        name: "context_health",
        arguments: {
          sessionId,
          check: "set_state",
          params: {
            key: "pipeline_last_verify_action",
            value: "proceed",
            source: "integration-test",
          },
        },
      });

      const exportResult = parseToolJson(await harness.client.callTool({
        name: "export_research_files",
        arguments: {
          sessionId,
          outputDir,
          baseFileName: "ta-server-export",
          exportVerifiedReport: true,
          exportRawEvidence: true,
          maxChunkChars: 350,
          overwrite: false,
          finalSummary: "Integrated final summary: technical analysis may retain conditional value when regime filtering, execution costs, and disciplined risk management are handled explicitly.",
        },
      }));

      expect(exportResult.blocked).toBe(false);
      expect(exportResult.wrote.verifiedReport.fileCount).toBeGreaterThanOrEqual(3);
      expect(exportResult.wrote.rawEvidence.fileCount).toBeGreaterThanOrEqual(2);

      const files = await readdir(outputDir);
      expect(files).toContain("ta-server-export.report.manifest.json");
      expect(files).toContain("ta-server-export.evidence.manifest.json");
      expect(files.some((file) => file.startsWith("ta-server-export.evidence.batch-001"))).toBe(true);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
      await harness.destroy();
    }
  });
});