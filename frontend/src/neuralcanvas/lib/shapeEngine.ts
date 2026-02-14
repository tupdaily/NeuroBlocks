// ---------------------------------------------------------------------------
// NeuralCanvas — Tensor Shape Propagation Engine
// ---------------------------------------------------------------------------
//
// Computes output shapes through the entire directed graph of blocks so the
// UI can show live shape annotations and highlight dimension mismatches.
// ---------------------------------------------------------------------------

import type { BlockType } from "./blockRegistry";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Symbolic dimension.
 * - A positive integer means a concrete size (e.g. 784, 32).
 * - The string `"B"` represents the batch dimension.
 * - The string `"seq"` represents a variable sequence-length dimension.
 */
export type Dim = number | "B" | "seq";

/** A tensor shape is an ordered list of dimensions. */
export type Shape = Dim[];

/** Per-node result produced by the propagation pass. */
export interface ShapeResult {
  inputShape: Shape | null;
  outputShape: Shape | null;
  /** Human-friendly error message if something went wrong. */
  error?: string;
}

/** Result returned by `validateConnection`. */
export interface ConnectionValidation {
  valid: boolean;
  error?: string;
}

/**
 * Minimal node representation expected by the engine.
 * Mirrors the subset of React Flow `Node` we actually need.
 */
export interface ShapeNode {
  id: string;
  type: string; // BlockType, but kept as string for React Flow compat
  data: {
    params: Record<string, number | string>;
  };
}

/**
 * Minimal edge representation expected by the engine.
 */
export interface ShapeEdge {
  id: string;
  source: string;
  target: string;
}

// ---------------------------------------------------------------------------
// Helpers — numeric coercion
// ---------------------------------------------------------------------------

/** Safely read an integer param, falling back to `fallback`. */
function intParam(
  params: Record<string, number | string>,
  key: string,
  fallback: number,
): number {
  const v = params[key];
  if (v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Safely read a string param. */
function strParam(
  params: Record<string, number | string>,
  key: string,
  fallback: string,
): string {
  const v = params[key];
  if (v === undefined) return fallback;
  return String(v);
}

// ---------------------------------------------------------------------------
// Topological sort (Kahn's algorithm) with cycle detection
// ---------------------------------------------------------------------------

interface TopoResult {
  /** Node IDs in topological order (empty when a cycle is detected). */
  sorted: string[];
  /** True when the graph contains at least one cycle. */
  hasCycle: boolean;
  /** IDs of nodes that participate in a cycle (subset, not exhaustive). */
  cycleNodeIds: Set<string>;
}

function topologicalSort(
  nodeIds: string[],
  edges: ShapeEdge[],
): TopoResult {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const e of edges) {
    // Skip edges referencing nodes we don't know about.
    if (!inDegree.has(e.source) || !inDegree.has(e.target)) continue;
    adjacency.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const neighbour of adjacency.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbour) ?? 1) - 1;
      inDegree.set(neighbour, newDeg);
      if (newDeg === 0) queue.push(neighbour);
    }
  }

  const hasCycle = sorted.length !== nodeIds.length;
  const cycleNodeIds = new Set<string>();
  if (hasCycle) {
    const sortedSet = new Set(sorted);
    for (const id of nodeIds) {
      if (!sortedSet.has(id)) cycleNodeIds.add(id);
    }
  }

  return { sorted, hasCycle, cycleNodeIds };
}

// ---------------------------------------------------------------------------
// Per-block shape computation
// ---------------------------------------------------------------------------

/**
 * Given a block type, its params, and the resolved input shape (may be null
 * for source nodes like Input), compute the output shape **or** an error.
 * For Add/Concat, pass all input shapes in inputShapes (length >= 2).
 */
