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
  action: "proceed" | "clarify" | "reset" | "abstain" | "deepen" | "verify";
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
  /**
   * Depth analysis: is the output deeply elaborated or surface-level?
   * null if no assistant output to check.
   */
  depth: {
    depthScore: number;
    isLazy: boolean;
    shallowSections: string[];
    elaborationDirectives: string[];
  } | null;
  /**
   * Internal state probing: truthfulness signals from proxy activation analysis.
   * null if no assistant output to probe.
   */
  internalState: {
    overallTruthfulness: number;
    likelyTrueCount: number;
    uncertainCount: number;
    likelyFalseCount: number;
  } | null;
  /**
   * Neighborhood consistency: robustness of response under perturbation.
   * null if no query/response to test.
   */
  neighborhood: {
    ncbScore: number;
    verdict: "robust" | "brittle" | "mixed";
    genuineKnowledgeConfidence: number;
  } | null;
  /**
   * Verification result from verify-first strategy.
   * null if no candidate answer to verify.
   */
  verification: {
    overallScore: number;
    recommendation: "accept" | "revise" | "reject";
  } | null;
  /**
   * Truth direction analysis: alignment of claims with ground truth.
   * null if no assistant output or ground truth to check.
   */
  truthDirection: {
    overallAlignment: number;
    deviantClaimCount: number;
    coherentDirectionDetected: boolean;
    warnings: string[];
  } | null;
  /**
   * Logical consistency check across claims.
   * null if no claims extracted to check.
   */
  logicalConsistency: {
    consistencyScore: number;
    inconsistentCount: number;
    trustLevel: "high" | "medium" | "low";
    recommendations: string[];
  } | null;
  /**
   * IoE self-correction result.
   * null if no response to correct.
   */
  ioeCorrection: {
    action: "accept" | "correct" | "escalate";
    improved: boolean;
    correctionCount: number;
    preConfidence: number;
    postConfidence: number | null;
    escalationQuestions: string[];
  } | null;
  /**
   * Self-critique iteration result.
   * null if no solution to critique.
   */
  selfCritique: {
    initialQuality: number;
    finalQuality: number;
    totalImprovement: number;
    converged: boolean;
    remainingIssues: string[];
  } | null;
}

/**
 * Machine-readable constraint that an MCP client can programmatically enforce.
 * This makes the directive less LLM-dependent — the client can check these
 * without relying on the LLM reading natural language instructions.
 */
export interface DirectiveConstraint {
  /** Constraint type */
  type: "must_ask" | "must_not_answer" | "must_reset" | "must_verify" | "must_ground" | "must_deepen" | "must_verify_claims" | "must_correct" | "must_check_truth" | "must_check_logic" | "must_self_correct" | "must_self_critique";
  /** What this constraint applies to */
  scope: string;
  /** Human-readable reason */
  reason: string;
}

// ─── Depth Quality Types (arXiv:2512.20662 — Laziness Detection) ───

/**
 * A detected content section with its depth metrics.
 */
export interface DepthSection {
  /** Section heading or identifier */
  heading: string;
  /** Word count in this section */
  wordCount: number;
  /** Sentence count */
  sentenceCount: number;
  /** Detail density: ratio of specific/technical terms to total words */
  detailDensity: number;
  /** Whether this section is shallow (below depth threshold) */
  isShallow: boolean;
}

/**
 * Result of the depth quality analysis.
 * Detects LLM laziness patterns: broad coverage with shallow elaboration.
 */
export interface DepthResult {
  /** Overall depth score (0-1). 1 = deeply elaborated, 0 = surface-level */
  depthScore: number;
  /** Breadth score (0-1). High breadth + low depth = laziness pattern */
  breadthScore: number;
  /** Laziness indicator: true if output covers many topics shallowly */
  isLazy: boolean;
  /** Number of sections detected */
  sectionCount: number;
  /** Average words per section */
  avgWordsPerSection: number;
  /** Sections that need more elaboration */
  shallowSections: DepthSection[];
  /** Specific elaboration instructions for the LLM */
  elaborationDirectives: string[];
  /** Overall recommendation */
  recommendation: string;
}

