import type { GraphSchema } from "@/types/graph";
import type { Node, Edge } from "@xyflow/react";

/**
 * Serialize NeuralCanvas React Flow nodes/edges to GraphSchema for saving to Supabase.
 */
export function neuralCanvasToGraphSchema(
  nodes: Node[],
  edges: Edge[],
  metadata?: { name?: string; created_at?: string }
): GraphSchema {
  return {
    version: "1.0",
    nodes: nodes.map((n) => ({
      id: n.id,
      type: (n.type as string) ?? "Input",
      params: (n.data?.params && typeof n.data.params === "object"
        ? n.data.params
        : {}) as Record<string, unknown>,
      position: n.position ?? { x: 0, y: 0 },
    })),
    edges: (edges ?? []).map((e) => ({
      id: e.id ?? `e-${e.source}-${e.target}`,
      source: e.source,
      sourceHandle: e.sourceHandle ?? "out",
      target: e.target,
      targetHandle: e.targetHandle ?? "in",
    })),
    metadata: {
      name: metadata?.name ?? "Untitled Model",
      created_at: metadata?.created_at ?? new Date().toISOString(),
    },
  };
}

/**
 * Map AIPlayground/levels graph node type (lowercase) to NeuralCanvas BlockType (PascalCase).
 * Only types that exist in NeuralCanvas are mapped; unknown types are PascalCased.
 */
function toNeuralCanvasType(type: string): string {
  const lower = type.toLowerCase();
  const map: Record<string, string> = {
    input: "Input",
    text_input: "TextInput",
    textinput: "TextInput",
    output: "Output",
    linear: "Linear",
    conv2d: "Conv2D",
    lstm: "LSTM",
    attention: "Attention",
    layernorm: "LayerNorm",
    batchnorm: "BatchNorm",
    activation: "Activation",
    relu: "Activation",
    gelu: "Activation",
    sigmoid: "Activation",
    tanh: "Activation",
    dropout: "Dropout",
    flatten: "Flatten",
    embedding: "Embedding",
    text_embedding: "TextEmbedding",
    textembedding: "TextEmbedding",
    positionalencoding: "PositionalEncoding",
    positional_embedding: "PositionalEmbedding",
    positionalembedding: "PositionalEmbedding",
    softmax: "Softmax",
    add: "Add",
    concat: "Concat",
  };
  return map[lower] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Convert a level's graph_json (GraphSchema) into NeuralCanvas nodes and edges.
 */
export function levelGraphToNeuralCanvas(schema: GraphSchema): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = schema.nodes.map((n) => ({
    id: n.id,
    type: toNeuralCanvasType(n.type),
    position: n.position ?? { x: 0, y: 0 },
    data: {
      params: (n.params ?? {}) as Record<string, number | string>,
    },
  }));

  const edges: Edge[] = (schema.edges ?? []).map((e) => ({
    id: e.id ?? `e-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? "out",
    targetHandle: e.targetHandle ?? "in",
    type: "shape",
    animated: false,
  }));

  return { nodes, edges };
}

/** Canonical form for structural graph comparison (ignores ids and positions). */
export interface NormalizedGraph {
  types: string[];
  edges: [number, number][];
}

/**
 * Canonical type for comparison: "Activation" with params becomes "relu"/"gelu" etc.
 * so that UI graphs (Activation block) match solution graphs (stored as "relu").
 */
function canonicalTypeForComparison(node: { type?: string; params?: Record<string, unknown> }): string {
  const t = (node.type ?? "").toLowerCase();
  if (t === "activation") {
    const p = node.params ?? {};
    const act = (p.function ?? p.activation ?? "relu") as string;
    return typeof act === "string" ? act.toLowerCase() : "relu";
  }
  return t;
}

/**
 * Normalize a GraphSchema to a canonical form for comparison: node types in position order,
 * edges as index pairs. Node types are lowercased; "activation" is normalized to "relu"/"gelu" etc.
 */
export function normalizeGraphForComparison(schema: GraphSchema): NormalizedGraph {
  const nodes = [...(schema.nodes ?? [])].sort(
    (a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0) || (a.position?.y ?? 0) - (b.position?.y ?? 0)
  );
  const idToIndex = new Map<string, number>();
  nodes.forEach((n, i) => idToIndex.set(n.id, i));
  const types = nodes.map((n) => canonicalTypeForComparison(n));
  const edges: [number, number][] = (schema.edges ?? [])
    .map((e) => {
      const from = idToIndex.get(e.source);
      const to = idToIndex.get(e.target);
      if (from === undefined || to === undefined) return null;
      return [from, to] as [number, number];
    })
    .filter((e): e is [number, number] => e !== null)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { types, edges };
}

/**
 * Return true if the two graphs are structurally equal (same node types in order, same edges).
 */
export function graphsMatchStructurally(a: GraphSchema, b: GraphSchema): boolean {
  const na = normalizeGraphForComparison(a);
  const nb = normalizeGraphForComparison(b);
  return (
    na.types.length === nb.types.length &&
    na.types.every((t, i) => t === nb.types[i]) &&
    na.edges.length === nb.edges.length &&
    na.edges.every((e, i) => e[0] === nb.edges[i][0] && e[1] === nb.edges[i][1])
  );
}
