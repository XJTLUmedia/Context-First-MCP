import { randomUUID } from "node:crypto";
import type { SessionStore } from "./store.js";
import type { GroundTruthEntry, QuarantineSilo } from "./types.js";

const MAX_SILOS_PER_SESSION = 10;
const DEFAULT_TTL_MS = 300_000; // 5 minutes

/**
 * Manages quarantine silos — isolated state sandboxes
 * for multi-agent or exploratory workflows.
 */
export class SiloManager {
  private silos = new Map<string, QuarantineSilo>();

  constructor(private store: SessionStore) {}

  /**
   * Create a new quarantine silo, optionally inheriting selected keys from the parent session.
   */
  createSilo(
    sessionId: string,
    name: string,
    inheritKeys?: string[],
    ttl: number = DEFAULT_TTL_MS
  ): QuarantineSilo {
    this.cleanupExpired();

    // Enforce per-session limit
    const sessionSilos = this.getSilosForSession(sessionId);
    if (sessionSilos.length >= MAX_SILOS_PER_SESSION) {
      throw new Error(
        `Maximum of ${MAX_SILOS_PER_SESSION} active silos per session reached. Merge or discard existing silos first.`
      );
    }

    const parentSession = this.store.getOrCreate(sessionId);
    const siloState = new Map<string, GroundTruthEntry>();

    // Inherit selected keys from parent
    if (inheritKeys && inheritKeys.length > 0) {
      for (const key of inheritKeys) {
        const entry = parentSession.groundTruth.get(key);
        if (entry) {
          siloState.set(key, { ...entry });
        }
      }
    }

    const silo: QuarantineSilo = {
      siloId: randomUUID(),
      name,
      parentSessionId: sessionId,
      state: siloState,
      context: "",
      results: [],
      createdAt: new Date(),
      ttl,
      status: "active",
    };

    this.silos.set(silo.siloId, silo);
    return silo;
  }

  /**
   * Retrieve a silo by ID. Returns undefined if not found or expired.
   */
  getSilo(siloId: string): QuarantineSilo | undefined {
    this.cleanupExpired();
    return this.silos.get(siloId);
  }

  /**
   * Merge a silo back into its parent session.
   * Only promoted keys are written back to the parent ground truth.
   */
  mergeSilo(siloId: string, promoteKeys?: string[]): {
    merged: boolean;
    promotedCount: number;
    promotedKeys: string[];
  } {
    const silo = this.silos.get(siloId);
    if (!silo) {
      throw new Error(`Silo ${siloId} not found`);
    }
    if (silo.status !== "active") {
      throw new Error(`Silo ${siloId} is already ${silo.status}`);
    }

    const keysToPromote = promoteKeys ?? [...silo.state.keys()];
    const promoted: string[] = [];

    for (const key of keysToPromote) {
      const entry = silo.state.get(key);
      if (entry) {
        this.store.setState(
          silo.parentSessionId,
          key,
          entry.value,
          `quarantine:${silo.name}`
        );
        promoted.push(key);
      }
    }

    silo.status = "merged";
    this.silos.delete(siloId);

    return {
      merged: true,
      promotedCount: promoted.length,
      promotedKeys: promoted,
    };
  }

  /**
   * Discard a silo without merging any state back.
   */
  discardSilo(siloId: string): { discarded: boolean } {
    const silo = this.silos.get(siloId);
    if (!silo) {
      throw new Error(`Silo ${siloId} not found`);
    }
    if (silo.status !== "active") {
      throw new Error(`Silo ${siloId} is already ${silo.status}`);
    }

    silo.status = "expired";
    this.silos.delete(siloId);
    return { discarded: true };
  }

  /**
   * Remove all expired silos based on their TTL.
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, silo] of this.silos) {
      if (silo.status === "active" && now - silo.createdAt.getTime() > silo.ttl) {
        silo.status = "expired";
        this.silos.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get all active silos for a given session.
   */
  getSilosForSession(sessionId: string): QuarantineSilo[] {
    this.cleanupExpired();
    const result: QuarantineSilo[] = [];
    for (const silo of this.silos.values()) {
      if (silo.parentSessionId === sessionId && silo.status === "active") {
        result.push(silo);
      }
    }
    return result;
  }

  /**
   * Total number of active silos across all sessions.
   */
  get size(): number {
    return this.silos.size;
  }

  /**
   * Tear down — clear all silos.
   */
  destroy(): void {
    this.silos.clear();
  }
}
