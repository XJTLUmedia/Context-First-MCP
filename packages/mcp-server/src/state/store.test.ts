import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionStore } from "./store.js";

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  afterEach(() => {
    store.destroy();
  });

  describe("getOrCreate", () => {
    it("creates a new session", () => {
      const session = store.getOrCreate("test-1");
      expect(session.sessionId).toBe("test-1");
      expect(session.groundTruth.size).toBe(0);
      expect(session.history).toEqual([]);
      expect(session.conflicts).toEqual([]);
      expect(session.lastRecap).toBeNull();
    });

    it("returns the same session on subsequent calls", () => {
      const s1 = store.getOrCreate("test-1");
      s1.groundTruth.set("key", { value: "v", lockedAt: new Date(), source: "test" });
      const s2 = store.getOrCreate("test-1");
      expect(s2.groundTruth.get("key")?.value).toBe("v");
    });
  });

  describe("setState / getState", () => {
    it("sets and retrieves state", () => {
      store.setState("s1", "framework", "Express", "user");
      const state = store.getState("s1");
      expect(state.framework.value).toBe("Express");
      expect(state.framework.source).toBe("user");
    });

    it("retrieves specific keys only", () => {
      store.setState("s1", "a", 1, "user");
      store.setState("s1", "b", 2, "user");
      store.setState("s1", "c", 3, "user");
      const state = store.getState("s1", ["a", "c"]);
      expect(Object.keys(state)).toEqual(["a", "c"]);
    });

    it("returns empty for non-existent keys", () => {
      store.setState("s1", "a", 1, "user");
      const state = store.getState("s1", ["missing"]);
      expect(Object.keys(state)).toEqual([]);
    });
  });

  describe("clearState", () => {
    it("clears specific keys", () => {
      store.setState("s1", "a", 1, "user");
      store.setState("s1", "b", 2, "user");
      const cleared = store.clearState("s1", ["a"]);
      expect(cleared).toBe(1);
      const state = store.getState("s1");
      expect(Object.keys(state)).toEqual(["b"]);
    });

    it("clears all state when no keys specified", () => {
      store.setState("s1", "a", 1, "user");
      store.setState("s1", "b", 2, "user");
      const cleared = store.clearState("s1");
      expect(cleared).toBe(2);
      const state = store.getState("s1");
      expect(Object.keys(state)).toEqual([]);
    });
  });

  describe("addHistory / getHistory", () => {
    it("adds and retrieves history", () => {
      store.addHistory("s1", { role: "user", content: "hello", turn: 1, timestamp: new Date() });
      store.addHistory("s1", { role: "assistant", content: "hi", turn: 1, timestamp: new Date() });
      const history = store.getHistory("s1");
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe("hello");
    });

    it("retrieves last N entries", () => {
      for (let i = 0; i < 10; i++) {
        store.addHistory("s1", { role: "user", content: `msg-${i}`, turn: i, timestamp: new Date() });
      }
      const last3 = store.getHistory("s1", 3);
      expect(last3).toHaveLength(3);
      expect(last3[0].content).toBe("msg-7");
    });

    it("enforces max history limit", () => {
      for (let i = 0; i < 250; i++) {
        store.addHistory("s1", { role: "user", content: `msg-${i}`, turn: i, timestamp: new Date() });
      }
      const history = store.getHistory("s1");
      expect(history.length).toBeLessThanOrEqual(200);
    });
  });

  describe("conflicts", () => {
    it("adds and retrieves conflicts", () => {
      store.addConflict("s1", {
        key: "framework",
        oldValue: "Express",
        newValue: "Hono",
        description: "User changed framework",
        detectedAt: new Date(),
      });
      const conflicts = store.getConflicts("s1");
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].key).toBe("framework");
    });
  });

  describe("recap", () => {
    it("sets and retrieves recap", () => {
      const recap = {
        summary: "test summary",
        hiddenIntents: ["intent1"],
        keyDecisions: ["decision1"],
        turn: 3,
        generatedAt: new Date(),
      };
      store.setRecap("s1", recap);
      expect(store.getRecap("s1")).toEqual(recap);
    });

    it("returns null when no recap", () => {
      expect(store.getRecap("s1")).toBeNull();
    });
  });
});
