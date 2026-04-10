"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

interface TurnData {
  turn: number;
  composite: number;
  lexicalDiversity: number;
  contradictionDensity: number;
  hedgeFrequency: number;
  repetitionScore: number;
  isSpike: boolean;
  resetAnnotation: boolean;
}

function generateTurnData(turn: number, forceSpike = false): TurnData {
  const base = 0.25 + Math.random() * 0.3;
  const lexicalDiversity = forceSpike
    ? 0.7 + Math.random() * 0.25
    : 0.15 + Math.random() * 0.4;
  const contradictionDensity = forceSpike
    ? 0.6 + Math.random() * 0.3
    : 0.05 + Math.random() * 0.35;
  const hedgeFrequency = forceSpike
    ? 0.65 + Math.random() * 0.3
    : 0.1 + Math.random() * 0.35;
  const repetitionScore = forceSpike
    ? 0.5 + Math.random() * 0.4
    : 0.1 + Math.random() * 0.3;

  const composite = forceSpike
    ? 0.75 + Math.random() * 0.2
    : Math.min(
        1,
        (lexicalDiversity + contradictionDensity + hedgeFrequency + repetitionScore) / 4 +
          (Math.random() * 0.1 - 0.05)
      );

  return {
    turn,
    composite: Math.round(composite * 1000) / 1000,
    lexicalDiversity: Math.round(lexicalDiversity * 1000) / 1000,
    contradictionDensity: Math.round(contradictionDensity * 1000) / 1000,
    hedgeFrequency: Math.round(hedgeFrequency * 1000) / 1000,
    repetitionScore: Math.round(repetitionScore * 1000) / 1000,
    isSpike: composite > 0.7 || forceSpike,
    resetAnnotation: forceSpike,
  };
}

function getColor(value: number): string {
  if (value > 0.7) return "#ef4444";
  if (value > 0.5) return "#eab308";
  return "#22c55e";
}

const THRESHOLD = 0.7;

export default function EntropyChart() {
  const [turns, setTurns] = useState<TurnData[]>(() => {
    const initial: TurnData[] = [];
    for (let i = 1; i <= 5; i++) {
      initial.push(generateTurnData(i));
    }
    return initial;
  });

  const addTurn = () => {
    setTurns((prev) => [...prev, generateTurnData(prev.length + 1)]);
  };

  const triggerSpike = () => {
    setTurns((prev) => [...prev, generateTurnData(prev.length + 1, true)]);
  };

  const reset = () => {
    const initial: TurnData[] = [];
    for (let i = 1; i <= 5; i++) {
      initial.push(generateTurnData(i));
    }
    setTurns(initial);
  };

  const lastTurn = turns[turns.length - 1];

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-950">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold">Entropy Monitor (ERGO)</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Proxy entropy metrics detect confusion spikes in model output
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded ${
              lastTurn && lastTurn.composite > THRESHOLD
                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
            }`}
          >
            {lastTurn && lastTurn.composite > THRESHOLD ? "⚠ DRIFT" : "✓ STABLE"}
          </span>
        </div>
      </div>

      {/* Recharts chart */}
      <div className="h-64 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={turns.map((t) => ({
              name: `T${t.turn}`,
              composite: t.composite,
              lexicalDiversity: t.lexicalDiversity,
              contradictionDensity: t.contradictionDensity,
              hedgeFrequency: t.hedgeFrequency,
              repetitionScore: t.repetitionScore,
              isSpike: t.isSpike,
            }))}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip formatter={((v: unknown) => typeof v === "number" ? v.toFixed(3) : String(v)) as any} />
            <Legend />
            <ReferenceLine
              y={THRESHOLD}
              stroke="#ef4444"
              strokeDasharray="6 3"
              label={{ value: "threshold", position: "insideRight", fill: "#ef4444", fontSize: 10 }}
            />
            <Line
              type="monotone"
              dataKey="composite"
              stroke="#6366f1"
              strokeWidth={2.5}
              dot={((props: { cx?: number; cy?: number; payload?: { isSpike: boolean; composite: number; name: string } }) => {
                const { cx, cy, payload } = props;
                if (cx == null || cy == null || !payload) return null;
                return (
                  <circle
                    key={`dot-${payload.name}`}
                    cx={cx}
                    cy={cy}
                    r={payload.isSpike ? 5 : 3}
                    fill={getColor(payload.composite)}
                  />
                );
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              }) as any}
            />
            <Line type="monotone" dataKey="lexicalDiversity" stroke="#3b82f6" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="contradictionDensity" stroke="#ef4444" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="hedgeFrequency" stroke="#eab308" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="repetitionScore" stroke="#a855f7" strokeWidth={1} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Sub-metrics legend */}
      {lastTurn && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
          <MetricBadge label="Lexical Diversity" value={lastTurn.lexicalDiversity} color="blue" />
          <MetricBadge label="Contradiction Density" value={lastTurn.contradictionDensity} color="red" />
          <MetricBadge label="Hedge Frequency" value={lastTurn.hedgeFrequency} color="amber" />
          <MetricBadge label="Repetition Score" value={lastTurn.repetitionScore} color="purple" />
        </div>
      )}

      {/* Composite score */}
      {lastTurn && (
        <div className="mb-4 text-center">
          <span className="text-sm text-gray-500 dark:text-gray-400">Composite Entropy: </span>
          <span
            className="text-2xl font-bold font-mono"
            style={{ color: getColor(lastTurn.composite) }}
          >
            {lastTurn.composite.toFixed(3)}
          </span>
          <span className="text-sm text-gray-400 ml-1">/ 1.000</span>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3 justify-center">
        <button
          onClick={addTurn}
          className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Simulate Conversation
        </button>
        <button
          onClick={triggerSpike}
          className="px-4 py-2 text-sm bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
        >
          Trigger Spike
        </button>
        <button
          onClick={reset}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function MetricBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "red" | "amber" | "purple";
}) {
  const colors = {
    blue: "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    red: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    amber: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    purple: "bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  };
  return (
    <div className={`border rounded px-2 py-1 ${colors[color]}`}>
      <div className="font-medium truncate">{label}</div>
      <div className="font-mono font-bold">{value.toFixed(3)}</div>
    </div>
  );
}
