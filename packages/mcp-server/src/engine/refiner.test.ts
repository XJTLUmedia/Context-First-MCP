import { describe, it, expect } from "vitest";
import { refineConversation } from "./refiner.js";
import type { HistoryEntry } from "../state/types.js";

function entry(role: "user" | "assistant", content: string, turn: number): HistoryEntry {
  return { role, content, turn, timestamp: new Date() };
}

describe("refineConversation", () => {
  it("returns empty results for no messages", () => {
    const result = refineConversation([]);
    expect(result.summary).toContain("No conversation history");
    expect(result.hiddenIntents).toEqual([]);
    expect(result.keyDecisions).toEqual([]);
    expect(result.turn).toBe(0);
  });

  it("extracts key decisions", () => {
    const messages: HistoryEntry[] = [
      entry("user", "I want to use TypeScript.", 1),
      entry("assistant", "Confirmed: we'll use TypeScript for the project.", 1),
      entry("user", "Let's go with Express for the backend.", 2),
      entry("assistant", "Decided to use Express as the backend framework.", 2),
    ];
    const result = refineConversation(messages);
    expect(result.keyDecisions.length).toBeGreaterThan(0);
    expect(result.keyDecisions.some((d) => /express/i.test(d) || /typescript/i.test(d))).toBe(true);
  });

  it("extracts hidden intents", () => {
    const messages: HistoryEntry[] = [
      entry("user", "I might want to add caching later.", 1),
      entry("user", "Maybe we should also consider rate limiting.", 2),
      entry("user", "Don't forget about error handling.", 3),
    ];
    const result = refineConversation(messages);
    expect(result.hiddenIntents.length).toBeGreaterThan(0);
  });

  it("builds a summary with topic keywords", () => {
    const messages: HistoryEntry[] = [
      entry("user", "Let's build a REST API for user authentication.", 1),
      entry("assistant", "I'll create the authentication endpoints with JWT tokens.", 1),
      entry("user", "We need login, signup, and password reset endpoints.", 2),
      entry("assistant", "Setting up the three authentication endpoints now.", 2),
    ];
    const result = refineConversation(messages);
    expect(result.summary).toContain("messages");
    expect(result.summary.length).toBeGreaterThan(20);
  });

  it("respects lookbackTurns", () => {
    const messages: HistoryEntry[] = [];
    for (let i = 1; i <= 20; i++) {
      messages.push(entry("user", `User message ${i}`, i));
      messages.push(entry("assistant", `Response ${i}`, i));
    }
    const result = refineConversation(messages, 3);
    // Should only look at last 6 messages (3 turns × 2)
    expect(result.turn).toBe(20);
    expect(result.generatedAt).toBeInstanceOf(Date);
  });
});
