"use client";

interface StateEntry {
  value: unknown;
  lockedAt: string;
  source: string;
}

interface ConflictEntry {
  existingKey: string;
  existingValue: unknown;
  conflictingStatement: string;
  severity: "low" | "medium" | "high";
  suggestion: string;
}

export interface StateViewerProps {
  entries: Record<string, StateEntry>;
  conflicts?: ConflictEntry[];
}

const severityColors: Record<string, string> = {
  low: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  medium: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function StateViewer({ entries, conflicts = [] }: StateViewerProps) {
  const keys = Object.keys(entries);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="font-bold text-sm">Conversation Ground Truth</h3>
        <span className="text-xs text-gray-500">
          {keys.length} {keys.length === 1 ? "entry" : "entries"}
        </span>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {keys.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 text-center">
            No state entries. Use <code className="font-mono">set_state</code>{" "}
            to lock in facts.
          </div>
        ) : (
          keys.map((key) => {
            const entry = entries[key];
            const hasConflict = conflicts.some((c) => c.existingKey === key);
            return (
              <div
                key={key}
                className={`p-3 ${hasConflict ? "bg-red-50 dark:bg-red-950" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-sm font-bold">{key}</span>
                    {hasConflict && (
                      <span className="ml-2 text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-1.5 py-0.5 rounded">
                        CONFLICT
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">{entry.source}</span>
                </div>
                <pre className="text-xs mt-1 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {typeof entry.value === "string"
                    ? entry.value
                    : JSON.stringify(entry.value, null, 2)}
                </pre>
                <span className="text-xs text-gray-400">
                  Locked: {new Date(entry.lockedAt).toLocaleString()}
                </span>
              </div>
            );
          })
        )}
      </div>
      {conflicts.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="bg-red-50 dark:bg-red-950 px-4 py-2">
            <h4 className="text-xs font-bold text-red-800 dark:text-red-200">
              Active Conflicts ({conflicts.length})
            </h4>
          </div>
          {conflicts.map((conflict, i) => (
            <div
              key={i}
              className="px-4 py-3 border-t border-red-100 dark:border-red-900"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs">{conflict.existingKey}</span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${severityColors[conflict.severity]}`}
                >
                  {conflict.severity}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {conflict.suggestion}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
