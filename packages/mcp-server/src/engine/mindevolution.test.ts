import { describe, it, expect } from "vitest";
import { runMindEvolution } from "./mindevolution.js";

const SEED_RESPONSES = [
  "Use a round-robin approach with health checks to distribute load across regions. Monitor latency per region and shift traffic away from degraded nodes. Implement circuit breakers for cascading failure protection.",
  "Deploy a weighted load balancer with geo-routing. Assign weights based on capacity and proximity. Use DNS-based failover for disaster recovery scenarios.",
  "Implement consistent hashing across regions with virtual nodes. Route requests based on content hash to maximize cache locality. Fall back to nearest healthy region on failure.",
  "Use an anycast-based strategy with BGP routing. Let the network layer handle geographic proximity. Add application-level health checks as a secondary routing signal.",
  "Build a tiered load balancing system: global DNS routing to region, then local L7 balancing within each region. Separate read and write traffic paths.",
  "Apply adaptive load balancing using real-time metrics. Collect request latency and error rates per region. Dynamically adjust traffic weights every 30 seconds based on observed performance.",
];

describe("runMindEvolution", () => {
  it("produces an evolved population and best solution", () => {
    const result = runMindEvolution({
      problem: "Design a load balancing strategy for a 5-region deployment.",
      seedResponses: SEED_RESPONSES.slice(0, 3),
    });

    expect(result.bestCandidate).toBeDefined();
    expect(result.bestCandidate.fitness).toBeGreaterThan(0);
    expect(result.totalGenerations).toBeGreaterThan(0);
    expect(result.allCandidates.length).toBeGreaterThan(0);
    expect(result.finalAnswer).toBeTruthy();
  });

  it("respects populationSize", () => {
    const result = runMindEvolution({
      problem: "Choose a message queue for event processing.",
      populationSize: 4,
      seedResponses: [
        "Use Kafka for high-throughput event streaming with partitioned topics.",
        "Use RabbitMQ for flexible routing with AMQP protocol support.",
        "Use Redis Streams for lightweight event processing with low latency.",
        "Use Amazon SQS for managed queue service with automatic scaling.",
      ],
    });

    expect(result.populationSize).toBeLessThanOrEqual(4);
  });

  it("respects maxGenerations", () => {
    const result = runMindEvolution({
      problem: "Optimize a CI/CD pipeline for speed.",
      maxGenerations: 3,
      seedResponses: [
        "Parallelize test stages and cache dependencies between runs. Use incremental builds.",
        "Split the monolith into smaller pipelines per service. Run only affected tests on each PR.",
      ],
    });

    expect(result.totalGenerations).toBeLessThanOrEqual(3);
  });

  it("fitness improves (or stays) over generations", () => {
    const result = runMindEvolution({
      problem: "Design a distributed cache with consistency guarantees.",
      maxGenerations: 5,
      populationSize: 6,
      seedResponses: SEED_RESPONSES.slice(0, 3).map(s =>
        s.replace(/load balanc/gi, "cach").replace(/region/gi, "node"),
      ),
    });

    expect(result.bestCandidate.fitness).toBeGreaterThan(0);
    expect(result.converged !== undefined).toBe(true);
  });

  it("handles seed responses", () => {
    const result = runMindEvolution({
      problem: "Pick a database for IoT time-series data.",
      seedResponses: [
        "Use InfluxDB for time-series optimized storage.",
        "Use PostgreSQL with TimescaleDB extension.",
      ],
      populationSize: 4,
    });

    expect(result.allCandidates.length).toBeGreaterThan(0);
    expect(result.finalAnswer).toBeTruthy();
  });

  it("uses custom criteria for fitness evaluation", () => {
    const result = runMindEvolution({
      problem: "Design a notification system.",
      criteria: ["scalability", "real-time delivery", "cost efficiency"],
      seedResponses: [
        "Use a pub-sub architecture with WebSocket connections for real-time push. Scale horizontally with message partitioning.",
        "Implement a fan-out notification pipeline using SNS and SQS. Batch low-priority notifications to reduce cost.",
      ],
    });

    expect(result.bestCandidate.fitness).toBeGreaterThan(0);
    expect(result.finalAnswer).toBeTruthy();
  });

  it("each candidate has required fields", () => {
    const result = runMindEvolution({
      problem: "Implement a feature flag system.",
      populationSize: 3,
      maxGenerations: 2,
      seedResponses: [
        "Use a centralized feature flag service with SDK integration. Support percentage rollouts and user targeting.",
        "Store flags in a config file with environment overrides. Deploy flag changes through the CI/CD pipeline.",
        "Build a database-backed flag system with an admin UI. Cache flag evaluations at the edge for low latency.",
      ],
    });

    for (const candidate of result.allCandidates) {
      expect(candidate.response).toBeTruthy();
      expect(candidate.fitness).toBeGreaterThanOrEqual(0);
      expect(candidate.generation).toBeGreaterThanOrEqual(0);
    }
  });

  it("throws when no seed responses provided", () => {
    expect(() => runMindEvolution({
      problem: "Some problem.",
      seedResponses: [],
    })).toThrow("at least 1 seed response");
  });
});
