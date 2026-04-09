import { z } from "zod";
import type { ToolCatalog } from "../registry/catalog.js";
import { discoverTools } from "../engine/discovery.js";

export const discoverInputSchema = z.object({
  query: z
    .string()
    .describe("Natural language description of the capability needed"),
  maxResults: z
    .number()
    .default(5)
    .describe("Maximum number of tools to return"),
  minScore: z
    .number()
    .default(0.01)
    .describe("Minimum relevance score (0-1) to include a result"),
});

export type DiscoverInput = z.infer<typeof discoverInputSchema>;

export function handleDiscover(catalog: ToolCatalog, input: DiscoverInput) {
  const result = discoverTools(
    catalog,
    input.query,
    input.maxResults,
    input.minScore
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
