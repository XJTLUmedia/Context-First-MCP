import { describe, it, expect, beforeEach } from "vitest";
import { SiloManager } from "./silo.js";
import { SessionStore } from "./store.js";

describe("SiloManager", () => {
  let store: SessionStore;
  let manager: SiloManager;

  beforeEach(() => {
    store = new SessionStore();
    manager = new SiloManager(store);
  });

  it("creates a silo with a unique ID", () => {
    const silo = manager.createSilo("session-1", "test-silo");
    expect(silo.siloId).toBeTruthy();
    expect(silo.name).toBe("test-silo");
    expect(silo.parentSessionId).toBe("session-1");
    expect(silo.status).toBe("active");
  });

  it("inherits selected keys from parent session", () => {
    store.setState("session-1", "framework", "Express", "user");
    store.setState("session-1", "database", "PostgreSQL", "user");
    store.setState("session-1", "hosting", "AWS", "user");

    const silo = manager.createSilo("session-1", "inherit-test", [
      "framework",
      "database",
    ]);

    expect(silo.state.size).toBe(2);
    expect(silo.state.get("framework")?.value).toBe("Express");
    expect(silo.state.get("database")?.value).toBe("PostgreSQL");
    expect(silo.state.has("hosting")).toBe(false);
  });

  it("creates silo without inheriting if no keys specified", () => {
    store.setState("session-1", "key1", "value1", "user");
    const silo = manager.createSilo("session-1", "empty-silo");
    expect(silo.state.size).toBe(0);
  });

  it("retrieves a silo by ID", () => {
    const silo = manager.createSilo("session-1", "find-me");
    const found = manager.getSilo(silo.siloId);
    expect(found).toBeDefined();
    expect(found!.name).toBe("find-me");
  });

  it("returns undefined for unknown silo ID", () => {
    expect(manager.getSilo("nonexistent")).toBeUndefined();
  });

  it("merges silo back to parent with promoted keys", () => {
    store.setState("session-1", "original", "value", "user");
    const silo = manager.createSilo("session-1", "merge-test");

    // Add to silo state directly
    silo.state.set("newKey", {
      value: "discovered",
      lockedAt: new Date(),
      source: "silo",
    });
    silo.state.set("anotherKey", {
      value: "also-discovered",
      lockedAt: new Date(),
      source: "silo",
    });

    const result = manager.mergeSilo(silo.siloId, ["newKey"]);
    expect(result.merged).toBe(true);
    expect(result.promotedCount).toBe(1);
    expect(result.promotedKeys).toEqual(["newKey"]);

    // Check parent session received promoted key
    const parentState = store.getState("session-1");
    expect(parentState["newKey"]?.value).toBe("discovered");
    expect(parentState["anotherKey"]).toBeUndefined();
  });

  it("merges all keys when promoteKeys is omitted", () => {
    const silo = manager.createSilo("session-1", "merge-all");
    silo.state.set("key1", {
      value: "v1",
      lockedAt: new Date(),
      source: "silo",
    });
    silo.state.set("key2", {
      value: "v2",
      lockedAt: new Date(),
      source: "silo",
    });

    const result = manager.mergeSilo(silo.siloId);
    expect(result.promotedCount).toBe(2);
  });

  it("discards a silo without merging", () => {
    store.setState("session-1", "original", "value", "user");
    const silo = manager.createSilo("session-1", "discard-me");
    silo.state.set("tempKey", {
      value: "temp",
      lockedAt: new Date(),
      source: "silo",
    });

    const result = manager.discardSilo(silo.siloId);
    expect(result.discarded).toBe(true);

    // Ensure tempKey did NOT make it to parent
    const parentState = store.getState("session-1");
    expect(parentState["tempKey"]).toBeUndefined();
  });

  it("throws when merging an already-merged silo", () => {
    const silo = manager.createSilo("session-1", "double-merge");
    manager.mergeSilo(silo.siloId);
    expect(() => manager.mergeSilo(silo.siloId)).toThrow();
  });

  it("throws when discarding a non-existent silo", () => {
    expect(() => manager.discardSilo("fake-id")).toThrow();
  });

  it("enforces max 10 silos per session", () => {
    for (let i = 0; i < 10; i++) {
      manager.createSilo("session-1", `silo-${i}`);
    }
    expect(() => manager.createSilo("session-1", "silo-11")).toThrow(
      /Maximum of 10/
    );
  });

  it("allows silos in different sessions independently", () => {
    for (let i = 0; i < 10; i++) {
      manager.createSilo("session-1", `silo-${i}`);
    }
    // Different session should still work
    const silo = manager.createSilo("session-2", "other-session-silo");
    expect(silo.status).toBe("active");
  });

  it("cleans up expired silos based on TTL", () => {
    const silo = manager.createSilo("session-1", "expire-me", undefined, 1); // 1ms TTL

    // Wait for TTL to pass
    const start = Date.now();
    while (Date.now() - start < 10) {
      // busy wait for >1ms
    }

    const cleaned = manager.cleanupExpired();
    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(manager.getSilo(silo.siloId)).toBeUndefined();
  });

  it("reports correct size", () => {
    expect(manager.size).toBe(0);
    manager.createSilo("session-1", "s1");
    manager.createSilo("session-1", "s2");
    expect(manager.size).toBe(2);
  });

  it("getSilosForSession returns only active silos for that session", () => {
    manager.createSilo("session-1", "s1");
    manager.createSilo("session-1", "s2");
    manager.createSilo("session-2", "s3");

    const silos1 = manager.getSilosForSession("session-1");
    expect(silos1.length).toBe(2);

    const silos2 = manager.getSilosForSession("session-2");
    expect(silos2.length).toBe(1);
  });

  it("destroy clears all silos", () => {
    manager.createSilo("session-1", "s1");
    manager.createSilo("session-1", "s2");
    manager.destroy();
    expect(manager.size).toBe(0);
  });
});