// ─── InftyThink Types (Iterative Reasoning with Sawtooth Summarization) ───

/**
 * A single bounded-length reasoning segment in the InftyThink pipeline.
 */
export interface InftyThinkSegment {
  /** Segment index (0-based) */
  index: number;
  /** The reasoning content produced in this segment */
  reasoning: string;
  /** Compressed summary of this segment for carry-forward */
  summary: string;
  /** Token count of the reasoning */
  tokenCount: number;
  /** Token count of the compressed summary */
  summaryTokenCount: number;
  /** Compression ratio: summaryTokenCount / tokenCount */
  compressionRatio: number;
  /** Whether this segment reached the token budget limit */
  hitBudgetLimit: boolean;
}

/**
 * Result of the InftyThink iterative reasoning pipeline.
 * Transforms monolithic CoT into bounded segments with intermediate summarization.
 */
export interface InftyThinkResult {
  /** All reasoning segments produced */
  segments: InftyThinkSegment[];
  /** Final consolidated answer after all segments */
  finalAnswer: string;
  /** Total segments executed */
  totalSegments: number;
  /** Total tokens consumed across all segments */
  totalTokens: number;
  /** Total tokens in summaries (the "sawtooth" carry-forward cost) */
  totalSummaryTokens: number;
  /** Effective compression: totalSummaryTokens / totalTokens */
  overallCompression: number;
  /** Whether reasoning converged (stopped producing new insights) */
  converged: boolean;
  /** Convergence reason if applicable */
  convergenceReason: string;
  /** Depth achieved (number of reasoning layers) */
  depthAchieved: number;
}

// ─── Coconut Types (Chain of Continuous Thought — Latent Space Reasoning) ───

/**
 * A single continuous thought state in the Coconut pipeline.
 * Represents reasoning in latent space rather than natural language tokens.
 */
export interface ContinuousThought {
  /** Step index */
  step: number;
  /** The latent representation (simulated as a compact numeric vector) */
  latentState: number[];
  /** Decoded interpretation of the latent state (for human readability) */
  decodedInterpretation: string;
  /** Breadth: number of parallel reasoning paths explored at this step */
  breadth: number;
  /** Confidence in this thought step */
  confidence: number;
}

/**
 * Result of the Coconut continuous thought reasoning pipeline.
 * Avoids the "language space" bottleneck by reasoning in latent representations.
 */
export interface CoconutResult {
  /** Sequence of continuous thought states */
  thoughts: ContinuousThought[];
  /** Final decoded answer from the last latent state */
  finalAnswer: string;
  /** Total steps of latent reasoning */
  totalSteps: number;
  /** Token equivalent: how many language tokens this reasoning would have consumed */
  tokenEquivalent: number;
  /** Actual latent operations (much lower than tokenEquivalent) */
  latentOperations: number;
  /** Compression factor: tokenEquivalent / latentOperations */
  compressionFactor: number;
  /** Whether a BFS-like breadth exploration was used */
  usedBreadthExploration: boolean;
  /** Planning quality score: how well the latent reasoning planned ahead */
  planningScore: number;
}

// ─── Extra-CoT Types (Extreme Token Compression for Reasoning) ───

/**
 * A compressed reasoning step in the Extra-CoT pipeline.
 */
export interface CompressedStep {
  /** Step index */
  index: number;
  /** Original reasoning text */
  original: string;
  /** Compressed reasoning text (semantically preserved) */
  compressed: string;
  /** Original token count */
  originalTokens: number;
  /** Compressed token count */
  compressedTokens: number;
  /** Compression ratio for this step */
  ratio: number;
  /** Semantic fidelity score (0-1): how well meaning is preserved */
  semanticFidelity: number;
}

