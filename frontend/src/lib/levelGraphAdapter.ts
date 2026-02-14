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
    output: "Output",
    linear: "Linear",
    conv2d: "Conv2D",
    lstm: "LSTM",
    attention: "Attention",
    layernorm: "LayerNorm",
    batchnorm: "BatchNorm",
    activation: "Activation",
    dropout: "Dropout",
    flatten: "Flatten",
    embedding: "Embedding",
    softmax: "Softmax",
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
