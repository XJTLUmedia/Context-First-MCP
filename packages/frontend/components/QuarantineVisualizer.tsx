"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Silo {
  id: string;
  name: string;
  status: "active" | "merged" | "expired";
  keys: string[];
  ttl: number; // seconds remaining
  createdAt: number;
}

interface CoordinatorState {
  sharedKeys: string[];
}

let siloCounter = 0;

function createSilo(name: string, keys: string[], ttl: number): Silo {
  siloCounter++;
  return {
    id: `silo-${siloCounter}`,
    name,
    status: "active",
    keys,
    ttl,
    createdAt: Date.now(),
  };
}

const DEFAULT_SILOS: Silo[] = [
  {
    id: "silo-default-1",
    name: "api-investigation",
    status: "active",
    keys: ["api-endpoint", "auth-method", "rate-limits"],
    ttl: 45,
    createdAt: Date.now(),
  },
  {
    id: "silo-default-2",
    name: "auth-refactor",
    status: "active",
    keys: ["jwt-config", "session-strategy", "oauth-provider"],
    ttl: 120,
    createdAt: Date.now(),
  },
];

const NEW_SILO_TEMPLATES = [
  { name: "db-migration", keys: ["schema-version", "migration-plan"], ttl: 90 },
  { name: "perf-audit", keys: ["bottleneck", "metrics-baseline"], ttl: 60 },
  { name: "ui-redesign", keys: ["component-tree", "design-tokens"], ttl: 75 },
];

export default function QuarantineVisualizer() {
  const [silos, setSilos] = useState<Silo[]>(DEFAULT_SILOS);
  const [coordinator, setCoordinator] = useState<CoordinatorState>({
    sharedKeys: ["framework: Express", "env: production", "language: TypeScript"],
  });
  const [templateIndex, setTemplateIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // TTL countdown
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSilos((prev) =>
        prev.map((silo) => {
          if (silo.status !== "active") return silo;
          const newTtl = silo.ttl - 1;
          if (newTtl <= 0) {
            return { ...silo, ttl: 0, status: "expired" };
          }
          return { ...silo, ttl: newTtl };
        })
      );
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const addSilo = useCallback(() => {
    const template = NEW_SILO_TEMPLATES[templateIndex % NEW_SILO_TEMPLATES.length];
    setSilos((prev) => [...prev, createSilo(template.name, template.keys, template.ttl)]);
    setTemplateIndex((i) => i + 1);
  }, [templateIndex]);

  const mergeSilo = useCallback(
    (id: string) => {
      const silo = silos.find((s) => s.id === id);
      if (!silo || silo.status !== "active") return;
      setSilos((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "merged" as const } : s))
      );
      setCoordinator((prev) => ({
        sharedKeys: [...prev.sharedKeys, ...silo.keys.map((k) => `${silo.name}/${k}`)],
      }));
    },
    [silos]
  );

  const discardSilo = useCallback((id: string) => {
    setSilos((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const resetDemo = useCallback(() => {
    siloCounter = 0;
    setTemplateIndex(0);
    setSilos([
      createSilo("api-investigation", ["api-endpoint", "auth-method", "rate-limits"], 45),
      createSilo("auth-refactor", ["jwt-config", "session-strategy", "oauth-provider"], 120),
    ]);
    setCoordinator({
      sharedKeys: ["framework: Express", "env: production", "language: TypeScript"],
    });
  }, []);

  const activeSilos = silos.filter((s) => s.status === "active");
  const inactiveSilos = silos.filter((s) => s.status !== "active");

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-950">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold">Context Quarantine</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Isolate sub-tasks in memory silos to prevent context pollution
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={addSilo}
            className="px-3 py-1.5 text-xs bg-green-50 dark:bg-green-950 border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
          >
            + Create Silo
          </button>
          <button
            onClick={resetDemo}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Tree diagram */}
      <div className="flex flex-col items-center">
        {/* Coordinator (root) */}
        <div className="border-2 border-blue-400 dark:border-blue-500 rounded-lg px-6 py-3 bg-blue-50 dark:bg-blue-950 mb-2 max-w-md w-full">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
              COORDINATOR
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {coordinator.sharedKeys.length} shared keys
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {coordinator.sharedKeys.map((key) => (
              <span
                key={key}
                className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded font-mono"
              >
                {key}
              </span>
            ))}
          </div>
        </div>

        {/* Connector line */}
        {silos.length > 0 && (
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
        )}

        {/* Branch line */}
        {activeSilos.length > 0 && (
          <div
            className="h-px bg-gray-300 dark:bg-gray-600"
            style={{ width: `${Math.min(activeSilos.length * 200, 600)}px` }}
          />
        )}

        {/* Active silos */}
        {activeSilos.length > 0 && (
          <div className="flex flex-wrap justify-center gap-4 mt-2">
            {activeSilos.map((silo) => (
              <div key={silo.id} className="flex flex-col items-center">
                <div className="w-px h-3 bg-gray-300 dark:bg-gray-600" />
                <SiloCard silo={silo} onMerge={mergeSilo} onDiscard={discardSilo} />
              </div>
            ))}
          </div>
        )}

        {/* Inactive silos */}
        {inactiveSilos.length > 0 && (
          <div className="mt-4 w-full">
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-2 text-center">
              Completed silos
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {inactiveSilos.map((silo) => (
                <SiloCard
                  key={silo.id}
                  silo={silo}
                  onMerge={mergeSilo}
                  onDiscard={discardSilo}
                  compact
                />
              ))}
            </div>
          </div>
        )}

        {silos.length === 0 && (
          <div className="text-sm text-gray-400 dark:text-gray-500 py-6">
            No silos active. Create one to start quarantining context.
          </div>
        )}
      </div>
    </div>
  );
}

function SiloCard({
  silo,
  onMerge,
  onDiscard,
  compact = false,
}: {
  silo: Silo;
  onMerge: (id: string) => void;
  onDiscard: (id: string) => void;
  compact?: boolean;
}) {
  const statusColors = {
    active: "border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-950",
    merged: "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/50 opacity-70",
    expired: "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 opacity-50",
  };

  const statusBadge = {
    active: "bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200",
    merged: "bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200",
    expired: "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400",
  };

  if (compact) {
    return (
      <div className={`border rounded px-3 py-1.5 text-xs ${statusColors[silo.status]}`}>
        <span className="font-mono font-medium">{silo.name}</span>
        <span className={`ml-2 px-1 py-0.5 rounded text-[10px] ${statusBadge[silo.status]}`}>
          {silo.status}
        </span>
      </div>
    );
  }

  return (
    <div className={`border-2 rounded-lg px-4 py-3 w-48 ${statusColors[silo.status]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-sm font-bold truncate">{silo.name}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${statusBadge[silo.status]}`}>
          {silo.status}
        </span>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        {silo.keys.length} keys | TTL:{" "}
        <span className={silo.ttl < 15 ? "text-red-500 font-bold" : ""}>
          {silo.ttl}s
        </span>
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {silo.keys.map((key) => (
          <span
            key={key}
            className="text-[10px] px-1 py-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded font-mono"
          >
            {key}
          </span>
        ))}
      </div>

      {silo.status === "active" && (
        <div className="flex gap-1">
          <button
            onClick={() => onMerge(silo.id)}
            className="flex-1 text-[10px] px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
          >
            Merge
          </button>
          <button
            onClick={() => onDiscard(silo.id)}
            className="flex-1 text-[10px] px-2 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
