"use client";

import { useState, useCallback } from "react";

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

  const chartWidth = 600;
  const chartHeight = 250;
  const paddingX = 40;
  const paddingY = 20;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingY * 2;

  const maxTurn = Math.max(turns.length, 10);

  const toX = useCallback(
    (turn: number) => paddingX + ((turn - 1) / (maxTurn - 1)) * plotWidth,
    [maxTurn, paddingX, plotWidth]
  );
  const toY = useCallback(
    (value: number) => paddingY + (1 - value) * plotHeight,
    [paddingY, plotHeight]
  );

  const pathD = turns
    .map((t, i) => `${i === 0 ? "M" : "L"} ${toX(t.turn)} ${toY(t.composite)}`)
    .join(" ");

  // Build colored segments
  const segments: Array<{ d: string; color: string }> = [];
  for (let i = 0; i < turns.length - 1; i++) {
    const x1 = toX(turns[i].turn);
    const y1 = toY(turns[i].composite);
    const x2 = toX(turns[i + 1].turn);
    const y2 = toY(turns[i + 1].composite);
    const avgVal = (turns[i].composite + turns[i + 1].composite) / 2;
    segments.push({ d: `M ${x1} ${y1} L ${x2} ${y2}`, color: getColor(avgVal) });
  }

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

      {/* SVG Chart */}
      <div className="overflow-x-auto mb-4">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full max-w-[600px]"
          style={{ minWidth: 400 }}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.7, 1].map((v) => (
            <g key={v}>
              <line
                x1={paddingX}
                y1={toY(v)}
                x2={chartWidth - paddingX}
                y2={toY(v)}
                stroke={v === THRESHOLD ? "#ef4444" : "#e5e7eb"}
                strokeDasharray={v === THRESHOLD ? "6 3" : "2 4"}
                strokeWidth={v === THRESHOLD ? 1.5 : 0.5}
              />
              <text
                x={paddingX - 6}
                y={toY(v) + 3}
                textAnchor="end"
                className="fill-gray-400"
                fontSize={10}
              >
                {v}
              </text>
            </g>
          ))}

          {/* Threshold label */}
          <text
            x={chartWidth - paddingX + 4}
            y={toY(THRESHOLD) + 3}
            className="fill-red-500"
            fontSize={9}
            fontWeight="bold"
          >
            threshold
          </text>

          {/* Colored line segments */}
          {segments.map((seg, i) => (
            <path
              key={i}
              d={seg.d}
              fill="none"
              stroke={seg.color}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          ))}

          {/* Data points */}
          {turns.map((t) => (
            <g key={t.turn}>
              <circle
                cx={toX(t.turn)}
                cy={toY(t.composite)}
                r={t.isSpike ? 5 : 3}
                fill={t.isSpike ? "#ef4444" : getColor(t.composite)}
                stroke={t.resetAnnotation ? "#fff" : "none"}
                strokeWidth={t.resetAnnotation ? 2 : 0}
              />
              {t.resetAnnotation && (
                <text
                  x={toX(t.turn)}
                  y={toY(t.composite) - 10}
                  textAnchor="middle"
                  className="fill-red-500"
                  fontSize={9}
                  fontWeight="bold"
                >
                  RESET
                </text>
              )}
            </g>
          ))}

          {/* X-axis turn labels */}
          {turns
            .filter((_, i) => i % Math.ceil(turns.length / 10) === 0 || i === turns.length - 1)
            .map((t) => (
              <text
                key={t.turn}
                x={toX(t.turn)}
                y={chartHeight - 4}
                textAnchor="middle"
                className="fill-gray-400"
                fontSize={10}
              >
                T{t.turn}
              </text>
            ))}
        </svg>
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