/**
 * Result of the Extra-CoT extreme compression pipeline.
 * Maximizes reasoning depth under a restricted token budget.
 */
export interface ExtraCoTResult {
  /** All compressed reasoning steps */
  steps: CompressedStep[];
  /** Final answer derived from compressed chain */
  finalAnswer: string;
  /** Total original tokens in the reasoning chain */
  totalOriginalTokens: number;
  /** Total compressed tokens */
  totalCompressedTokens: number;
  /** Overall compression ratio */
  overallCompressionRatio: number;
  /** Average semantic fidelity across all steps */
  avgSemanticFidelity: number;
  /** Budget utilization: compressedTokens / maxBudget */
  budgetUtilization: number;
  /** Number of reasoning steps that fit within budget */
  stepsWithinBudget: number;
  /** Whether the token budget was exceeded (pre-compression) */
  budgetExceeded: boolean;
}

// ─── Mind Evolution Types (Evolutionary Search for Reasoning) ───

/**
 * A candidate solution in the Mind Evolution search.
 */
export interface EvolutionCandidate {
  /** Candidate ID */
  id: string;
  /** Generation number (0 = initial population) */
  generation: number;
  /** The candidate response/solution text */
  response: string;
  /** Fitness score (0-1) */
  fitness: number;
  /** Parent candidate IDs (empty for generation 0) */
  parentIds: string[];
  /** Mutation type applied to create this candidate */
  mutationType: "initial" | "crossover" | "refine" | "random";
  /** Whether this candidate survived selection */
  survived: boolean;
}

/**
 * Result of the Mind Evolution evolutionary search pipeline.
 * Explores solution space through generation, recombination, and refinement.
 */
export interface MindEvolutionResult {
  /** Best candidate found */
  bestCandidate: EvolutionCandidate;
  /** All candidates across all generations */
  allCandidates: EvolutionCandidate[];
  /** Final answer from the best candidate */
  finalAnswer: string;
  /** Total generations run */
  totalGenerations: number;
  /** Population size per generation */
  populationSize: number;
  /** Fitness progression: best fitness per generation */
  fitnessProgression: number[];
  /** Whether the search converged (fitness plateau) */
  converged: boolean;
  /** Diversity score: how varied the final population is */
  diversityScore: number;
  /** Total candidates evaluated */
  totalEvaluated: number;
}

// ─── KAG-Thinker Types (Structured Interactive Thinking) ───

/**
 * A logical form representing a decomposed sub-problem.
 */
export interface LogicalForm {
  /** Unique ID for this logical form */
  id: string;
  /** The sub-problem expressed as a structured logical form */
  expression: string;
  /** Natural language description of this sub-problem */
  description: string;
  /** Dependencies: IDs of logical forms that must be solved first */
  dependencies: string[];
  /** Resolution status */
  status: "pending" | "in-progress" | "resolved" | "failed";
  /** Resolution result if solved */
  result?: string;
  /** Confidence in this resolution */
  confidence: number;
  /** Depth level in the decomposition tree */
  depth: number;
}

/**
 * Result of the KAG-Thinker structured interactive thinking pipeline.
 * Simulates human cognitive mechanisms through structured logical decomposition.
 */
export interface KAGThinkerResult {
  /** All logical forms in the decomposition */
  logicalForms: LogicalForm[];
  /** Final synthesized answer */
  finalAnswer: string;
  /** Total sub-problems decomposed */
  totalSubProblems: number;
  /** Successfully resolved sub-problems */
  resolvedCount: number;
  /** Failed sub-problems */
  failedCount: number;
  /** Maximum depth of the decomposition tree */
  maxDepth: number;
  /** Whether all sub-problems were resolved */
  fullyResolved: boolean;
  /** Interactive steps taken (back-and-forth reasoning) */
  interactiveSteps: number;
  /** Structured reasoning stability score (0-1) */
  stabilityScore: number;
  /** Dependency graph as adjacency list */
  dependencyGraph: Record<string, string[]>;
}

