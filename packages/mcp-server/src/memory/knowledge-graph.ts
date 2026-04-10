/**
 * KnowledgeGraph — HippoRAG / Mem0 inspired graph-based memory.
 *
 * Entity-relation graph with PageRank scoring for associative recall.
 * Supports temporal knowledge management and weighted edges.
 */

import type {
  GraphNode,
  GraphEdge,
  KnowledgeGraphState,
  ContentHash,
} from "./types.js";
import { djb2Hash } from "./episode-store.js";

/** Extract entities from text using pattern matching (no LLM required) */
export function extractEntities(
  text: string
): Array<{ label: string; type: GraphNode["type"] }> {
  const entities: Array<{ label: string; type: GraphNode["type"] }> = [];
  const seen = new Set<string>();

  const addUnique = (label: string, type: GraphNode["type"]) => {
    const key = label.toLowerCase();
    if (!seen.has(key) && label.length >= 2) {
      seen.add(key);
      entities.push({ label, type });
    }
  };

  // Capitalized words/phrases → entity
  const nameMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
  if (nameMatches) nameMatches.forEach((m) => addUnique(m, "entity"));

  // Quoted values → value
  const quotedMatches = text.match(/"([^"]{2,60})"/g);
  if (quotedMatches)
    quotedMatches.forEach((m) =>
      addUnique(m.replace(/"/g, ""), "value")
    );

  // Technical terms (camelCase, snake_case, kebab-case)
  const techMatches = text.match(
    /\b[a-z]+(?:[A-Z][a-z]+)+\b|\b\w+_\w+\b|\b\w+-\w+\b/g
  );
  if (techMatches) techMatches.forEach((m) => addUnique(m, "concept"));

  // Action verbs in imperative form
  const actionMatches = text.match(
    /\b(?:use|create|build|deploy|install|configure|implement|add|remove|update|migrate|refactor)\b/gi
  );
  if (actionMatches) actionMatches.forEach((m) => addUnique(m.toLowerCase(), "action"));

  // Numbers with context (e.g., "100MB", "3.5GHz")
  const numMatches = text.match(
    /\b\d+(?:\.\d+)?(?:\s*(?:MB|GB|KB|TB|ms|s|min|hr|%|px|rem|em|tokens?))\b/gi
  );
  if (numMatches) numMatches.forEach((m) => addUnique(m, "value"));

  return entities;
}

/** Extract relations between entities from text */
export function extractRelations(
  text: string,
  entities: Array<{ label: string; type: GraphNode["type"] }>
): Array<{ source: string; target: string; relation: string }> {
  const relations: Array<{
    source: string;
    target: string;
    relation: string;
  }> = [];

  if (entities.length < 2) return relations;

  const entityLabels = entities.map((e) => e.label.toLowerCase());

  // Split text into sentences and find co-occurring entities
  const sentences = text.split(/[.!?]+\s*/);
  for (const sentence of sentences) {
    const sentLower = sentence.toLowerCase();
    const found: string[] = [];

    for (let i = 0; i < entityLabels.length; i++) {
      if (sentLower.includes(entityLabels[i])) {
        found.push(entities[i].label);
      }
    }

    if (found.length >= 2) {
      // Extract verb between first two entities
      const verb = extractVerb(sentence, found[0], found[1]);
      for (let i = 0; i < found.length - 1; i++) {
        relations.push({
          source: found[i],
          target: found[i + 1],
          relation: verb || "related_to",
        });
      }
    }
  }

  return relations;
}

function extractVerb(sentence: string, entity1: string, entity2: string): string | null {
  const idx1 = sentence.toLowerCase().indexOf(entity1.toLowerCase());
  const idx2 = sentence.toLowerCase().indexOf(entity2.toLowerCase());
  if (idx1 < 0 || idx2 < 0) return null;

  const start = Math.min(idx1 + entity1.length, idx2 + entity2.length);
  const end = Math.max(idx1, idx2);
  if (start >= end) return null;

  const between = sentence.slice(start, end).trim();
  // Extract the main verb from the between text
  const verbMatch = between.match(
    /\b(is|are|was|were|has|have|had|uses?|creates?|builds?|requires?|depends?|contains?|includes?|provides?|supports?|enables?|connects?|links?|maps?|runs?|calls?|returns?|sends?|stores?|reads?|writes?)\b/i
  );
  return verbMatch ? verbMatch[1].toLowerCase() : between.length < 30 ? between : null;
}

/**
 * KnowledgeGraph: Entity-relation graph with PageRank scoring.
 */
export class KnowledgeGraph {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  private sessionGraphs = new Map<string, KnowledgeGraphState>();

  private getNodeId(label: string): string {
    return djb2Hash(label.toLowerCase());
  }

  /** Add or update a node in the graph */
  addNode(
    sessionId: string,
    label: string,
    type: GraphNode["type"]
  ): GraphNode {
    const graph = this.getOrCreateGraph(sessionId);
    const id = this.getNodeId(label);
    const existing = graph.nodes.get(id);

    if (existing) {
      existing.mentions++;
      existing.lastSeen = new Date();
      return existing;
    }

    const node: GraphNode = {
      id,
      label,
      type,
      mentions: 1,
      firstSeen: new Date(),
      lastSeen: new Date(),
      pageRank: 1.0,
    };
    graph.nodes.set(id, node);
    return node;
  }

  /** Add an edge between two nodes */
  addEdge(
    sessionId: string,
    sourceLabel: string,
    targetLabel: string,
    relation: string,
    episodeId: string
  ): void {
    const graph = this.getOrCreateGraph(sessionId);
    const sourceId = this.getNodeId(sourceLabel);
    const targetId = this.getNodeId(targetLabel);

    // Ensure nodes exist
    if (!graph.nodes.has(sourceId)) {
      this.addNode(sessionId, sourceLabel, "entity");
    }
    if (!graph.nodes.has(targetId)) {
      this.addNode(sessionId, targetLabel, "entity");
    }

    // Check for existing edge
    const existing = graph.edges.find(
      (e) =>
        e.source === sourceId &&
        e.target === targetId &&
        e.relation === relation
    );

    if (existing) {
      existing.weight++;
      existing.timestamp = new Date();
      if (!existing.episodeIds.includes(episodeId)) {
        existing.episodeIds.push(episodeId);
      }
    } else {
      graph.edges.push({
        source: sourceId,
        target: targetId,
        relation,
        weight: 1,
        episodeIds: [episodeId],
        timestamp: new Date(),
      });
    }
  }

  /** Ingest text: extract entities and relations, add to graph */
  ingestText(sessionId: string, text: string, episodeId: string): void {
    const entities = extractEntities(text);

    for (const ent of entities) {
      this.addNode(sessionId, ent.label, ent.type);
    }

    const relations = extractRelations(text, entities);
    for (const rel of relations) {
      this.addEdge(sessionId, rel.source, rel.target, rel.relation, episodeId);
    }
  }

  /** Run PageRank on the session's graph using power iteration */
  computePageRank(
    sessionId: string,
    damping = 0.85,
    iterations = 50
  ): void {
    const graph = this.getOrCreateGraph(sessionId);
    const nodes = Array.from(graph.nodes.values());
    const n = nodes.length;
    if (n === 0) return;

    // Power-iteration PageRank
    const nodeIds = nodes.map((nd) => nd.id);
    const scores: Record<string, number> = {};
    for (const id of nodeIds) scores[id] = 1 / n;

    for (let iter = 0; iter < iterations; iter++) {
      const next: Record<string, number> = {};
      for (const id of nodeIds) next[id] = (1 - damping) / n;

      for (const edge of graph.edges) {
        if (!scores[edge.source]) continue;
        const outDegree = graph.edges.filter((e) => e.source === edge.source).length;
        if (outDegree > 0) {
          next[edge.target] = (next[edge.target] ?? 0) + damping * (scores[edge.source] / outDegree) * edge.weight;
        }
      }

      for (const id of nodeIds) scores[id] = next[id] ?? (1 / n);
    }

    // Apply scores back to our node objects
    for (const node of nodes) {
      node.pageRank = scores[node.id] ?? 1 / n;
    }
  }

  /** Associative recall: find nodes related to query via graph traversal */
  associativeRecall(
    sessionId: string,
    query: string,
    maxHops = 2,
    maxResults = 10
  ): Array<{ node: GraphNode; distance: number; path: string[] }> {
    const graph = this.getOrCreateGraph(sessionId);
    const queryEntities = extractEntities(query);
    const results: Array<{
      node: GraphNode;
      distance: number;
      path: string[];
    }> = [];

    // Find seed nodes matching query
    const seeds: string[] = [];
    for (const ent of queryEntities) {
      const id = this.getNodeId(ent.label);
      if (graph.nodes.has(id)) seeds.push(id);
    }

    // Also match by substring
    const queryLower = query.toLowerCase();
    for (const [id, node] of graph.nodes) {
      if (
        !seeds.includes(id) &&
        (node.label.toLowerCase().includes(queryLower) ||
          queryLower.includes(node.label.toLowerCase()))
      ) {
        seeds.push(id);
      }
    }

    if (seeds.length === 0) {
      // Return top PageRank nodes as fallback
      return Array.from(graph.nodes.values())
        .sort((a, b) => b.pageRank - a.pageRank)
        .slice(0, maxResults)
        .map((n) => ({ node: n, distance: Infinity, path: [n.label] }));
    }

    // BFS from seeds
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; distance: number; path: string[] }> =
      seeds.map((s) => ({
        nodeId: s,
        distance: 0,
        path: [graph.nodes.get(s)?.label ?? s],
      }));

    while (queue.length > 0) {
      const { nodeId, distance, path } = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = graph.nodes.get(nodeId);
      if (node) {
        results.push({ node, distance, path });
      }

      if (distance < maxHops) {
        // Follow outbound edges
        for (const edge of graph.edges) {
          if (edge.source === nodeId && !visited.has(edge.target)) {
            const targetNode = graph.nodes.get(edge.target);
            queue.push({
              nodeId: edge.target,
              distance: distance + 1,
              path: [...path, edge.relation, targetNode?.label ?? edge.target],
            });
          }
          if (edge.target === nodeId && !visited.has(edge.source)) {
            const sourceNode = graph.nodes.get(edge.source);
            queue.push({
              nodeId: edge.source,
              distance: distance + 1,
              path: [
                ...path,
                `←${edge.relation}`,
                sourceNode?.label ?? edge.source,
              ],
            });
          }
        }
      }
    }

    // Sort by PageRank-weighted distance
    return results
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          b.node.pageRank - a.node.pageRank
      )
      .slice(0, maxResults);
  }

  /** Get graph stats */
  getStats(sessionId: string) {
    const graph = this.getOrCreateGraph(sessionId);
    const nodes = Array.from(graph.nodes.values());
    const topEntities = nodes
      .sort((a, b) => b.pageRank - a.pageRank)
      .slice(0, 10)
      .map((n) => ({ label: n.label, pageRank: n.pageRank, type: n.type }));

    return {
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.length,
      topEntities,
    };
  }

  /** Get all nodes for a session */
  getNodes(sessionId: string): GraphNode[] {
    const graph = this.getOrCreateGraph(sessionId);
    return Array.from(graph.nodes.values());
  }

  /** Get all edges for a session */
  getEdges(sessionId: string): GraphEdge[] {
    const graph = this.getOrCreateGraph(sessionId);
    return [...graph.edges];
  }

  /** Check if a fact hash is reachable in the graph */
  containsFact(sessionId: string, factText: string): boolean {
    const graph = this.getOrCreateGraph(sessionId);
    const factLower = factText.toLowerCase();

    // Check if any node label or edge relation matches the fact content
    for (const [, node] of graph.nodes) {
      if (factLower.includes(node.label.toLowerCase())) return true;
    }
    for (const edge of graph.edges) {
      if (factLower.includes(edge.relation.toLowerCase())) return true;
    }
    return false;
  }

  /** Clear graph for a session */
  clearSession(sessionId: string): void {
    this.sessionGraphs.delete(sessionId);
  }

  private getOrCreateGraph(sessionId: string): KnowledgeGraphState {
    let graph = this.sessionGraphs.get(sessionId);
    if (!graph) {
      graph = { nodes: new Map(), edges: [] };
      this.sessionGraphs.set(sessionId, graph);
    }
    return graph;
  }
}
