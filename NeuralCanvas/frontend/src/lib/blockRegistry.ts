// ---------------------------------------------------------------------------
// NeuralCanvas — Block Type System & Registry
// ---------------------------------------------------------------------------

/** Categories that blocks can belong to. */
export type BlockCategory =
  | "input"
  | "output"
  | "layer"
  | "normalization"
  | "activation"
  | "utility";

/** Parameter primitive types the UI can render. */
export type ParamType = "int" | "float" | "select";

/** Schema for a single configurable parameter on a block. */
export interface ParamSchema {
  name: string;
  type: ParamType;
  /** Minimum value (int / float only). */
  min?: number;
  /** Maximum value (int / float only). */
  max?: number;
  /** Allowed choices (select only). */
  options?: string[];
}

/** A typed port (input or output) on a block. */
export interface BlockPort {
  id: string;
  label: string;
  /** Expected tensor rank flowing through this port. */
  expectedDims?: number;
}

/** All neural-network block types NeuralCanvas supports. */
export type BlockType =
  | "Input"
  | "Output"
  | "Linear"
  | "Conv2D"
  | "LSTM"
  | "Attention"
  | "LayerNorm"
  | "BatchNorm"
  | "Activation"
  | "Dropout"
  | "Flatten"
  | "Embedding"
  | "Softmax";

/** Full definition for a single block type. */
export interface BlockDefinition {
  /** Machine-readable identifier (matches BlockType). */
  id: BlockType;
  /** Block type key. */
  type: BlockType;
  /** Human-readable label. */
  label: string;
  /** Lucide icon name (e.g. "database", "layers"). */
  icon: string;
  /** Semantic category. */
  category: BlockCategory;
  /** Default parameter values when a block is first placed. */
  defaultParams: Record<string, number | string>;
  /** Schema describing every configurable parameter. */
  paramSchema: ParamSchema[];
  /** Ports that accept incoming connections. */
  inputPorts: BlockPort[];
  /** Ports that emit outgoing connections. */
  outputPorts: BlockPort[];
  /** Category-based colour for the node chrome (hex). */
  color: string;
  /** One-line plain-English description. */
  description: string;
}

// ---------------------------------------------------------------------------
// Category colours
// ---------------------------------------------------------------------------
const CATEGORY_COLORS: Record<BlockCategory, string> = {
  input: "#f59e0b",        // amber
  output: "#22c55e",       // green
  layer: "#6366f1",        // indigo
  normalization: "#14b8a6", // teal
  activation: "#f43f5e",   // rose
  utility: "#8b5cf6",      // violet
};

// ---------------------------------------------------------------------------
// Block definitions
// ---------------------------------------------------------------------------

const INPUT_BLOCK: BlockDefinition = {
  id: "Input",
  type: "Input",
  label: "Input",
  icon: "database",
  category: "input",
  defaultParams: {},
  paramSchema: [],
  inputPorts: [],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.input,
  description: "Model input. Choose dataset in the Training panel.",
};

const OUTPUT_BLOCK: BlockDefinition = {
  id: "Output",
  type: "Output",
  label: "Output",
  icon: "circle-dot",
  category: "output",
  defaultParams: {},
  paramSchema: [],
  inputPorts: [{ id: "in", label: "Input" }],
  outputPorts: [],
  color: CATEGORY_COLORS.output,
  description: "Sink for model output (e.g. logits or loss).",
};