function computeBlockShape(
  blockType: BlockType,
  params: Record<string, number | string>,
  inputShape: Shape | null,
  inputShapes?: Shape[] | null,
): { outputShape: Shape | null; error?: string } {
  switch (blockType) {
    // ----- Input -----
    case "Input": {
      // Shape is for display only; actual input shape comes from dataset chosen in Training panel.
      return { outputShape: ["B", 1, 28, 28] };
    }

    // ----- TextInput -----
    case "TextInput": {
      const batch = intParam(params, "batch_size", 1);
      const seqLen = intParam(params, "seq_len", 128);
      return { outputShape: [batch, seqLen] };
    }

    // ----- Linear -----
    case "Linear": {
      if (!inputShape) return { outputShape: null, error: "No input connected." };
      const inF = intParam(params, "in_features", 784);
      const outF = intParam(params, "out_features", 128);
      const lastDim = inputShape[inputShape.length - 1];
      const lastDimNum = typeof lastDim === "number" ? lastDim : Number(lastDim);
      if (Number.isFinite(lastDimNum) && Number(inF) !== lastDimNum) {
        return {
          outputShape: null,
          error: `Linear expects last dim = ${inF} but got ${lastDim}. Change in_features to ${lastDim} or check the upstream block.`,
        };
      }
      // Replace last dim with out_features, keep leading dims.
      return { outputShape: [...inputShape.slice(0, -1), outF] };
    }

    // ----- Conv2D -----
    case "Conv2D": {
      if (!inputShape) return { outputShape: null, error: "No input connected." };
      if (inputShape.length !== 4) {
        return {
          outputShape: null,
          error: `Conv2D expects 4D input [batch, channels, height, width] but got ${inputShape.length}D ${getShapeLabel(inputShape)}. Try adding a Reshape block.`,
        };
      }
      const [batch, cIn, h, w] = inputShape;
      const expectedCIn = intParam(params, "in_channels", 1);
      if (typeof cIn === "number" && cIn !== expectedCIn) {
        return {
          outputShape: null,
          error: `Conv2D in_channels is ${expectedCIn} but input has ${cIn} channels. Set in_channels to ${cIn}.`,
        };
      }
      const cOut = intParam(params, "out_channels", 32);
      const k = intParam(params, "kernel_size", 3);
      const s = intParam(params, "stride", 1);
      const p = intParam(params, "padding", 0);
      const computeDim = (size: Dim): Dim => {
        if (typeof size !== "number") return size; // symbolic — can't compute
        return Math.floor((size + 2 * p - k) / s) + 1;
      };
      return { outputShape: [batch, cOut, computeDim(h), computeDim(w)] };
    }

    // ----- Flatten -----
    case "Flatten": {
      if (!inputShape) return { outputShape: null, error: "No input connected." };
      if (inputShape.length < 2) {
        return {
          outputShape: null,
          error: `Flatten needs at least 2D input but got ${inputShape.length}D ${getShapeLabel(inputShape)}.`,
        };
      }
      const rest = inputShape.slice(1);
      const allNumeric = rest.every((d): d is number => typeof d === "number");
      if (allNumeric) {
        const product = (rest as number[]).reduce((a, b) => a * b, 1);
        return { outputShape: [inputShape[0], product] };
      }
      // Contains symbolic dims — mark as unknown product.
      return { outputShape: [inputShape[0], "seq"] };
    }

    // ----- LSTM -----
    case "LSTM": {
      if (!inputShape) return { outputShape: null, error: "No input connected." };
      if (inputShape.length !== 3) {
        return {
          outputShape: null,
          error: `LSTM expects 3D input [batch, seq, features] but got ${inputShape.length}D ${getShapeLabel(inputShape)}.`,
        };
      }
      const [batch, seq, feat] = inputShape;
      const inSize = intParam(params, "input_size", 128);
      if (typeof feat === "number" && feat !== inSize) {
        return {
          outputShape: null,
          error: `LSTM input_size is ${inSize} but last dim is ${feat}. Set input_size to ${feat}.`,
        };
      }
      const hidden = intParam(params, "hidden_size", 256);
      return { outputShape: [batch, seq, hidden] };
    }

    // ----- Attention -----
    case "Attention": {
      if (!inputShape) return { outputShape: null, error: "No input connected." };
      if (inputShape.length !== 3) {
        return {
          outputShape: null,
          error: `Attention expects 3D input [batch, seq, embed] but got ${inputShape.length}D ${getShapeLabel(inputShape)}.`,
        };
      }
      const embedDim = intParam(params, "embed_dim", 512);
      const numHeads = intParam(params, "num_heads", 8);
      const lastDim = inputShape[2];
      if (typeof lastDim === "number" && lastDim !== embedDim) {
        return {
          outputShape: null,
          error: `Attention embed_dim is ${embedDim} but input last dim is ${lastDim}. Set embed_dim to ${lastDim}.`,
        };
      }
      if (embedDim % numHeads !== 0) {
        return {
          outputShape: null,
          error: `embed_dim (${embedDim}) must be divisible by num_heads (${numHeads}). ${embedDim} % ${numHeads} = ${embedDim % numHeads}.`,
        };
      }
      // Output shape is same as input.
      return { outputShape: [...inputShape] };
    }

    // ----- LayerNorm -----
    case "LayerNorm": {
      if (!inputShape) return { outputShape: null, error: "No input connected." };
      const normShape = intParam(params, "normalized_shape", 512);
      const lastDim = inputShape[inputShape.length - 1];
      if (typeof lastDim === "number" && lastDim !== normShape) {
        return {
          outputShape: null,
          error: `LayerNorm normalized_shape is ${normShape} but last dim is ${lastDim}. Set normalized_shape to ${lastDim}.`,
        };
      }
      return { outputShape: [...inputShape] };
    }

    // ----- BatchNorm -----
    case "BatchNorm": {
      if (!inputShape) return { outputShape: null, error: "No input connected." };
      if (inputShape.length < 2) {
        return {
          outputShape: null,
          error: `BatchNorm needs at least 2D input but got ${inputShape.length}D.`,
        };
      }
      const numFeat = intParam(params, "num_features", 32);
      // For BatchNorm1d/2d, the feature dim is dim-1.
      const featDim = inputShape[1];
      if (typeof featDim === "number" && featDim !== numFeat) {
        return {
          outputShape: null,
          error: `BatchNorm num_features is ${numFeat} but dim-1 is ${featDim}. Set num_features to ${featDim}.`,
        };
      }
      return { outputShape: [...inputShape] };
    }

    // ----- Activation / Dropout / Softmax — shape passthrough -----
    case "Activation":
    case "Dropout":
    case "Softmax": {
      if (!inputShape) return { outputShape: null, error: "No input connected." };
      return { outputShape: [...inputShape] };
    }

    // ----- Output (sink: accepts any shape, no output) -----
    case "Output": {
      if (!inputShape) return { outputShape: null, error: "No input connected." };
      return { outputShape: null }; // Sink — no downstream shape.
    }

    // ----- Embedding -----
    case "Embedding": {
      if (!inputShape) return { outputShape: null, error: "No input connected." };
      if (inputShape.length !== 2) {
        return {
          outputShape: null,
          error: `Embedding expects 2D input [batch, seq_len] but got ${inputShape.length}D ${getShapeLabel(inputShape)}.`,
        };
      }
      const embedDim = intParam(params, "embedding_dim", 128);
      return { outputShape: [inputShape[0], inputShape[1], embedDim] };
    }

    // ----- TextEmbedding (same as Embedding; embedding_dim aligns with d_model downstream) -----
    case "TextEmbedding": {
      if (!inputShape) return { outputShape: null, error: "No input connected." };
      if (inputShape.length !== 2) {
        return {
          outputShape: null,
          error: `Text Embedding expects 2D input [batch, seq_len] but got ${inputShape.length}D ${getShapeLabel(inputShape)}. Connect Text Input.`,
        };
      }
      const embedDim = intParam(params, "embedding_dim", 128);
      return { outputShape: [inputShape[0], inputShape[1], embedDim] };
    }

    // ----- PositionalEncoding (passthrough shape; adds sinusoidal encoding) -----
    case "PositionalEncoding": {
      if (!inputShape) return { outputShape: null, error: "No input connected." };
      if (inputShape.length !== 3) {
        return {
          outputShape: null,
          error: `PositionalEncoding expects 3D input [batch, seq, d_model] but got ${inputShape.length}D ${getShapeLabel(inputShape)}.`,
        };
      }
      return { outputShape: [...inputShape] };
    }

    // ----- PositionalEmbedding (passthrough shape; add learned positions; d_model must match upstream) -----
    case "PositionalEmbedding": {
      if (!inputShape) return { outputShape: null, error: "No input connected." };
      if (inputShape.length !== 3) {
        return {
          outputShape: null,
          error: `Positional Embedding expects 3D input [batch, seq, d_model] but got ${inputShape.length}D ${getShapeLabel(inputShape)}. Use after Text Embedding.`,
        };
      }
      const dModel = intParam(params, "d_model", 128);
      const lastDim = inputShape[2];
      if (typeof lastDim === "number" && lastDim !== dModel) {
        return {
          outputShape: null,
          error: `Positional Embedding d_model is ${dModel} but input last dim is ${lastDim}. Set d_model to ${lastDim} to match Text Embedding.`,
        };
      }
      return { outputShape: [...inputShape] };
    }

    // ----- Add (element-wise sum; both inputs must have same shape) -----
    case "Add": {
      const shapes = inputShapes ?? (inputShape ? [inputShape] : []);
      if (shapes.length < 2) {
        return { outputShape: null, error: "Add block needs two inputs. Connect both ports." };
      }
      const [a, b] = shapes;
      const aStr = getShapeLabel(a);
      const bStr = getShapeLabel(b);
      if (a.length !== b.length) {
        return { outputShape: null, error: `Add shape mismatch: ${aStr} vs ${bStr}. Both inputs must have the same shape.` };
      }
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
          return { outputShape: null, error: `Add shape mismatch: ${aStr} vs ${bStr}. Both inputs must have the same shape.` };
        }
      }
      return { outputShape: [...a] };
    }

    // ----- Concat (concatenate along dim) -----
    case "Concat": {
      const shapes = inputShapes ?? (inputShape ? [inputShape] : []);
      if (shapes.length < 2) {
        return { outputShape: null, error: "Concat block needs at least two inputs. Connect both ports." };
      }
      const dim = intParam(params, "dim", 1);
      const ref = shapes[0];
      for (let i = 1; i < shapes.length; i++) {
        if (shapes[i].length !== ref.length) {
          return { outputShape: null, error: `Concat: all inputs must have same rank. Got ${getShapeLabel(ref)} vs ${getShapeLabel(shapes[i])}.` };
        }
      }
      const out = [...ref];
      if (dim >= 0 && dim < ref.length && typeof ref[dim] === "number") {
        let sum = ref[dim] as number;
        for (let i = 1; i < shapes.length; i++) {
          const d = shapes[i][dim];
          if (typeof d === "number") sum += d;
          else { sum = NaN; break; }
        }
        if (Number.isFinite(sum)) out[dim] = sum;
      }
      return { outputShape: out };
    }

    default: {
      return { outputShape: null, error: `Unknown block type "${blockType}".` };
    }
  }
}

