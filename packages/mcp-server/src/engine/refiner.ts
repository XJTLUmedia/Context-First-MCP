import type { HistoryEntry, RecapResult } from "../state/types.js";
import nlp from "compromise";

/**
 * Heuristic-based conversation refiner.
 * Analyzes conversation history, extracts key decisions and hidden intents.
 * No external LLM required.
 */

/** Extract sentences that look like decisions or confirmations */
function extractDecisions(messages: HistoryEntry[]): string[] {
  const decisionPatterns = [
    /\b(?:decided|confirmed|agreed|chose|selected|going with|will use|let'?s go with)\b/i,
    /\b(?:the plan is|we'?ll|i'?ll|final answer|settled on)\b/i,
    /\b(?:approved|locked in|committed to)\b/i,
  ];
  const decisions: string[] = [];
  for (const msg of messages) {
    const sentences = msg.content.split(/[.!?]+/).filter((s) => s.trim());
    for (const sentence of sentences) {
      if (decisionPatterns.some((p) => p.test(sentence))) {
        decisions.push(sentence.trim());
      }
    }
  }
  return [...new Set(decisions)].slice(0, 20);
}

/** Extract potential hidden intents — things implied but not stated directly */
function extractHiddenIntents(messages: HistoryEntry[]): string[] {
  const intents: string[] = [];
  const intentPatterns: Array<{ pattern: RegExp; label: string }> = [
    {
      pattern: /\b(?:maybe|perhaps|possibly|might want to|could also)\b/i,
      label: "Tentative preference detected",
    },
    {
      pattern: /\b(?:but|however|although|on the other hand)\b/i,
      label: "Unresolved concern or constraint",
    },
    {
      pattern: /\b(?:later|eventually|at some point|down the road|v2|phase 2)\b/i,
      label: "Deferred requirement",
    },
    {
      pattern: /\b(?:don'?t forget|make sure|important|critical|must)\b/i,
      label: "Implicit constraint or priority",
    },
    {
      pattern: /\b(?:like|similar to|the way .+ does|inspired by)\b/i,
      label: "Reference architecture or precedent",
    },
  ];

  for (const msg of messages) {
    if (msg.role !== "user") continue;
    for (const { pattern, label } of intentPatterns) {
      if (pattern.test(msg.content)) {
        const match = msg.content.match(pattern);
        if (match) {
          const context = msg.content.substring(
            Math.max(0, match.index! - 40),
            Math.min(msg.content.length, match.index! + match[0].length + 60)
          );
          intents.push(`${label}: "...${context.trim()}..."`);
        }
      }
    }
  }
  return [...new Set(intents)].slice(0, 15);
}

/** Build a compressed summary of the conversation */
function buildSummary(messages: HistoryEntry[]): string {
  if (messages.length === 0) return "No conversation history to summarize.";

  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  // Extract topic keywords via compromise noun frequency analysis
  const allText = messages.map((m) => m.content).join(" ");
  const doc = nlp(allText);
  const topTerms = (doc.nouns().out("freq" as unknown as "text") as Array<{ normal: string; count: number }>)
    .slice(0, 20)
    .map((f) => f.normal)
    .filter((term) => term.length > 2);

  const parts: string[] = [];
  parts.push(
    `Conversation: ${messages.length} messages (${userMessages.length} user, ${assistantMessages.length} assistant).`
  );
  if (topTerms.length > 0) {
    parts.push(`Key topics: ${topTerms.join(", ")}.`);
  }

  // Summarize the latest user messages
  const recentUser = userMessages.slice(-3);
  if (recentUser.length > 0) {
    parts.push("Recent user focus:");
    for (const msg of recentUser) {
      const truncated =
        msg.content.length > 500
          ? msg.content.slice(0, 500) + "..."
          : msg.content;
      parts.push(`  [Turn ${msg.turn}] ${truncated}`);
    }
  }

  return parts.join("\n");
}

export function refineConversation(
  messages: HistoryEntry[],
  lookbackTurns: number = 5
): RecapResult {
  const relevantMessages = messages.slice(-lookbackTurns * 2); // user+assistant pairs
  const currentTurn = messages.length > 0 ? messages[messages.length - 1].turn : 0;

  return {
    summary: buildSummary(relevantMessages),
    hiddenIntents: extractHiddenIntents(relevantMessages),
    keyDecisions: extractDecisions(relevantMessages),
    turn: currentTurn,
    generatedAt: new Date(),
  };
}
