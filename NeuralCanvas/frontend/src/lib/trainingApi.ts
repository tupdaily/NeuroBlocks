/**
 * Serialize React Flow graph to backend GraphSchema and call training API.
 * Backend expects: one "input", one "output", and types like linear, conv2d, relu, etc.
 */

import type { Node, Edge } from "reactflow";

// Backend schema (mirrors Python Pydantic models)
export interface GraphNodeSchema {
  id: string;
  type: string;
  params: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface GraphEdgeSchema {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface GraphMetadataSchema {
  name: string;
  created_at: string;
  description?: string;
}

export interface GraphSchema {
  version: string;
  nodes: GraphNodeSchema[];
  edges: GraphEdgeSchema[];
  metadata: GraphMetadataSchema;
}

export interface TrainingConfigSchema {
  epochs: number;
  batch_size: number;
  learning_rate: number;
  optimizer: string;
  train_split: number;
}

const BACKEND_SUPPORTED_TYPES = new Set([
  "input",
  "output",
  "linear",
  "conv2d",
  "maxpool2d",
  "adaptiveavgpool2d",
  "flatten",
  "relu",
  "gelu",
  "sigmoid",
  "tanh",
  "dropout",
  "batchnorm",
  "layernorm",
  "add",
  "concat",
  "softmax", // backend treats unknown types as Identity
]);

/** Map frontend BlockType + params to backend node type and params. */
function toBackendNodeType(
  frontendType: string,
  params: Record<string, unknown>
): { type: string; params: Record<string, unknown> } {
  const typeLower = frontendType.toLowerCase();
  switch (frontendType) {
    case "Input":
      return { type: "input", params: { ...params, shape: [1, 28, 28] } };
    case "Linear":
      return {
        type: "linear",
        params: {
          out_features: params.out_features ?? 128,
          bias: params.bias ?? true,
        },
      };
    case "Conv2D":
      return {
        type: "conv2d",
        params: {
          out_channels: params.out_channels ?? 32,
          kernel_size: params.kernel_size ?? 3,
          stride: params.stride ?? 1,
          padding: params.padding ?? 0,
        },
      };
    case "Flatten":
      return { type: "flatten", params: {} };
    case "Activation": {
      const act = (params.activation as string) ?? "relu";
      const backendAct = ["relu", "gelu", "sigmoid", "tanh"].includes(act)
        ? act
        : "relu";
      return { type: backendAct, params: {} };
    }
    case "Dropout":
      return { type: "dropout", params: { p: params.p ?? 0.5 } };
    case "LayerNorm":
      return {
        type: "layernorm",
        params: { normalized_shape: params.normalized_shape ?? 512 },
      };
    case "BatchNorm":
      return {
        type: "batchnorm",
        params: { num_features: params.num_features ?? 32 },
      };
    case "Softmax":
      return { type: "softmax", params: {} }; // backend treats as Identity
    case "Output":
      return { type: "output", params: {} };
    default:
      return { type: typeLower, params };
  }
}

/**
 * Convert React Flow nodes/edges to backend GraphSchema.
 * If the graph has an explicit Output block, use it as the single output node.
 * Otherwise injects a virtual "output" node connected to the single sink (node with no outgoing edges).
 * Returns null if graph has unsupported blocks, no output, or multiple output nodes.
 */
export function serializeGraphForTraining(
  nodes: Node[],
  edges: Edge[]
): { graph: GraphSchema; error?: string } {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const outputBlocks = nodes.filter((n) => (n.type as string) === "Output");

  if (outputBlocks.length > 1) {
    return {
      graph: null as unknown as GraphSchema,
      error: "Graph must have exactly one Output node.",
    };
  }

  const hasExplicitOutput = outputBlocks.length === 1;

  if (!hasExplicitOutput) {
    const outDegree: Record<string, number> = {};
    nodes.forEach((n) => (outDegree[n.id] = 0));
    edges.forEach((e) => {
      if (nodeIds.has(e.source)) outDegree[e.source] = (outDegree[e.source] ?? 0) + 1;
    });
    const sinks = nodes.filter((n) => outDegree[n.id] === 0);
    if (sinks.length === 0) {
      return { graph: null as unknown as GraphSchema, error: "Graph has no Output node. Add an Output block and connect it to your last layer." };
    }
    if (sinks.length > 1) {
      return { graph: null as unknown as GraphSchema, error: "Graph must have exactly one Output node (one sink when no Output block is used)." };
    }
  }

  const unsupported = nodes.filter((n) => {
    const t = n.type as string;
    if (t === "Input" || t === "Output") return false;
    const { type } = toBackendNodeType(t, (n.data?.params as Record<string, unknown>) ?? {});
    return !BACKEND_SUPPORTED_TYPES.has(type);
  });
  if (unsupported.length > 0) {
    const types = [...new Set(unsupported.map((n) => n.type as string))];
    return {
      graph: null as unknown as GraphSchema,
      error: `Unsupported block types for training: ${types.join(", ")}. Supported: Input, Output, Linear, Conv2D, Flatten, Activation (relu/gelu/sigmoid/tanh), Dropout, LayerNorm, BatchNorm.`,
    };
  }

  let backendNodes: GraphNodeSchema[] = nodes.map((n) => {
    const params = (n.data?.params as Record<string, unknown>) ?? {};
    const { type, params: backendParams } = toBackendNodeType(n.type as string, params);
    const pos = n.position ?? { x: 0, y: 0 };
    return {
      id: n.id,
      type,
      params: backendParams,
      position: { x: pos.x, y: pos.y },
    };
  });

  let backendEdges: GraphEdgeSchema[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: (e.sourceHandle as string) ?? "out",
    target: e.target,
    targetHandle: (e.targetHandle as string) ?? "in",
  }));

