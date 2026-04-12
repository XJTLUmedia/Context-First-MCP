/**
 * Loop Freshness Tracker — cross-tool enforcement mechanism.
 *
 * Tracks when context_loop was last called per session and how many
 * non-loop tool calls have occurred since. Injects reminder text into
 * other tool responses when the loop is stale.
 */

interface LoopCallRecord {
  lastCalledAt: Date;
  toolCallsSinceLast: number;
}

const records = new Map<string, LoopCallRecord>();

const STALE_TOOL_CALL_THRESHOLD = 3;

/**
 * Record that context_loop was just called for this session.
 */
export function recordLoopCall(sessionId: string): void {
  records.set(sessionId, {
    lastCalledAt: new Date(),
    toolCallsSinceLast: 0,
  });
}

/**
 * Record that a non-loop tool was called. Returns a reminder string
 * if the loop is stale (too many tool calls since last context_loop),
 * or null if the loop is fresh.
 */
export function recordToolCallAndCheckFreshness(sessionId: string): string | null {
  const record = records.get(sessionId);

  if (!record) {
    // context_loop has NEVER been called this session
    return `⚠️ IMPORTANT: You have not called context_loop yet this session. ` +
      `Call context_loop BEFORE proceeding with more work. ` +
      `It checks context health, detects contradictions, verifies depth, and tells you what to do next. ` +
      `Minimal call: { "messages": [{"role":"user","content":"<current task>","turn":1}] }`;
  }

  record.toolCallsSinceLast++;

  if (record.toolCallsSinceLast >= STALE_TOOL_CALL_THRESHOLD) {
    const count = record.toolCallsSinceLast;
    return `⚠️ context_loop reminder: ${count} tool calls since last context_loop. ` +
      `Call context_loop now to check for contradictions, verify depth, and maintain context health. ` +
      `Include recent messages for best results.`;
  }

  return null;
}

/**
 * Get current freshness status for a session.
 */
export function getLoopFreshness(sessionId: string): {
  everCalled: boolean;
  toolCallsSinceLast: number;
  isStale: boolean;
} {
  const record = records.get(sessionId);
  if (!record) {
    return { everCalled: false, toolCallsSinceLast: 0, isStale: true };
  }
  return {
    everCalled: true,
    toolCallsSinceLast: record.toolCallsSinceLast,
    isStale: record.toolCallsSinceLast >= STALE_TOOL_CALL_THRESHOLD,
  };
}