// ─── Layer 5: Truthfulness & Self-Verification Types ───

// ─── Internal State Probing (arXiv: "The Internal State of an LLM Knows When It's Lying") ───

/**
 * Classification of a single claim via proxy activation probing.
 */
export interface ClaimClassification {
  /** The claim text */
  claim: string;
  /** Predicted truthfulness probability (0-1) */
  truthProbability: number;
  /** Proxy activation signals used for classification */
  activationSignals: {
    /** Assertion strength: how confidently the claim is stated */
    assertionStrength: number;
    /** Epistemic marker score: presence of uncertainty markers lowers this */
    epistemicCertainty: number;
    /** Factual grounding: alignment with known facts */
    factualAlignment: number;
    /** Hedging density: inverse of hedge word frequency */
    hedgingDensity: number;
    /** Self-consistency: does the claim contradict other claims in the same output? */
    selfConsistency: number;
  };
  /** Classification: "likely_true" | "uncertain" | "likely_false" */
  classification: "likely_true" | "uncertain" | "likely_false";
}

/**
 * Result of internal state probing across an LLM output.
 * Simulates hidden-layer activation classification via linguistic proxy signals.
 */
export interface InternalStateResult {
  /** Overall truthfulness score (0-1) */
  overallTruthfulness: number;
  /** Per-claim classifications */
  claims: ClaimClassification[];
  /** Number of claims classified as likely true */
  likelyTrueCount: number;
  /** Number of uncertain claims */
  uncertainCount: number;
  /** Number of claims classified as likely false */
  likelyFalseCount: number;
  /** Proxy activation summary (averaged across claims) */
  aggregateActivation: {
    avgAssertionStrength: number;
    avgEpistemicCertainty: number;
    avgFactualAlignment: number;
    avgHedgingDensity: number;
    avgSelfConsistency: number;
  };
  /** Recommendations based on internal state analysis */
  recommendations: string[];
}

// ─── Truth Direction Analysis (arXiv: "Consistency and Generalization of Truth Directions") ───

/**
 * A single claim's truth direction analysis.
 */
export interface TruthDirectionClaim {
  /** The claim text */
  claim: string;
  /** Projected truth direction score (-1 to 1): positive = truth, negative = falsehood */
  truthDirectionScore: number;
  /** Cross-claim consistency: does this claim align with the truth direction of other claims? */
  crossClaimConsistency: number;
  /** Deviation from established truth direction */
  deviationMagnitude: number;
  /** Whether this claim deviates significantly from the truth direction */
  isDeviant: boolean;
}

/**
 * Result of truth direction analysis.
 * Detects whether model outputs encode a consistent "truth direction" feature.
 */
export interface TruthDirectionResult {
  /** Overall truth direction alignment score (0-1) */
  overallAlignment: number;
  /** Per-claim truth direction analysis */
  claims: TruthDirectionClaim[];
  /** Detected truth direction vector (simplified as key feature weights) */
  truthVector: {
    factConsistency: number;
    linguisticConfidence: number;
    logicalCoherence: number;
    sourceAttribution: number;
  };
  /** Claims that deviate from the truth direction */
  deviantClaims: string[];
  /** Inter-claim consistency score */
  interClaimConsistency: number;
  /** Whether a coherent truth direction was detected */
  coherentDirectionDetected: boolean;
  /** Warnings about potential hallucination */
  warnings: string[];
}

// ─── Neighbor-Consistency Belief (NCB) — "Illusions of Confidence?" ───

/**
 * A perturbation applied to test response coherence.
 */
export interface NCBPerturbation {
  /** Type of perturbation */
  type: "paraphrase" | "implication" | "negation" | "thematic_shift" | "specificity_change";
  /** The perturbed query or context */
  perturbedText: string;
  /** Expected consistency with original response */
  expectedConsistency: "high" | "medium" | "low";
  /** Actual consistency score (0-1) */
  actualConsistency: number;
  /** Whether the response remained coherent */
  isCoherent: boolean;
}

