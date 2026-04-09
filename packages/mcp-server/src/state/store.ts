import type {
  ConversationState,
  GroundTruthEntry,
  HistoryEntry,
  ConflictEntry,
  RecapResult,
} from "./types.js";

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_HISTORY_ENTRIES = 200;

/**
 * In-memory session store. Holds conversation state per session ID.
 * Evicts expired sessions on access and periodically.
 */
export class SessionStore {
  private sessions = new Map<string, ConversationState>();
  private evictionTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.evictionTimer = setInterval(() => this.evictExpired(), SESSION_TTL_MS);
  }

  getOrCreate(sessionId: string): ConversationState {
    this.evictExpired();
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        groundTruth: new Map(),
        history: [],
        conflicts: [],
        lastRecap: null,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      };
      this.sessions.set(sessionId, session);
    }
    session.lastAccessedAt = new Date();
    return session;
  }

  getState(
    sessionId: string,
    keys?: string[]
  ): Record<string, GroundTruthEntry> {
    const session = this.getOrCreate(sessionId);
    const result: Record<string, GroundTruthEntry> = {};
    if (keys && keys.length > 0) {
      for (const key of keys) {
        const entry = session.groundTruth.get(key);
        if (entry) result[key] = entry;
      }
    } else {
      for (const [key, entry] of session.groundTruth) {
        result[key] = entry;
      }
    }
    return result;
  }

  setState(
    sessionId: string,
    key: string,
    value: unknown,
    source: string = "user"
  ): GroundTruthEntry {
    const session = this.getOrCreate(sessionId);
    const entry: GroundTruthEntry = {
      value,
      lockedAt: new Date(),
      source,
    };
    session.groundTruth.set(key, entry);
    return entry;
  }

  clearState(sessionId: string, keys?: string[]): number {
    const session = this.getOrCreate(sessionId);
    if (!keys || keys.length === 0) {
      const count = session.groundTruth.size;
      session.groundTruth.clear();
      session.conflicts = [];
      session.lastRecap = null;
      return count;
    }
    let cleared = 0;
    for (const key of keys) {
      if (session.groundTruth.delete(key)) cleared++;
    }
    return cleared;
  }

  addHistory(sessionId: string, entry: HistoryEntry): void {
    const session = this.getOrCreate(sessionId);
    session.history.push(entry);
    if (session.history.length > MAX_HISTORY_ENTRIES) {
      session.history = session.history.slice(-MAX_HISTORY_ENTRIES);
    }
  }

  getHistory(sessionId: string, lastN?: number): HistoryEntry[] {
    const session = this.getOrCreate(sessionId);
    if (lastN && lastN > 0) {
      return session.history.slice(-lastN);
    }
    return [...session.history];
  }

  addConflict(sessionId: string, conflict: ConflictEntry): void {
    const session = this.getOrCreate(sessionId);
    session.conflicts.push(conflict);
  }

  getConflicts(sessionId: string): ConflictEntry[] {
    const session = this.getOrCreate(sessionId);
    return [...session.conflicts];
  }

  setRecap(sessionId: string, recap: RecapResult): void {
    const session = this.getOrCreate(sessionId);
    session.lastRecap = recap;
  }

  getRecap(sessionId: string): RecapResult | null {
    const session = this.getOrCreate(sessionId);
    return session.lastRecap;
  }

  destroy(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }
    this.sessions.clear();
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccessedAt.getTime() > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}