const LINEAR_BLOCK: BlockDefinition = {
  id: "Linear",
  type: "Linear",
  label: "Linear",
  icon: "arrow-right-left",
  category: "layer",
  defaultParams: { in_features: 784, out_features: 128 },
  paramSchema: [
    { name: "in_features", type: "int", min: 1, max: 65536 },
    { name: "out_features", type: "int", min: 1, max: 65536 },
  ],
  inputPorts: [{ id: "in", label: "Input", expectedDims: 2 }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.layer,
  description: "Fully-connected (dense) linear transformation.",
};

const CONV2D_BLOCK: BlockDefinition = {
  id: "Conv2D",
  type: "Conv2D",
  label: "Conv2D",
  icon: "grid-3x3",
  category: "layer",
  defaultParams: {
    in_channels: 1,
    out_channels: 32,
    kernel_size: 3,
    stride: 1,
    padding: 1,
  },
  paramSchema: [
    { name: "in_channels", type: "int", min: 1, max: 2048 },
    { name: "out_channels", type: "int", min: 1, max: 2048 },
    { name: "kernel_size", type: "int", min: 1, max: 31 },
    { name: "stride", type: "int", min: 1, max: 16 },
    { name: "padding", type: "int", min: 0, max: 15 },
  ],
  inputPorts: [{ id: "in", label: "Input", expectedDims: 4 }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.layer,
  description: "2-D convolutional layer for spatial feature extraction.",
};

const LSTM_BLOCK: BlockDefinition = {
  id: "LSTM",
  type: "LSTM",
  label: "LSTM",
  icon: "repeat",
  category: "layer",
  defaultParams: { input_size: 128, hidden_size: 256, num_layers: 1 },
  paramSchema: [
    { name: "input_size", type: "int", min: 1, max: 8192 },
    { name: "hidden_size", type: "int", min: 1, max: 8192 },
    { name: "num_layers", type: "int", min: 1, max: 16 },
  ],
  inputPorts: [{ id: "in", label: "Input", expectedDims: 3 }],
  outputPorts: [
    { id: "out", label: "Output" },
    { id: "hidden", label: "Hidden State" },
  ],
  color: CATEGORY_COLORS.layer,
  description: "Long Short-Term Memory recurrent layer.",
};

const ATTENTION_BLOCK: BlockDefinition = {
  id: "Attention",
  type: "Attention",
  label: "Attention",
  icon: "scan-eye",
  category: "layer",
  defaultParams: { embed_dim: 512, num_heads: 8 },
  paramSchema: [
    { name: "embed_dim", type: "int", min: 1, max: 8192 },
    { name: "num_heads", type: "int", min: 1, max: 128 },
  ],
  inputPorts: [{ id: "in", label: "Input", expectedDims: 3 }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.layer,
  description: "Multi-head self-attention mechanism.",
};

const LAYERNORM_BLOCK: BlockDefinition = {
  id: "LayerNorm",
  type: "LayerNorm",
  label: "LayerNorm",
  icon: "align-center-horizontal",
  category: "normalization",
  defaultParams: { normalized_shape: 512 },
  paramSchema: [
    { name: "normalized_shape", type: "int", min: 1, max: 65536 },
  ],
  inputPorts: [{ id: "in", label: "Input" }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.normalization,
  description: "Applies layer normalization over the last dimension.",
};

const BATCHNORM_BLOCK: BlockDefinition = {
  id: "BatchNorm",
  type: "BatchNorm",
  label: "BatchNorm",
  icon: "bar-chart-horizontal",
  category: "normalization",
  defaultParams: { num_features: 32 },
  paramSchema: [
    { name: "num_features", type: "int", min: 1, max: 8192 },
  ],
  inputPorts: [{ id: "in", label: "Input" }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.normalization,
  description: "Applies batch normalization over a mini-batch.",
};

const ACTIVATION_BLOCK: BlockDefinition = {
  id: "Activation",
  type: "Activation",
  label: "Activation",
  icon: "zap",
  category: "activation",
  defaultParams: { activation: "relu" },
  paramSchema: [
    {
      name: "activation",
      type: "select",
      options: ["relu", "gelu", "sigmoid", "tanh", "softmax"],
    },
  ],
  inputPorts: [{ id: "in", label: "Input" }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.activation,
  description: "Applies a non-linear activation function element-wise.",
};

const DROPOUT_BLOCK: BlockDefinition = {
  id: "Dropout",
  type: "Dropout",
  label: "Dropout",
  icon: "dice-3",
  category: "utility",
  defaultParams: { p: 0.5 },
  paramSchema: [
    { name: "p", type: "float", min: 0, max: 1 },
  ],
  inputPorts: [{ id: "in", label: "Input" }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.utility,
  description: "Randomly zeros elements during training for regularisation.",
};

const FLATTEN_BLOCK: BlockDefinition = {
  id: "Flatten",
  type: "Flatten",
  label: "Flatten",
  icon: "move-horizontal",
  category: "utility",
  defaultParams: {},
  paramSchema: [],
  inputPorts: [{ id: "in", label: "Input" }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.utility,
  description: "Flattens all dimensions except the batch dimension.",
};

const EMBEDDING_BLOCK: BlockDefinition = {
  id: "Embedding",
  type: "Embedding",
  label: "Embedding",
  icon: "text-cursor-input",
  category: "layer",
  defaultParams: { num_embeddings: 10000, embedding_dim: 128 },
  paramSchema: [
    { name: "num_embeddings", type: "int", min: 1, max: 1000000 },
    { name: "embedding_dim", type: "int", min: 1, max: 8192 },
  ],
  inputPorts: [{ id: "in", label: "Input", expectedDims: 2 }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.layer,
  description: "Maps integer token IDs to dense embedding vectors.",
};

const SOFTMAX_BLOCK: BlockDefinition = {
  id: "Softmax",
  type: "Softmax",
  label: "Softmax",
  icon: "percent",
  category: "activation",
  defaultParams: { dim: -1 },
  paramSchema: [
    { name: "dim", type: "int", min: -4, max: 4 },
  ],
  inputPorts: [{ id: "in", label: "Input" }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.activation,
  description: "Normalises logits into a probability distribution along a dimension.",
};

// ---------------------------------------------------------------------------
// Registry map
// ---------------------------------------------------------------------------

/**
 * Master registry keyed by `BlockType`.
 * Use this to look up any block definition by its type string.
 */
export const BLOCK_REGISTRY: Record<BlockType, BlockDefinition> = {
  Input: INPUT_BLOCK,
  Output: OUTPUT_BLOCK,
  Linear: LINEAR_BLOCK,
  Conv2D: CONV2D_BLOCK,
  LSTM: LSTM_BLOCK,
  Attention: ATTENTION_BLOCK,
  LayerNorm: LAYERNORM_BLOCK,
  BatchNorm: BATCHNORM_BLOCK,
  Activation: ACTIVATION_BLOCK,
  Dropout: DROPOUT_BLOCK,
  Flatten: FLATTEN_BLOCK,
  Embedding: EMBEDDING_BLOCK,
  Softmax: SOFTMAX_BLOCK,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a deep-cloned copy of the default parameters for a given block type.
 * Useful when instantiating a new node on the canvas.
 *
 * @throws if `type` is not in the registry.
 */
export function getBlockDefaults(
  type: BlockType,
): Record<string, number | string> {
  const def = BLOCK_REGISTRY[type];
  if (!def) {
    throw new Error(`[blockRegistry] Unknown block type: "${type}"`);
  }
  return structuredClone(def.defaultParams);
}

/**
 * Convenience: list every block definition as an array (useful for palette rendering).
 */
export function getAllBlockDefinitions(): BlockDefinition[] {
  return Object.values(BLOCK_REGISTRY);
}

/**
 * Filter block definitions by category.
 */
export function getBlocksByCategory(
  category: BlockCategory,
): BlockDefinition[] {
  return getAllBlockDefinitions().filter((b) => b.category === category);
}
