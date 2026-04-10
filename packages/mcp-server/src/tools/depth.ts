import { z } from "zod";
import { analyzeDepth } from "../engine/depth.js";

export const depthInputSchema = z.object({
  content: z.string().describe("The assistant output text to analyze for depth quality"),
  minDepthWords: z.number().default(80).describe("Minimum words per section to be considered deep (default: 80)"),
  minDepthSentences: z.number().default(3).describe("Minimum sentences per section to be considered deep (default: 3)"),
});

export type DepthToolInput = z.infer<typeof depthInputSchema>;

export function handleDepth(input: DepthToolInput) {
  const result = analyzeDepth(input.content, input.minDepthWords, input.minDepthSentences);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          depthScore: result.depthScore,
          breadthScore: result.breadthScore,
          isLazy: result.isLazy,
          sectionCount: result.sectionCount,
          avgWordsPerSection: result.avgWordsPerSection,
          shallowSections: result.shallowSections,
          elaborationDirectives: result.elaborationDirectives,
          recommendation: result.recommendation,
        }, null, 2),
      },
    ],
  };
}
