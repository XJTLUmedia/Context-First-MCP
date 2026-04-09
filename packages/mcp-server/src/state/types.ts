/**
 * State type definitions for the Context-First MCP server.
 */

export interface GroundTruthEntry {
  value: unknown;
  lockedAt: Date;
  source: string;
}

export interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
  turn: number;
  timestamp: Date;
}

export interface ConflictEntry {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  description: string;
  detectedAt: Date;
}

export interface RecapResult {
  summary: string;
  hiddenIntents: string[];
  keyDecisions: string[];
  turn: number;
  generatedAt: Date;
}

export interface ConversationState {
  sessionId: string;
  groundTruth: Map<string, GroundTruthEntry>;
  history: HistoryEntry[];
  conflicts: ConflictEntry[];
  lastRecap: RecapResult | null;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface AmbiguityResult {
  isAmbiguous: boolean;
  score: number; // 0-1, higher = more ambiguous
  clarifyingQuestions: string[];
  underspecifiedAreas: string[];
}

export interface VerificationResult {
  isVerified: boolean;
  confidence: number; // 0-1
  issues: string[];
  matchedIndicators: string[];
  missedIndicators: string[];
}

export interface ConflictDetectionResult {
  hasConflicts: boolean;
  conflicts: Array<{
    existingKey: string;
    existingValue: unknown;
    conflictingStatement: string;
    severity: "low" | "medium" | "high";
    suggestion: string;
  }>;
}

export interface HistorySummary {
  summary: string;
  totalTurns: number;
  keyDecisions: string[];
  openQuestions: string[];
  topicProgression: string[];
}

// ─── Layer 2 Types ───

export interface QuarantineSilo {
  siloId: string;
  name: string;
  parentSessionId: string;
  state: Map<string, GroundTruthEntry>;
  context: string;
  results: unknown[];
  createdAt: Date;
  ttl: number; // milliseconds, default 300_000 (5 min)
  status: "active" | "merged" | "expired";
}

export interface EntropyMetrics {
  lexicalDiversity: number;
  contradictionDensity: number;
  hedgeWordFrequency: number;
  repetitionScore: number;
  compositeScore: number;
}

export interface EntropyResult {
  metrics: EntropyMetrics;
  spikeDetected: boolean;
  threshold: number;
  recommendation: "normal" | "ergo_reset";
  window: Array<{ turn: number; score: number }>;
}

export interface ToolRegistryEntry {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  tags: string[];
  tfidfVector?: number[];
}

export interface DiscoveryResult {
  matches: Array<{
    toolName: string;
    description: string;
    relevanceScore: number;
    tags: string[];
    inputSchema: Record<string, unknown>;
  }>;
  totalCandidates: number;
  query: string;
}

export interface AbstentionResult {
  shouldAbstain: boolean;
  confidence: number;
  dimensions: {
    stateCompleteness: number;
    recency: number;
    contradictionFree: number;
    ambiguityFree: number;
    sourceQuality: number;
  };
  missingInfo: string[];
  suggestedQuestions: string[];
}

// ─── Unified Context Loop Types ───

export interface UnifiedLoopStage {
  name: string;
  status: "completed" | "skipped" | "error";
  durationMs: number;
  result: unknown;
}

export interface UnifiedLoopResult {
  sessionId: string;
  action: "proceed" | "clarify" | "reset" | "abstain";
  summary: string;
  stages: UnifiedLoopStage[];
  recap: {
    summary: string;
    hiddenIntents: string[];
    keyDecisions: string[];
  } | null;
  conflicts: ConflictDetectionResult | null;
  ambiguity: AmbiguityResult | null;
  entropy: {
    metrics: EntropyMetrics;
    spikeDetected: boolean;
    recommendation: string;
  } | null;
  abstention: {
    shouldAbstain: boolean;
    confidence: number;
    suggestedQuestions: string[];
  } | null;
  discovery: {
    suggestedTools: Array<{ toolName: string; relevanceScore: number }>;
  } | null;
  timestamp: Date;
}