  if (!hasExplicitOutput) {
    const outDegree: Record<string, number> = {};
    nodes.forEach((n) => (outDegree[n.id] = 0));
    edges.forEach((e) => {
      if (nodeIds.has(e.source)) outDegree[e.source] = (outDegree[e.source] ?? 0) + 1;
    });
    const sinkId = nodes.find((n) => outDegree[n.id] === 0)!.id;
    const outputNodeId = "output-virtual";
    backendNodes = [
      ...backendNodes,
      {
        id: outputNodeId,
        type: "output",
        params: { loss_fn: "CrossEntropyLoss" },
        position: { x: 0, y: 0 },
      },
    ];
    backendEdges = [
      ...backendEdges,
      {
        id: "edge-to-output",
        source: sinkId,
        sourceHandle: "out",
        target: outputNodeId,
        targetHandle: "in",
      },
    ];
  }

  const graph: GraphSchema = {
    version: "1",
    nodes: backendNodes,
    edges: backendEdges,
    metadata: {
      name: "NeuralCanvas",
      created_at: new Date().toISOString(),
      description: "Exported for training",
    },
  };

  return { graph };
}

export function getApiBase(): string {
  if (typeof window === "undefined") return "http://localhost:8000";
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

export async function fetchDatasets(): Promise<
  { id: string; name: string; description: string; input_shape: number[]; num_classes: number }[]
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/datasets/`);
  if (!res.ok) throw new Error("Failed to fetch datasets");
  return res.json();
}

export async function startTraining(
  graph: GraphSchema,
  datasetId: string,
  config: TrainingConfigSchema
): Promise<{ job_id: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/training/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      graph,
      dataset_id: datasetId,
      training_config: config,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? res.statusText ?? "Failed to start training");
  }
  return res.json();
}

const TRAINING_WS_DEBUG = typeof process !== "undefined" && process.env.NODE_ENV === "development";

export function openTrainingWebSocket(
  jobId: string,
  onMessage: (msg: Record<string, unknown>) => void,
  onClose: () => void
): () => void {
  const base = getApiBase();
  const protocol = base.startsWith("https") ? "wss" : "ws";
  const host = base.replace(/^https?:\/\//, "");
  const wsUrl = `${protocol}://${host}/ws/training/${jobId}`;
  if (TRAINING_WS_DEBUG) {
    console.log("[Training WS] Connecting to", wsUrl);
  }
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    if (TRAINING_WS_DEBUG) console.log("[Training WS] Open");
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as Record<string, unknown>;
      const type = msg.type as string;
      if (TRAINING_WS_DEBUG) {
        if (type === "batch") {
          console.log("[Training WS] batch", msg.epoch, msg.batch, "loss", msg.loss);
        } else if (type === "epoch") {
          console.log("[Training WS] epoch", msg.epoch, "train_loss", msg.train_loss, "val_loss", msg.val_loss, "train_acc", msg.train_acc, "val_acc", msg.val_acc);
        } else {
          console.log("[Training WS] message", type, msg);
        }
      }
      onMessage(msg);
    } catch {
      // ignore
    }
  };

  ws.onerror = (e) => {
    if (TRAINING_WS_DEBUG) console.error("[Training WS] Error", e);
    onClose();
  };

  ws.onclose = (e) => {
    if (TRAINING_WS_DEBUG) console.log("[Training WS] Close", e.code, e.reason || "(no reason)");
    onClose();
  };

  return () => {
    ws.readyState === WebSocket.OPEN && ws.close();
  };
}

export async function stopTraining(jobId: string): Promise<void> {
  const base = getApiBase();
  await fetch(`${base}/api/training/${jobId}/stop`, { method: "POST" });
}
