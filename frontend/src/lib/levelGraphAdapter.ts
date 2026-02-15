import type { GraphSchema } from "@/types/graph";
import type { Node, Edge } from "@xyflow/react";
import { BLOCK_REGISTRY } from "@/neuralcanvas/lib/blockRegistry";

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
    board: "Board",
    text_input: "TextInput",
    textinput: "TextInput",
    output: "Output",
    linear: "Linear",
    conv2d: "Conv2D",
    maxpool2d: "MaxPool2D",
    maxpool: "MaxPool2D",
    maxpool1d: "MaxPool1D",
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
    positional_encoding: "PositionalEncoding",
    positional_embedding: "PositionalEmbedding",
    positionalembedding: "PositionalEmbedding",
    softmax: "Softmax",
    add: "Add",
    concat: "Concat",
  };
  return map[lower] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

/** Horizontal spacing when applying sequential layout so blocks never stack. */
const SEQUENTIAL_LAYOUT_SPACING = 300;
const SEQUENTIAL_LAYOUT_START = { x: 60, y: 200 };

/**
 * Returns true if nodes have no positions, all same position, or schema used (0,0) for all.
 */
function needsSequentialLayout(nodes: { position?: { x?: number; y?: number } }[]): boolean {
  if (nodes.length === 0) return false;
  const first = nodes[0].position ?? { x: 0, y: 0 };
  const allSame = nodes.every((n) => {
    const p = n.position ?? { x: 0, y: 0 };
    return p.x === first.x && p.y === first.y;
  });
  if (allSame && nodes.length > 1) return true;
  const allOrigin = nodes.every((n) => {
    const p = n.position ?? { x: 0, y: 0 };
    return p.x === 0 && p.y === 0;
  });
  return allOrigin;
}

export interface LevelGraphToNeuralCanvasOptions {
  /** When true, always lay out nodes in a horizontal row (no stacking). Use for paper walkthrough steps so each new block is clearly visible and connectors show. */
  forceSequentialLayout?: boolean;
}

/**
 * Compute topological layers for a graph. Layer 0 = nodes with no incoming edges
 * (inputs), layer 1 = nodes whose predecessors are all in layer 0, etc.
 * Returns an array of node id arrays, one per layer.
 */
export function computeTopologicalLayers(
  nodeIds: string[],
  edges: { source: string; target: string }[]
): string[][] {
  const idSet = new Set(nodeIds);
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    incoming.set(id, new Set());
    outgoing.set(id, new Set());
  }
  for (const e of edges) {
    if (idSet.has(e.source) && idSet.has(e.target) && e.source !== e.target) {
      incoming.get(e.target)!.add(e.source);
      outgoing.get(e.source)!.add(e.target);
    }
  }
  const layers: string[][] = [];
  const placed = new Set<string>();
  let remaining = new Set(nodeIds);
  while (remaining.size > 0) {
    const layer: string[] = [];
    for (const id of remaining) {
      const deps = incoming.get(id)!;
      const allPlaced = [...deps].every((d) => placed.has(d));
      if (allPlaced) layer.push(id);
    }
    if (layer.length === 0) {
      // Cyclic or orphaned nodes; place remaining in last layer
      layer.push(...remaining);
    }
    for (const id of layer) {
      placed.add(id);
      remaining.delete(id);
    }
    layers.push(layer);
  }
  return layers;
}

/** Normalize params so UI and backend get consistent formats (e.g. Input shape, Conv2D scalars). */
function normalizeNodeParams(
  type: string,
  params: Record<string, unknown>
): Record<string, number | string> {
  const p = { ...(params ?? {}) } as Record<string, number | string>;
  const typeLower = type.toLowerCase();

  if (typeLower === "input") {
    const raw = p.input_shape ?? p.shape;
    if (Array.isArray(raw)) {
      const dims = raw
        .map((x) => (x == null ? 1 : Number(x)))
        .filter((n) => Number.isFinite(n));
      if (dims.length > 0) {
        // Frontend shape engine expects input_shape as "C,H,W" string
        p.input_shape = dims.join(",") as unknown as string;
      }
    }
    if (p.input_shape == null) p.input_shape = "1,28,28";
  }

  if (typeLower === "conv2d") {
    const k = p.kernel_size;
    p.kernel_size = Array.isArray(k) ? (k[0] as number) ?? 3 : (typeof k === "number" ? k : parseInt(String(k), 10) || 3);
    const s = p.stride;
    p.stride = Array.isArray(s) ? (s[0] as number) ?? 1 : (typeof s === "number" ? s : parseInt(String(s), 10) || 1);
    const pad = p.padding;
    if (pad === "same" || String(pad).toLowerCase() === "same") {
      p.padding = typeof p.kernel_size === "number" ? Math.floor((p.kernel_size as number) / 2) : 1;
    } else {
      p.padding = Array.isArray(pad) ? (pad[0] as number) ?? 0 : (typeof pad === "number" ? pad : parseInt(String(pad), 10) || 0);
    }
  }

  if (typeLower === "maxpool2d" || typeLower === "maxpool") {
    const k = p.kernel_size;
    p.kernel_size = Array.isArray(k) ? (k[0] as number) ?? 2 : (typeof k === "number" ? k : parseInt(String(k), 10) || 2);
    const s = p.stride;
    p.stride = Array.isArray(s) ? (s[0] as number) ?? 2 : (typeof s === "number" ? s : parseInt(String(s), 10) || 2);
  }

  return p;
}

