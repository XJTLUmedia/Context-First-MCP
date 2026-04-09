import type { ToolRegistryEntry } from "../state/types.js";

export type { ToolRegistryEntry } from "../state/types.js";

export interface SearchResult {
  entry: ToolRegistryEntry;
  score: number;
}
