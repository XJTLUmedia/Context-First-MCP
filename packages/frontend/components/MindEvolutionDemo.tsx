"use client";

import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EvolutionCandidate {
  id: string;
  strategy: string;
  solution: string;
  fitness: number;
  generation: number;
  parentIds: string[];
}

interface MindEvolutionResult {
  bestCandidate: EvolutionCandidate;
  finalPopulation: EvolutionCandidate[];
  generationsRun: number;
  totalEvaluations: number;
  fitnessHistory: number[];
  diversityHistory: number[];
  converged: boolean;
  convergenceGeneration: number | null;
}

const STRATEGIES = ["analytical", "creative", "systematic", "critical", "concise", "comprehensive"];
const STRATEGY_COLORS: Record<string, string> = {
  analytical: "text-blue-400",
  creative: "text-purple-400",
  systematic: "text-green-400",
  critical: "text-red-400",
  concise: "text-yellow-400",
  comprehensive: "text-cyan-400",
};

// ─── Scenarios ───────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    name: "System Design",
    description: "Open-ended architecture problem",
    problem: "Design a real-time notification system that handles 10M concurrent users with <100ms latency, supports priority levels, and allows per-user preference configuration.",
  },
  {
    name: "Optimization",
    description: "Multi-constraint optimization",
    problem: "Optimize a CI/CD pipeline that currently takes 45 minutes. Constraints: maintain test coverage >90%, support monorepo with 12 packages, and costs must stay under $500/month on cloud CI.",
  },
  {
    name: "Strategy Decision",
    description: "Business-tech trade-off",
    problem: "As a mid-stage startup (Series B, 50 engineers), should we build our own ML inference stack or use a managed service like AWS SageMaker? Consider cost at scale, hiring needs, iteration speed, and vendor lock-in.",
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function MindEvolutionDemo() {
  const [selectedScenario, setSelectedScenario] = useState(0);
  const [customProblem, setCustomProblem] = useState("");
  const [popSize, setPopSize] = useState(6);
  const [maxGens, setMaxGens] = useState(5);
  const [mutationRate, setMutationRate] = useState(0.3);
  const [result, setResult] = useState<MindEvolutionResult | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);

  const runMindEvolution = async () => {
    setRunning(true);
    setResult(null);

    await new Promise(r => setTimeout(r, 700));

    const fitnessHistory: number[] = [];
    const diversityHistory: number[] = [];
    let population: EvolutionCandidate[] = [];
    let idCounter = 0;
    let converged = false;
    let convergenceGen: number | null = null;

    // Initialize population
    population = STRATEGIES.slice(0, popSize).map(strategy => ({
      id: `c-${idCounter++}`,
      strategy,
      solution: `[${strategy}] Initial approach to the problem using ${strategy} thinking methodology.`,
      fitness: 0.3 + Math.random() * 0.3,
      generation: 0,
      parentIds: [],
    }));

    fitnessHistory.push(Math.max(...population.map(c => c.fitness)));
    diversityHistory.push(0.8 + Math.random() * 0.15);

    // Evolve
    for (let gen = 1; gen <= maxGens; gen++) {
      // Sort by fitness
      population.sort((a, b) => b.fitness - a.fitness);

      // Keep top 2 (elitism)
      const newPop = population.slice(0, 2).map(c => ({ ...c, generation: gen }));

      // Crossover + mutation to fill remaining
      while (newPop.length < popSize) {
        const p1 = population[Math.floor(Math.random() * Math.min(3, population.length))];
        const p2 = population[Math.floor(Math.random() * population.length)];

        const child: EvolutionCandidate = {
          id: `c-${idCounter++}`,
          strategy: Math.random() > 0.5 ? p1.strategy : p2.strategy,
          solution: `[Gen ${gen}] Evolved from ${p1.strategy}×${p2.strategy}${Math.random() < mutationRate ? " +mutation" : ""}`,
          fitness: Math.min(1, (p1.fitness + p2.fitness) / 2 + (Math.random() * 0.15 - 0.03)),
          generation: gen,
          parentIds: [p1.id, p2.id],
        };
        newPop.push(child);
      }

      population = newPop;
      const bestFitness = Math.max(...population.map(c => c.fitness));
      fitnessHistory.push(bestFitness);
      diversityHistory.push(Math.max(0.2, 0.9 - gen * 0.12 + Math.random() * 0.1));

      // Convergence check
      if (!converged && fitnessHistory.length >= 3) {
        const last3 = fitnessHistory.slice(-3);
        if (Math.max(...last3) - Math.min(...last3) < 0.03) {
          converged = true;
          convergenceGen = gen;
        }
      }
    }

    population.sort((a, b) => b.fitness - a.fitness);

    setResult({
      bestCandidate: population[0],
      finalPopulation: population,
      generationsRun: maxGens,
      totalEvaluations: idCounter,
      fitnessHistory,
      diversityHistory,
      converged,
      convergenceGeneration: convergenceGen,
    });

    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-900/30 to-lime-900/30 rounded-xl p-6 border border-emerald-500/20">
        <h3 className="text-lg font-semibold text-emerald-300 mb-2">🧬 Mind Evolution — Evolutionary Search</h3>
        <p className="text-sm text-gray-400">
          Evolves candidate solutions through selection, crossover, and mutation. Initializes a diverse population
          using 6 strategy types (analytical, creative, systematic, critical, concise, comprehensive), then evolves
          through multiple generations to find the best solution. Tracks fitness and diversity metrics.
        </p>
      </div>

      {/* Scenarios */}
      <div className="grid grid-cols-3 gap-3">
        {SCENARIOS.map((scenario, i) => (
          <button
            key={i}
            onClick={() => { setSelectedScenario(i); setCustomProblem(""); }}
            className={`p-3 rounded-lg border text-left transition-all ${
              selectedScenario === i && !customProblem
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
            }`}
          >
            <div className="text-sm font-medium text-white">{scenario.name}</div>
            <div className="text-xs text-gray-400 mt-1">{scenario.description}</div>
          </button>
        ))}
      </div>

      <textarea
        className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-none h-20"
        placeholder="Or enter a custom problem..."
        value={customProblem}
        onChange={e => setCustomProblem(e.target.value)}
      />

      {/* Config */}
      <div className="flex gap-4 items-center flex-wrap">
        <label className="text-sm text-gray-400">
          Population:
          <input type="number" min={4} max={12} value={popSize}
            onChange={e => setPopSize(Number(e.target.value))}
            className="ml-2 w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-sm text-gray-400">
          Generations:
          <input type="number" min={2} max={10} value={maxGens}
            onChange={e => setMaxGens(Number(e.target.value))}
            className="ml-2 w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-sm text-gray-400">
          Mutation:
          <input type="number" min={0.05} max={0.8} step={0.05} value={mutationRate}
            onChange={e => setMutationRate(Number(e.target.value))}
            className="ml-2 w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          />
        </label>
        <button
          onClick={runMindEvolution}
          disabled={running}
          className="ml-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 rounded-lg text-sm text-white transition-colors"
        >
          {running ? "Evolving..." : "Run Evolution"}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Best Fitness</div>
              <div className="text-xl font-bold text-emerald-400">{(result.bestCandidate.fitness * 100).toFixed(1)}%</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Generations</div>
              <div className="text-xl font-bold text-white">{result.generationsRun}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Evaluations</div>
              <div className="text-xl font-bold text-lime-400">{result.totalEvaluations}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Converged</div>
              <div className={`text-xl font-bold ${result.converged ? "text-green-400" : "text-yellow-400"}`}>
                {result.converged ? `Gen ${result.convergenceGeneration}` : "No"}
              </div>
            </div>
          </div>

          {/* Fitness Chart */}
          <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
            <div className="text-xs text-gray-400 mb-3">Fitness & Diversity Over Generations</div>
            <div className="flex items-end gap-1 h-32">
              {result.fitnessHistory.map((fitness, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col items-center gap-0.5" style={{ height: "100%" }}>
                    {/* Fitness bar */}
                    <div className="flex-1 w-full flex items-end">
                      <div
                        className="w-full bg-emerald-500/70 rounded-t"
                        style={{ height: `${fitness * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-500">G{i}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-4 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500/70 rounded-sm" /> Fitness</span>
            </div>
          </div>

          {/* Population Cards */}
          <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
            <div className="text-xs text-gray-400 mb-3">Final Population (ranked by fitness)</div>
            <div className="grid grid-cols-2 gap-2">
              {result.finalPopulation.map((candidate, i) => (
                <button
                  key={candidate.id}
                  onClick={() => setSelectedCandidate(selectedCandidate === candidate.id ? null : candidate.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    i === 0
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : selectedCandidate === candidate.id
                        ? "border-gray-500 bg-gray-700/30"
                        : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-mono ${STRATEGY_COLORS[candidate.strategy] || "text-gray-400"}`}>
                      {candidate.strategy}
                    </span>
                    <span className="text-xs text-gray-500">Gen {candidate.generation}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-900 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${i === 0 ? "bg-emerald-500" : "bg-gray-600"}`}
                        style={{ width: `${candidate.fitness * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-white font-mono">{(candidate.fitness * 100).toFixed(1)}</span>
                  </div>
                  {(selectedCandidate === candidate.id || i === 0) && (
                    <p className="text-xs text-gray-400 mt-2">{candidate.solution}</p>
                  )}
                  {candidate.parentIds.length > 0 && (
                    <div className="text-[10px] text-gray-600 mt-1">
                      Parents: {candidate.parentIds.join(" × ")}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Best Candidate */}
          <div className="bg-emerald-900/20 rounded-lg p-4 border border-emerald-500/20">
            <div className="text-xs text-emerald-400 mb-1">
              Best Solution ({result.bestCandidate.strategy} — fitness {(result.bestCandidate.fitness * 100).toFixed(1)}%)
            </div>
            <p className="text-sm text-gray-200">{result.bestCandidate.solution}</p>
          </div>
        </div>
      )}
    </div>
  );
}
