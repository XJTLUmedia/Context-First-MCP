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

// ─── Grounding & Drift Types (arXiv:2602.13224, arXiv:2503.15560) ───

/**
 * Result of the Semantic Grounding Index check.
 * Three-dimensional: factual overlap, context adherence, falsifiability.
 */
export interface GroundingResult {
  isGrounded: boolean;
  score: number; // 0-1 composite
  dimensions: {
    factualGrounding: number; // TF-IDF overlap between claims and stored facts
    contextAdherence: number; // Topic envelope coverage
    falsifiability: number; // Confident claims contradicting ground truth (inverted: 1 = no contradictions)
  };
  ungroundedClaims: string[];
  suggestions: string[];
}

/**
 * A single health snapshot recorded per turn for drift analysis.
 */
export interface DriftWindow {
  turn: number;
  health: number;
  breakdown: Record<string, number>;
  timestamp: Date;
}

/**
 * Result of temporal drift detection across a sliding window of turns.
 */
export interface DriftResult {
  hasDrift: boolean;
  driftType: "none" | "sudden_shift" | "gradual_decay" | "oscillation";
  severity: number; // 0-1
  trend: "stable" | "improving" | "degrading" | "unstable";
  riskScore: number; // progressive accumulation; ≥ 0.7 = critical
  window: DriftWindow[];
  recommendation: string;
}

// ─── Unified Context Loop Types ───

export interface UnifiedLoopStage {
  name: string;
  status: "completed" | "skipped" | "error";
  durationMs: number;
  result: unknown;
}

/**
 * LLM-facing directive: compact, actionable instruction that tells the LLM
 * exactly what to do next without parsing nested stage results.
 */
export interface LoopDirective {
  /** What the LLM should do next */
  action: "proceed" | "clarify" | "reset" | "abstain";
  /** Human-readable instruction for the LLM */
  instruction: string;
  /** Aggregated questions from all stages (ambiguity + abstention + conflict suggestions) */
  questions: string[];
  /** 0-1 composite health score. 1 = perfectly healthy context, 0 = completely degraded */
  contextHealth: number;
  /** Key facts auto-extracted from conversation and stored as ground truth */
  autoExtractedFacts: Record<string, string>;
  /** If discovery found external tools the LLM should consider using */
  suggestedNextTools: string[];
  /**
   * Machine-readable constraints the MCP client MUST enforce.
   * Unlike `instruction` (which the LLM can ignore), these are structured rules.
   */
  constraints: DirectiveConstraint[];
  /**
   * Grounding verdict: are the assistant's recent claims grounded in stored facts?
   * null if no ground truth or assistant output to check.
   */
  grounding: {
    isGrounded: boolean;
    score: number;
    ungroundedClaims: string[];
  } | null;
  /**
   * Temporal drift status: is the context health trending down?
   * null if insufficient turn history for drift analysis.
   */
  drift: {
    hasDrift: boolean;
    driftType: string;
    severity: number;
    trend: string;
    riskScore: number;
  } | null;
}

/**
 * Machine-readable constraint that an MCP client can programmatically enforce.
 * This makes the directive less LLM-dependent — the client can check these
 * without relying on the LLM reading natural language instructions.
 */
export interface DirectiveConstraint {
  /** Constraint type */
  type: "must_ask" | "must_not_answer" | "must_reset" | "must_verify" | "must_ground";
  /** What this constraint applies to */
  scope: string;
  /** Human-readable reason */
  reason: string;
}

export interface UnifiedLoopResult {
  sessionId: string;
  action: "proceed" | "clarify" | "reset" | "abstain";
  summary: string;
  /** LLM-facing directive: the single object an LLM should read to decide its next move */
  directive: LoopDirective;
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
  grounding: GroundingResult | null;
  drift: DriftResult | null;
  timestamp: Date;
}