/** Block types that use in_a/in_b instead of "in" for inputs. */
const MULTI_INPUT_TYPES = new Set(["Add", "Concat"]);

/**
 * Convert a level's graph_json (GraphSchema) into NeuralCanvas nodes and edges.
 * Defensive: tolerates missing nodes/edges or malformed schema. Filters edges to
 * valid node pairs and fixes targetHandle for Add/Concat when LLM sends "in".
 * If nodes would stack (missing/duplicate positions), or forceSequentialLayout is set, applies a sequential horizontal layout.
 */
export function levelGraphToNeuralCanvas(
  schema: GraphSchema,
  options?: LevelGraphToNeuralCanvasOptions
): {
  nodes: Node[];
  edges: Edge[];
} {
  const rawNodes = Array.isArray(schema?.nodes) ? schema.nodes : [];
  const mappedNodes = rawNodes
    .map((n) => {
      const typeStr = typeof n?.type === "string" ? n.type : "Input";
      const canonicalType = toNeuralCanvasType(typeStr);
      if (!canonicalType || !(canonicalType in BLOCK_REGISTRY)) return null;
      const params = normalizeNodeParams(typeStr, (n?.params && typeof n.params === "object" ? n.params : {}) as Record<string, unknown>);
      return {
        id: String(n?.id ?? `node-${Math.random().toString(36).slice(2, 9)}`),
        type: canonicalType,
        position: n?.position && typeof n.position === "object" ? { x: Number(n.position.x) || 0, y: Number(n.position.y) || 0 } : { x: 0, y: 0 },
        data: {
          params: params as Record<string, number | string>,
        },
      } as Node;
    })
    .filter((n): n is Node => n !== null);

  const useSequential =
    options?.forceSequentialLayout === true || needsSequentialLayout(mappedNodes);
  const nodes: Node[] = useSequential
    ? mappedNodes.map((node, i) => ({
        ...node,
        position: {
          x: SEQUENTIAL_LAYOUT_START.x + i * SEQUENTIAL_LAYOUT_SPACING,
          y: SEQUENTIAL_LAYOUT_START.y,
        },
      }))
    : mappedNodes;

  const nodeIds = new Set(nodes.map((n) => n.id));

  const rawEdges = Array.isArray(schema?.edges) ? schema.edges : [];
  const edgesForHandleFix: { e: (typeof rawEdges)[0]; targetType: string }[] = rawEdges
    .filter((e) => {
      const src = String(e?.source ?? "");
      const tgt = String(e?.target ?? "");
      return src && tgt && nodeIds.has(src) && nodeIds.has(tgt);
    })
    .map((e) => {
      const tgtId = String(e?.target ?? "");
      const targetNode = nodes.find((n) => n.id === tgtId);
      const targetType = (targetNode?.type as string) ?? "";
      return { e, targetType };
    });

  const inPortCount = new Map<string, number>();
  const edges: Edge[] = edgesForHandleFix.map(({ e, targetType }) => {
    let targetHandle = (e?.targetHandle as string) ?? "in";
    if (MULTI_INPUT_TYPES.has(targetType)) {
      if (targetHandle !== "in_a" && targetHandle !== "in_b") {
        const count = (inPortCount.get(String(e?.target ?? "")) ?? 0);
        inPortCount.set(String(e?.target ?? ""), count + 1);
        targetHandle = count === 0 ? "in_a" : "in_b";
      }
    }
    return {
      id: (e?.id as string) ?? `e-${e?.source}-${e?.target}`,
      source: String(e?.source ?? ""),
      target: String(e?.target ?? ""),
      sourceHandle: (e?.sourceHandle as string) ?? "out",
      targetHandle,
      type: "shape",
      animated: false,
    };
  });

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