// ---------------------------------------------------------------------------
// Main propagation entry point
// ---------------------------------------------------------------------------

/**
 * Propagate tensor shapes through the entire graph.
 *
 * Uses topological sort (Kahn's algorithm) to process nodes in dependency
 * order.  Detects cycles and marks disconnected nodes with unknown shapes.
 *
 * @returns A Map from node ID to its resolved `ShapeResult`.
 */
export function propagateShapes(
  nodes: ShapeNode[],
  edges: ShapeEdge[],
): Map<string, ShapeResult> {
  const results = new Map<string, ShapeResult>();
  const nodeMap = new Map<string, ShapeNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Build a reverse-lookup: target → [sourceIds]
  const incomingMap = new Map<string, string[]>();
  for (const n of nodes) incomingMap.set(n.id, []);
  for (const e of edges) {
    if (!incomingMap.has(e.target)) continue;
    incomingMap.get(e.target)!.push(e.source);
  }

  // Topological sort
  const nodeIds = nodes.map((n) => n.id);
  const { sorted, hasCycle, cycleNodeIds } = topologicalSort(nodeIds, edges);

  // Mark cycle nodes immediately.
  if (hasCycle) {
    cycleNodeIds.forEach((id) => {
      results.set(id, {
        inputShape: null,
        outputShape: null,
        error: "This block is part of a cycle — break the loop to enable shape propagation.",
      });
    });
  }

  // Process in topological order.
  for (const nodeId of sorted) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const blockType = node.type as BlockType;
    const params = node.data?.params ?? {};

    const predecessors = incomingMap.get(nodeId) ?? [];
    let inputShape: Shape | null = null;
    let inputShapes: Shape[] | null = null;

    if (blockType === "Add" || blockType === "Concat") {
      // Multi-input: collect all predecessors' output shapes.
      inputShapes = predecessors
        .map((predId) => results.get(predId)?.outputShape)
        .filter((s): s is Shape => s != null && s.length > 0);
      if (inputShapes.length > 0) inputShape = inputShapes[0];
    } else if (predecessors.length > 0) {
      for (const predId of predecessors) {
        const predResult = results.get(predId);
        if (predResult?.outputShape) {
          inputShape = predResult.outputShape;
          break;
        }
      }
    }

    const { outputShape, error } = computeBlockShape(blockType, params, inputShape, inputShapes);

    results.set(nodeId, {
      inputShape,
      outputShape,
      error,
    });
  }

  // Any node not in `sorted` and not already marked as cycle → disconnected.
  for (const n of nodes) {
    if (!results.has(n.id)) {
      results.set(n.id, {
        inputShape: null,
        outputShape: null,
        error: "Disconnected — connect this block to the graph.",
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Connection validation
// ---------------------------------------------------------------------------

/**
 * Check whether a proposed edge from `sourceNode` → `targetNode` is
 * dimensionally valid, given the source's current output shape.
 *
 * Returns a human-friendly error when the connection would cause a shape
 * mismatch.
 */
export function validateConnection(
  sourceNode: ShapeNode,
  targetNode: ShapeNode,
  sourceShape: Shape | null,
): ConnectionValidation {
  if (!sourceShape) {
    return { valid: true }; // Can't validate yet — allow optimistically.
  }

  const targetType = targetNode.type as BlockType;
  const params = targetNode.data?.params ?? {};
  const dims = sourceShape.length;

  switch (targetType) {
    case "Linear": {
      // Linear works on any rank ≥ 1 (applies to last dim). Compare numerically so 784 and "784" match.
      const inF = intParam(params, "in_features", 784);
      const lastDim = sourceShape[dims - 1];
      const lastDimNum = typeof lastDim === "number" ? lastDim : Number(lastDim);
      if (Number.isFinite(lastDimNum) && Number(inF) !== lastDimNum) {
        return {
          valid: false,
          error: `Linear expects last dim = ${inF} but source outputs ${getShapeLabel(sourceShape)}. Change in_features to ${lastDim}.`,
        };
      }
      return { valid: true };
    }

    case "Conv2D": {
      if (dims !== 4) {
        return {
          valid: false,
          error: `Conv2D expects 4D input [batch, channels, height, width] but got ${dims}D ${getShapeLabel(sourceShape)}. Try adding a Reshape block.`,
        };
      }
      const expectedCIn = intParam(params, "in_channels", 1);
      const cIn = sourceShape[1];
      if (typeof cIn === "number" && cIn !== expectedCIn) {
        return {
          valid: false,
          error: `Conv2D in_channels is ${expectedCIn} but source has ${cIn} channels. Set in_channels to ${cIn}.`,
        };
      }
      return { valid: true };
    }

    case "LSTM": {
      if (dims !== 3) {
        return {
          valid: false,
          error: `LSTM expects 3D input [batch, seq, features] but got ${dims}D ${getShapeLabel(sourceShape)}.`,
        };
      }
      const inSize = intParam(params, "input_size", 128);
      const feat = sourceShape[2];
      if (typeof feat === "number" && feat !== inSize) {
        return {
          valid: false,
          error: `LSTM input_size is ${inSize} but source last dim is ${feat}. Set input_size to ${feat}.`,
        };
      }
      return { valid: true };
    }

    case "Attention": {
      if (dims !== 3) {
        return {
          valid: false,
          error: `Attention expects 3D input [batch, seq, embed] but got ${dims}D ${getShapeLabel(sourceShape)}.`,
        };
      }
      const embedDim = intParam(params, "embed_dim", 512);
      const numHeads = intParam(params, "num_heads", 8);
      const lastDim = sourceShape[2];
      if (typeof lastDim === "number" && lastDim !== embedDim) {
        return {
          valid: false,
          error: `Attention embed_dim is ${embedDim} but source last dim is ${lastDim}. Set embed_dim to ${lastDim}.`,
        };
      }
      if (embedDim % numHeads !== 0) {
        return {
          valid: false,
          error: `embed_dim (${embedDim}) must be divisible by num_heads (${numHeads}).`,
        };
      }
      return { valid: true };
    }

    case "Embedding": {
      if (dims !== 2) {
        return {
          valid: false,
          error: `Embedding expects 2D input [batch, seq_len] but got ${dims}D ${getShapeLabel(sourceShape)}.`,
        };
      }
      return { valid: true };
    }

    case "TextEmbedding": {
      if (dims !== 2) {
        return {
          valid: false,
          error: `Text Embedding expects 2D input [batch, seq_len] but got ${dims}D ${getShapeLabel(sourceShape)}. Connect from Text Input.`,
        };
      }
      return { valid: true };
    }

    case "PositionalEncoding": {
      if (dims !== 3) {
        return {
          valid: false,
          error: `PositionalEncoding expects 3D input [batch, seq, d_model] but got ${dims}D ${getShapeLabel(sourceShape)}.`,
        };
      }
      return { valid: true };
    }

    case "PositionalEmbedding": {
      if (dims !== 3) {
        return {
          valid: false,
          error: `Positional Embedding expects 3D input [batch, seq, d_model] but got ${dims}D ${getShapeLabel(sourceShape)}. Connect from Text Embedding.`,
        };
      }
      return { valid: true };
    }

    case "Flatten": {
      if (dims < 2) {
        return {
          valid: false,
          error: `Flatten needs at least 2D input but got ${dims}D ${getShapeLabel(sourceShape)}.`,
        };
      }
      return { valid: true };
    }

    case "BatchNorm": {
      if (dims < 2) {
        return {
          valid: false,
          error: `BatchNorm needs at least 2D input but got ${dims}D.`,
        };
      }
      const numFeat = intParam(params, "num_features", 32);
      const featDim = sourceShape[1];
      if (typeof featDim === "number" && featDim !== numFeat) {
        return {
          valid: false,
          error: `BatchNorm num_features is ${numFeat} but source dim-1 is ${featDim}. Set num_features to ${featDim}.`,
        };
      }
      return { valid: true };
    }

    case "LayerNorm": {
      const normShape = intParam(params, "normalized_shape", 512);
      const lastDim = sourceShape[dims - 1];
      if (typeof lastDim === "number" && lastDim !== normShape) {
        return {
          valid: false,
          error: `LayerNorm normalized_shape is ${normShape} but source last dim is ${lastDim}. Set normalized_shape to ${lastDim}.`,
        };
      }
      return { valid: true };
    }

    // Passthrough blocks — always valid.
    case "Activation":
    case "Dropout":
    case "Softmax":
    case "Input":
    case "TextInput":
      return { valid: true };

    // Output accepts any shape.
    case "Output":
      return { valid: true };

    // Add: two inputs (same shape enforced at runtime). Concat: two+ inputs.
    case "Add":
    case "Concat":
      return { valid: true };

    default:
      return { valid: true };
  }
}

// ---------------------------------------------------------------------------
// Shape formatting
// ---------------------------------------------------------------------------

/**
 * Render a `Shape` as a human-readable label.
 *
 * Examples:
 *   [B, 1, 28, 28]  → "[B, 1, 28, 28]"
 *   [B, 784]         → "[B, 784]"
 *   [B, seq]         → "[B, seq]"
 *   null              → "?"
 */
export function getShapeLabel(shape: Shape | null): string {
  if (!shape || shape.length === 0) return "?";
  const parts = shape.map((d) => {
    if (typeof d === "number") return d.toString();
    return d; // "B" | "seq"
  });
  return `[${parts.join(", ")}]`;
}
