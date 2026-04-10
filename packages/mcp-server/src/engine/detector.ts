import { compareTwoStrings } from "string-similarity";
import type { GroundTruthEntry, ConflictDetectionResult } from "../state/types.js";

/**
 * Heuristic-based conflict detector.
 * Compares new user input against established ground truth.
 * Uses Dice coefficient (string-similarity) instead of hand-rolled Jaccard.
 */

/** Check if a message contains negation of a concept */
function containsNegation(text: string, concept: string): boolean {
  const negationPatterns = [
    new RegExp(`\\b(?:not|no|don'?t|won'?t|shouldn'?t|can'?t|never|without)\\s+(?:\\w+\\s+){0,3}${escapeRegex(concept)}`, "i"),
    new RegExp(`\\b(?:remove|delete|drop|skip|avoid|exclude|disable)\\s+(?:\\w+\\s+){0,3}${escapeRegex(concept)}`, "i"),
    new RegExp(`\\binstead of\\s+(?:\\w+\\s+){0,3}${escapeRegex(concept)}`, "i"),
  ];
  return negationPatterns.some((p) => p.test(text));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Detect value changes (e.g., "use React" then "use Vue") */
function detectValueChange(
  newMessage: string,
  key: string,
  existingValue: unknown
): { isConflict: boolean; severity: "low" | "medium" | "high"; detail: string } {
  const valueStr = String(existingValue).toLowerCase();
  const msgLower = newMessage.toLowerCase();
  const keyLower = key.toLowerCase();

  // Check if the message directly negates the existing value
  if (containsNegation(newMessage, valueStr)) {
    return {
      isConflict: true,
      severity: "high",
      detail: `Message appears to negate the established value "${existingValue}" for "${key}"`,
    };
  }

  // Check if the message mentions the key but with different value
  if (msgLower.includes(keyLower)) {
    const similarity = compareTwoStrings(valueStr, msgLower);
    if (similarity < 0.1 && valueStr.length > 0) {
      return {
        isConflict: true,
        severity: "medium",
        detail: `Message discusses "${key}" but the content differs significantly from the established value`,
      };
    }
  }

  // Check for change-related language around the key
  const changePatterns = [
    /\b(?:change|switch|replace|swap|update|actually|instead)\b/i,
  ];
  if (
    msgLower.includes(keyLower) &&
    changePatterns.some((p) => p.test(newMessage))
  ) {
    return {
      isConflict: true,
      severity: "medium",
      detail: `Message suggests changing "${key}" (currently: "${existingValue}")`,
    };
  }

  return { isConflict: false, severity: "low", detail: "" };
}

export function detectConflicts(
  newMessage: string,
  groundTruth: Map<string, GroundTruthEntry>
): ConflictDetectionResult {
  const conflicts: ConflictDetectionResult["conflicts"] = [];

  for (const [key, entry] of groundTruth) {
    const result = detectValueChange(newMessage, key, entry.value);
    if (result.isConflict) {
      conflicts.push({
        existingKey: key,
        existingValue: entry.value,
        conflictingStatement: newMessage.length > 200 ? newMessage.slice(0, 200) + "..." : newMessage,
        severity: result.severity,
        suggestion:
          result.severity === "high"
            ? `Confirm with user: do they want to change "${key}" from "${entry.value}"?`
            : `Clarify whether "${key}" should be updated based on the new input.`,
      });
    }
  }

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
  };
}
