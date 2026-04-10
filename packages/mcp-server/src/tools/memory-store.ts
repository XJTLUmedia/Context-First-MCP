import { z } from "zod";
import type { UnifiedMemoryManager } from "../memory/manager.js";

export const memoryStoreInputSchema = z.object({
  sessionId: z.string().default("default"),
  role: z
    .enum(["user", "assistant", "system"])
    .default("user")
    .describe("Role of the content author"),
  content: z.string().describe("Content to store in hierarchical memory"),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Optional metadata attached to the episode"),
});

export type MemoryStoreInput = z.infer<typeof memoryStoreInputSchema>;

export function handleMemoryStore(
  manager: UnifiedMemoryManager,
  input: MemoryStoreInput
) {
  const result = manager.store(
    input.sessionId,
    input.role,
    input.content,
    input.metadata ?? {}
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            sessionId: input.sessionId,
            ...result,
            status: "stored",
          },
          null,
          2
        ),
      },
    ],
  };
}
