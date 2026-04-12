import { describe, expect, it } from "vitest";
import { SessionStore } from "../state/store.js";
import { SiloManager } from "../state/silo.js";
import { ToolCatalog } from "../registry/catalog.js";
import { UnifiedMemoryManager } from "../memory/manager.js";
import { handleResearchPipeline } from "./research-pipeline.js";

async function parseResult(result: ReturnType<typeof handleResearchPipeline>) {
  const resolved = await result;
  return JSON.parse(resolved.content[0].text) as {
    phase: string;
    layersExecuted: string[];
    results: Record<string, any>;
    nextPhase: string | null;
    directive: string;
  };
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

describe("handleResearchPipeline", () => {
  it("blocks analyze before any gather phase has been recorded", async () => {
    const harness = createHarness();

    try {
      await handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "analyze-blocked",
        phase: "init",
        content: "Research whether technical analysis has empirical support in equity markets.",
        messages: [{ role: "user", content: "Need a deep technical-analysis research report.", turn: 1 }],
      });

      const result = await parseResult(handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "analyze-blocked",
        phase: "analyze",
        content: "Synthesize the findings.",
        messages: [],
      }));

      expect(result.results.blocked).toBe(true);
      expect(result.nextPhase).toBe("gather");
      expect(result.directive).toContain("at least one gather batch");
    } finally {
      harness.destroy();
    }
  });

  it("blocks analyze when gathered evidence is still weak", async () => {
    const harness = createHarness();

    try {
      await handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "weak-evidence-blocked",
        phase: "init",
        content: "Research technical analysis with evidence.",
        messages: [{ role: "user", content: "Need a deep, sourced report.", turn: 1 }],
      });

      await handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "weak-evidence-blocked",
        phase: "gather",
        content: "Moving averages and RSI are popular with traders, and patterns are widely discussed online.",
        messages: [],
      });

      const result = await parseResult(handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "weak-evidence-blocked",
        phase: "analyze",
        content: "Synthesize the findings.",
        messages: [],
      }));

      expect(result.results.blocked).toBe(true);
      expect(result.nextPhase).toBe("gather");
      expect(result.directive).toContain("evidence is still weak");
    } finally {
      harness.destroy();
    }
  });

  it("adds research-quality diagnostics during gather", async () => {
    const harness = createHarness();

    try {
      await handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "gather-quality",
        phase: "init",
        content: "Research technical analysis with empirical evidence.",
        messages: [{ role: "user", content: "Collect sourced findings.", turn: 1 }],
      });

      const result = await parseResult(handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "gather-quality",
        phase: "gather",
        content: [
          "## Empirical evidence",
          "According to Reuters and multiple academic studies, trend-following signals have shown persistence in some futures and equity datasets.",
          "A 2023 report cited a 12% annualized return differential in one sample; however, the effect weakened after costs.",
          "Source: https://example.com/technical-analysis-study",
        ].join("\n"),
        messages: [],
      }));

      expect(result.results.researchQuality).toBeDefined();
      expect(result.results.researchQuality.evidenceScore).toBeGreaterThan(0.3);
      expect(["developing", "strong"]).toContain(result.results.researchQuality.quality);
    } finally {
      harness.destroy();
    }
  });

  it("runs the full reasoning stack during analyze", async () => {
    const harness = createHarness();

    try {
      await handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "full-reasoning",
        phase: "init",
        content: "Research how technical analysis works, where it fails, and where evidence is mixed.",
        messages: [{ role: "user", content: "Need deep research.", turn: 1 }],
      });

      await handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "full-reasoning",
        phase: "gather",
        content: [
          "## Evidence batch",
          "According to Reuters coverage and multiple academic studies, moving-average and momentum signals can show persistence in some futures and equity datasets, but the edge often shrinks after transaction costs.",
          "One reported sample showed a 12% annualized return differential before costs, while Bloomberg-style market summaries emphasized that volume confirmation and regime classification matter more than isolated indicator readings.",
          "However, weak-form EMH critiques and data-snooping concerns mean many patterns disappear out of sample.",
          "Source: https://example.com/technical-analysis-evidence",
        ].join("\n"),
        messages: [],
      });

      const result = await parseResult(handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "full-reasoning",
        phase: "analyze",
        content: "Synthesize what technical analysis can and cannot claim, with emphasis on market regime, execution costs, and risk management.",
        messages: [],
      }));

      expect(result.layersExecuted).toContain("REASONING:kagthinker_solve");
      expect(result.layersExecuted).toContain("REASONING:mindevolution_solve");
      expect(result.results.kagthinker).toBeDefined();
      expect(result.results.mindevolution).toBeDefined();
    } finally {
      harness.destroy();
    }
  });

  it("integration: blocks weak gather notes, then proceeds after stronger external MCP evidence is gathered", async () => {
    const harness = createHarness();

    try {
      const initResult = await parseResult(handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "stock-ta-integration",
        phase: "init",
        content: "Assess whether stock-market technical analysis has empirical support, where it fails, and how an LLM should describe it without overclaiming.",
        messages: [{ role: "user", content: "Need a realistic, evidence-backed research workflow for technical analysis in stocks.", turn: 1 }],
      }));

      expect(initResult.phase).toBe("init");
      expect(initResult.nextPhase).toBe("gather");

      const weakGather = await parseResult(handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "stock-ta-integration",
        phase: "gather",
        content: [
          "## Initial notes",
          "RSI, MACD, support/resistance, and candlestick patterns are common in trading discussions.",
          "Many traders say trend lines and moving averages help identify entries.",
        ].join("\n"),
        messages: [],
        metadata: {
          sourceTools: ["websearch"],
        },
      }));

      expect(weakGather.phase).toBe("gather");
      expect(weakGather.results.researchQuality.quality).toBe("weak");

      const blockedAnalyze = await parseResult(handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "stock-ta-integration",
        phase: "analyze",
        content: "Synthesize whether technical analysis works in stock markets and what caveats matter most.",
        messages: [],
      }));

      expect(blockedAnalyze.results.blocked).toBe(true);
      expect(blockedAnalyze.nextPhase).toBe("gather");
      expect(blockedAnalyze.directive).toContain("evidence is still weak");

      const strongGather = await parseResult(handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "stock-ta-integration",
        phase: "gather",
        content: [
          "## External evidence batch",
          "### Web research summary",
          "According to Reuters coverage and multiple academic studies, momentum and trend-following signals have shown persistence in some futures and equity datasets, but much of the headline edge shrinks after transaction costs.",
          "### GitHub research notes",
          "A public backtest repository comparing 50/200-day moving-average, breakout, and volatility-filter strategies reported regime dependence: performance improved in trending markets and degraded in noisy sideways periods.",
          "### Counterarguments",
          "Weak-form EMH critiques and data-snooping papers argue that many chart patterns disappear out of sample, especially after parameter tuning and realistic slippage assumptions are applied.",
          "### Key numeric details",
          "One summarized sample reported roughly a 12% annualized return differential before costs, a 35-60 bps monthly decay after fees in some implementations, and profitable systems with 45-50% win rates when payoff ratios stayed above 2:1.",
          "### Source bundle",
          "https://www.reuters.com/markets/example-technical-analysis-study",
          "https://github.com/example/technical-analysis-backtests",
          "https://papers.ssrn.com/example-technical-analysis-emh",
        ].join("\n"),
        messages: [],
        metadata: {
          sourceTools: ["vscode-websearchforcopilot_webSearch", "github_repo", "fetch_webpage"],
        },
      }));

      expect(["developing", "strong"]).toContain(strongGather.results.researchQuality.quality);
      expect(strongGather.results.researchQuality.cumulativeEvidenceScore).toBeGreaterThanOrEqual(0.45);

      const analyzeResult = await parseResult(handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "stock-ta-integration",
        phase: "analyze",
        content: "Synthesize what technical analysis can and cannot claim in stock markets, with emphasis on regime dependence, execution costs, and risk management.",
        messages: [],
      }));

      expect(analyzeResult.phase).toBe("analyze");
      expect(analyzeResult.results.blocked).toBeUndefined();
      expect(analyzeResult.nextPhase).toBe("verify");
      expect(analyzeResult.results.recalledMemories.count).toBeGreaterThan(0);
      expect(analyzeResult.layersExecuted).toContain("REASONING:kagthinker_solve");
      expect(analyzeResult.layersExecuted).toContain("REASONING:mindevolution_solve");
    } finally {
      harness.destroy();
    }
  });

  it("finalize preserves batch boundaries, exposes coverage, and supports chunk retrieval", async () => {
    const harness = createHarness();

    try {
      await handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "finalize-export-manifest",
        phase: "init",
        content: "Build a comprehensive technical-analysis report for stock markets with explicit evidence handling.",
        messages: [{ role: "user", content: "Need the final export to preserve every research batch.", turn: 1 }],
      });

      await handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "finalize-export-manifest",
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
      });

      await handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "finalize-export-manifest",
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
      });

      await handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "finalize-export-manifest",
        phase: "analyze",
        content: "Synthesize the implications of the gathered technical-analysis evidence with emphasis on market regime and execution costs.",
        messages: [],
      });

      harness.store.setState("finalize-export-manifest", "pipeline_phase", "verify", "test");
      harness.store.setState("finalize-export-manifest", "pipeline_verify_passed", true, "test");
      harness.store.setState("finalize-export-manifest", "pipeline_last_verify_action", "proceed", "test");

      const finalizeManifest = await parseResult(handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "finalize-export-manifest",
        phase: "finalize",
        content: "Integrated final summary: technical analysis may retain conditional value in stocks when regime filtering, execution costs, and disciplined risk management are handled explicitly.",
        messages: [],
      }));

      expect(finalizeManifest.layersExecuted).toContain("STATE:get_history_summary");
      expect(finalizeManifest.results.exportPlan.preserveBatchBoundaries).toBe(true);
      expect(finalizeManifest.results.exportPlan.totalGatherBatches).toBe(2);
      expect(finalizeManifest.results.exportPlan.totalChunks).toBeGreaterThanOrEqual(3);
      expect(finalizeManifest.results.coverage.totalUnderlyingToolEquivalents).toBe(34);
      expect(finalizeManifest.results.coverage.allUnderlyingToolEquivalentsCovered).toBe(true);

      const firstChunk = await parseResult(handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "finalize-export-manifest",
        phase: "finalize",
        content: "",
        messages: [],
        metadata: {
          exportChunkIndex: 1,
        },
      }));

      expect(firstChunk.results.exportChunk.chunkIndex).toBe(1);
      expect(firstChunk.results.exportChunk.title).toContain("Batch 1");
      expect(firstChunk.results.exportChunk.content).toContain("External evidence batch one");
      expect(firstChunk.directive).toContain("Write this chunk to disk");
    } finally {
      harness.destroy();
    }
  });

  it("finalize proceeds without verify but includes warning", async () => {
    const harness = createHarness();

    try {
      await handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "finalize-blocked",
        phase: "init",
        content: "Research technical analysis.",
        messages: [{ role: "user", content: "Need a verified report.", turn: 1 }],
      });

      const result = await parseResult(handleResearchPipeline(harness.store, harness.catalog, harness.memory, harness.siloManager, {
        sessionId: "finalize-blocked",
        phase: "finalize",
        content: "Final report",
        messages: [],
      }));

      // Finalize no longer blocks on verify (Round 5) — runs with a warning instead
      expect(result.phase).toBe("finalize");
      expect(result.directive).toContain("WARNING");
      expect(result.directive).toContain("Verify phase did not pass");
    } finally {
      harness.destroy();
    }
  });
});