/**
 * Result of Neighbor-Consistency Belief analysis.
 * Tests response robustness across a "conceptual neighborhood" of perturbations.
 */
export interface NCBResult {
  /** Original response being tested */
  originalResponse: string;
  /** Overall NCB score (0-1): 1 = perfectly consistent across neighborhood */
  ncbScore: number;
  /** Perturbations applied and their results */
  perturbations: NCBPerturbation[];
  /** Brittle knowledge areas where consistency breaks down */
  brittleAreas: string[];
  /** Robust knowledge areas that remain consistent */
  robustAreas: string[];
  /** Overall verdict: "robust" | "brittle" | "mixed" */
  verdict: "robust" | "brittle" | "mixed";
  /** Confidence that the response reflects genuine knowledge vs surface pattern */
  genuineKnowledgeConfidence: number;
  /** Recommendations */
  recommendations: string[];
}

// ─── Logical Consistency — "Logical Consistency of LLMs in Fact Checking" ───

/**
 * A logical transformation applied to test consistency.
 */
export interface LogicalTransformation {
  /** Type of logical operation */
  type: "negation" | "conjunction" | "disjunction" | "implication" | "contrapositive" | "biconditional";
  /** The original proposition */
  original: string;
  /** The transformed proposition */
  transformed: string;
  /** Expected logical relationship */
  expectedRelation: "consistent" | "contradictory" | "independent";
  /** Actual detected relationship */
  actualRelation: "consistent" | "contradictory" | "independent";
  /** Whether the logical relationship holds */
  isConsistent: boolean;
  /** Confidence in this consistency check */
  confidence: number;
}

/**
 * Result of logical consistency analysis.
 * Tests whether claims remain consistent under logical transformations.
 */
export interface LogicalConsistencyResult {
  /** Overall logical consistency score (0-1) */
  consistencyScore: number;
  /** All transformations applied and results */
  transformations: LogicalTransformation[];
  /** Number of consistent transformations */
  consistentCount: number;
  /** Number of inconsistent transformations */
  inconsistentCount: number;
  /** Specific inconsistencies found */
  inconsistencies: Array<{
    claim1: string;
    claim2: string;
    relationship: string;
    explanation: string;
  }>;
  /** Whether the output is trustworthy without external verification */
  trustworthyWithoutVerification: boolean;
  /** Trust level: "high" | "medium" | "low" */
  trustLevel: "high" | "medium" | "low";
  /** Recommendations for improving consistency */
  recommendations: string[];
}

// ─── Verification-First Strategy — "Asking LLMs to Verify First is Almost Free Lunch" ───

/**
 * A verification check applied to a candidate answer.
 */
export interface VerificationCheck {
  /** Dimension being verified */
  dimension: "relevance" | "factual_support" | "internal_coherence" | "completeness" | "specificity";
  /** Score for this dimension (0-1) */
  score: number;
  /** Issues found in this dimension */
  issues: string[];
  /** Whether this dimension passes */
  passes: boolean;
}

/**
 * Result of verification-first analysis.
 * Evaluates an answer BEFORE committing to it.
 */
export interface VerifyFirstResult {
  /** The candidate answer being evaluated */
  candidateAnswer: string;
  /** Overall verification score (0-1) */
  verificationScore: number;
  /** Per-dimension verification checks */
  checks: VerificationCheck[];
  /** Whether the answer should be accepted */
  shouldAccept: boolean;
  /** If not accepted, suggested improvements */
  suggestedImprovements: string[];
  /** Estimated effort to fix (low/medium/high) */
  fixEffort: "low" | "medium" | "high";
  /** Alternative framing suggestions */
  alternativeFramings: string[];
  /** Verification took fewer "cognitive resources" than regeneration would */
  verificationCheaperThanRegeneration: boolean;
}

// ─── If-or-Else (IoE) Self-Correction — Confidence-Based Self-Correction ───

/**
 * Confidence assessment across multiple dimensions for IoE.
 */
export interface IoEConfidenceAssessment {
  /** Linguistic confidence: assertion strength, hedge absence */
  linguisticConfidence: number;
  /** Knowledge confidence: alignment with known facts */
  knowledgeConfidence: number;
  /** Reasoning confidence: logical chain strength */
  reasoningConfidence: number;
  /** Overall confidence (weighted combination) */
  overallConfidence: number;
  /** Confidence level classification */
  level: "high" | "medium" | "low";
}

/**
 * A correction applied during IoE self-correction.
 */
export interface IoECorrection {
  /** What was corrected */
  target: string;
  /** Original text */
  original: string;
  /** Corrected text */
  corrected: string;
  /** Reason for correction */
  reason: string;
  /** Confidence improvement from this correction */
  confidenceImprovement: number;
}

/**
 * Result of If-or-Else self-correction.
 * Model assesses confidence and decides whether to accept, correct, or escalate.
 */
export interface IoEResult {
  /** The original response */
  originalResponse: string;
  /** The final response (may be corrected) */
  finalResponse: string;
  /** Action taken: accept (high confidence), correct (medium), escalate (low) */
  action: "accept" | "correct" | "escalate";
  /** Pre-correction confidence assessment */
  preConfidence: IoEConfidenceAssessment;
  /** Post-correction confidence assessment (if corrected) */
  postConfidence: IoEConfidenceAssessment | null;
  /** Corrections applied */
  corrections: IoECorrection[];
  /** Whether self-correction improved the response */
  improved: boolean;
  /** Escalation questions (if action is "escalate") */
  escalationQuestions: string[];
  /** Total iterations of correction */
  correctionIterations: number;
}

// ─── Iterative Self-Critique — "Enhancing LLM Planning through Intrinsic Self-Critique" ───

/**
 * A single iteration of self-critique.
 */
export interface CritiqueIteration {
  /** Iteration number (0-based) */
  iteration: number;
  /** The solution at this iteration */
  solution: string;
  /** Critique findings */
  critiques: Array<{
    aspect: string;
    issue: string;
    severity: "critical" | "major" | "minor";
    suggestion: string;
  }>;
  /** Refinements applied */
  refinements: string[];
  /** Quality score after this iteration (0-1) */
  qualityScore: number;
  /** Improvement delta from previous iteration */
  improvementDelta: number;
}

/**
 * Result of iterative self-critique.
 * Model iteratively reviews and refines its own solution until convergence.
 */
export interface SelfCritiqueResult {
  /** Initial solution before any critique */
  initialSolution: string;
  /** Final refined solution */
  finalSolution: string;
  /** All critique iterations */
  iterations: CritiqueIteration[];
  /** Total iterations performed */
  totalIterations: number;
  /** Initial quality score */
  initialQuality: number;
  /** Final quality score */
  finalQuality: number;
  /** Total improvement (finalQuality - initialQuality) */
  totalImprovement: number;
  /** Whether critique converged (no more significant issues found) */
  converged: boolean;
  /** Convergence reason */
  convergenceReason: string;
  /** Aspects that improved most */
  topImprovements: string[];
  /** Remaining issues (if any) */
  remainingIssues: string[];
}

export interface UnifiedLoopResult {
  sessionId: string;
  action: "proceed" | "clarify" | "reset" | "abstain" | "deepen" | "verify";
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
  depth: DepthResult | null;
  internalState: InternalStateResult | null;
  neighborhood: NCBResult | null;
  verification: VerifyFirstResult | null;
  truthDirection: TruthDirectionResult | null;
  logicalConsistency: LogicalConsistencyResult | null;
  ioeCorrection: IoEResult | null;
  selfCritique: SelfCritiqueResult | null;
  timestamp: Date;
}
