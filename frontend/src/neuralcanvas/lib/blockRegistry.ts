// ---------------------------------------------------------------------------
// NeuralCanvas — Block Type System & Registry
// ---------------------------------------------------------------------------

/** Categories that blocks can belong to. */
export type BlockCategory =
  | "input"
  | "data"
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
  | "InputSpace"
  | "Board"
  | "TextInput"
  | "Output"
  | "Display"
  | "Linear"
  | "Conv2D"
  | "MaxPool2D"
  | "MaxPool1D"
  | "LSTM"
  | "Attention"
  | "LayerNorm"
  | "BatchNorm"
  | "Activation"
  | "Dropout"
  | "Flatten"
  | "Embedding"
  | "TextEmbedding"
  | "PositionalEncoding"
  | "PositionalEmbedding"
  | "Softmax"
  | "Add"
  | "Concat";

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
  /** Optional width in px; used when label is long (e.g. Positional Embedding). Default from BLOCK_BASE_WIDTH. */
  width?: number;
  /** One-line plain-English description. */
  description: string;
}

// ---------------------------------------------------------------------------
// Category colours
// ---------------------------------------------------------------------------
const CATEGORY_COLORS: Record<BlockCategory, string> = {
  input: "#F59E0B",        // amber
  data: "#D97706",         // darker amber for custom data
  output: "#10B981",       // emerald
  layer: "#6366F1",        // indigo
  normalization: "#14B8A6", // teal
  activation: "#EF4444",   // red
  utility: "#8B5CF6",      // violet
};

/** Per-block colors for blocks that need their own identity */
const BLOCK_COLORS = {
  Linear:              "#6366F1", // indigo
  Conv2D:              "#8B5CF6", // violet
  LSTM:                "#EC4899", // pink
  Attention:           "#F97316", // orange
  Embedding:           "#06B6D4", // cyan
  TextEmbedding:       "#06B6D4", // cyan
  PositionalEncoding:  "#0EA5E9", // sky
  PositionalEmbedding: "#0EA5E9", // sky
} as const;

// ---------------------------------------------------------------------------
// Block definitions
// ---------------------------------------------------------------------------

const INPUT_BLOCK: BlockDefinition = {
  id: "Input",
  type: "Input",
  label: "Dataset",
  icon: "inbox",
  category: "input",
  defaultParams: {},
  paramSchema: [],
  inputPorts: [{ id: "in", label: "Custom" }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.input,
  description: "Model input. Use a dataset or connect Input Space for custom data.",
};

const INPUT_SPACE_BLOCK: BlockDefinition = {
  id: "InputSpace",
  type: "InputSpace",
  label: "Custom Data",
  icon: "upload",
  category: "data",
  defaultParams: { data_type: "image", input_shape: "1,28,28" },
  paramSchema: [
    { name: "data_type", type: "select", options: ["image", "table", "text", "webcam"] },
  ],
  inputPorts: [],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.input,
  description: "Upload images, tables, or text, or capture from webcam. Connect to Input for custom training data.",
};

const BOARD_BLOCK: BlockDefinition = {
  id: "Board",
  type: "Board",
  label: "Board",
  icon: "pen-tool",
  category: "data",
  defaultParams: { width: 28, height: 28 },
  paramSchema: [
    { name: "width", type: "int", min: 8, max: 224 },
    { name: "height", type: "int", min: 8, max: 224 },
  ],
  inputPorts: [],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.data,
  description: "Draw an image with your mouse or finger. Output is resized to the dimensions above and connected to Input as custom data.",
};

const TEXT_INPUT_BLOCK: BlockDefinition = {
  id: "TextInput",
  type: "TextInput",
  label: "Text Input",
  icon: "type",
  category: "input",
  defaultParams: { batch_size: 1, seq_len: 128 },
  paramSchema: [
    { name: "batch_size", type: "int", min: 1, max: 65536 },
    { name: "seq_len", type: "int", min: 1, max: 65536 },
  ],
  inputPorts: [],
  outputPorts: [{ id: "out", label: "Output", expectedDims: 2 }],
  color: CATEGORY_COLORS.input,
  description: "Token IDs input for text/sequence models. Output shape [batch, seq_len]. Use with Text Embedding.",
};

const OUTPUT_BLOCK: BlockDefinition = {
  id: "Output",
  type: "Output",
  label: "Output",
  icon: "target",
  category: "output",
  defaultParams: {},
  paramSchema: [],
  inputPorts: [{ id: "in", label: "Input" }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.output,
  description: "Model output (e.g. logits or loss). Connect to Display to show predictions.",
};

const DISPLAY_BLOCK: BlockDefinition = {
  id: "Display",
  type: "Display",
  label: "Display",
  icon: "monitor",
  category: "output",
  defaultParams: {},
  paramSchema: [],
  inputPorts: [{ id: "in", label: "Input" }],
  outputPorts: [],
  color: CATEGORY_COLORS.output,
  description: "LCD-style display for predictions. Shows no-signal static when nothing is connected.",
};

const LINEAR_BLOCK: BlockDefinition = {
  id: "Linear",
  type: "Linear",
  label: "Linear",
  icon: "rows-3",
  category: "layer",
  defaultParams: { in_features: 784, out_features: 128 },
  paramSchema: [
    { name: "in_features", type: "int", min: 1, max: 65536 },
    { name: "out_features", type: "int", min: 1, max: 65536 },
  ],
  inputPorts: [{ id: "in", label: "Input", expectedDims: 2 }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: BLOCK_COLORS.Linear,
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
  color: BLOCK_COLORS.Conv2D,
  description: "2-D convolutional layer for spatial feature extraction.",
};

const MAXPOOL2D_BLOCK: BlockDefinition = {
  id: "MaxPool2D",
  type: "MaxPool2D",
  label: "MaxPool2D",
  icon: "grid-3x3",
  category: "layer",
  defaultParams: { kernel_size: 2, stride: 2 },
  paramSchema: [
    { name: "kernel_size", type: "int", min: 1, max: 31 },
    { name: "stride", type: "int", min: 1, max: 16 },
  ],
  inputPorts: [{ id: "in", label: "Input", expectedDims: 4 }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: BLOCK_COLORS.Conv2D,
  description: "2-D max pooling. Reduces spatial dimensions. Input: 4D [B, C, H, W].",
};

const MAXPOOL1D_BLOCK: BlockDefinition = {
  id: "MaxPool1D",
  type: "MaxPool1D",
  label: "MaxPool1D",
  icon: "minimize-2",
  category: "layer",
  defaultParams: { kernel_size: 2, stride: 2 },
  paramSchema: [
    { name: "kernel_size", type: "int", min: 1, max: 31 },
    { name: "stride", type: "int", min: 1, max: 16 },
  ],
  inputPorts: [{ id: "in", label: "Input", expectedDims: 3 }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: BLOCK_COLORS.Conv2D,
  description: "1-D max pooling. Reduces sequence length. Input: 3D [B, C, L].",
};

const LSTM_BLOCK: BlockDefinition = {
  id: "LSTM",
  type: "LSTM",
  label: "LSTM",
  icon: "refresh-cw",
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
  color: BLOCK_COLORS.LSTM,
  description: "Long Short-Term Memory recurrent layer.",
};

const ATTENTION_BLOCK: BlockDefinition = {
  id: "Attention",
  type: "Attention",
  label: "Attention",
  icon: "focus",
  category: "layer",
  defaultParams: { embed_dim: 512, num_heads: 8 },
  paramSchema: [
    { name: "embed_dim", type: "int", min: 1, max: 8192 },
    { name: "num_heads", type: "int", min: 1, max: 128 },
  ],
  inputPorts: [{ id: "in", label: "Input", expectedDims: 3 }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: BLOCK_COLORS.Attention,
  description: "Multi-head self-attention mechanism.",
};

const LAYERNORM_BLOCK: BlockDefinition = {
  id: "LayerNorm",
  type: "LayerNorm",
  label: "LayerNorm",
  icon: "sliders-horizontal",
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
  icon: "bar-chart-3",
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
      options: ["relu", "gelu", "sigmoid", "tanh"],
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
  icon: "shuffle",
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
  icon: "fold-horizontal",
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
  icon: "hash",
  category: "layer",
  defaultParams: { num_embeddings: 10000, embedding_dim: 128 },
  paramSchema: [
    { name: "num_embeddings", type: "int", min: 1, max: 1000000 },
    { name: "embedding_dim", type: "int", min: 1, max: 8192 },
  ],
  inputPorts: [{ id: "in", label: "Input", expectedDims: 2 }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: BLOCK_COLORS.Embedding,
  description: "Maps integer token IDs to dense embedding vectors.",
};

const TEXT_EMBEDDING_BLOCK: BlockDefinition = {
  id: "TextEmbedding",
  type: "TextEmbedding",
  label: "Text Embedding",
  icon: "type",
  category: "layer",
  defaultParams: { vocab_size: 10000, embedding_dim: 128 },
  paramSchema: [
    { name: "vocab_size", type: "int", min: 1, max: 1000000 },
    { name: "embedding_dim", type: "int", min: 1, max: 8192 },
  ],
  inputPorts: [{ id: "in", label: "Input", expectedDims: 2 }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: BLOCK_COLORS.TextEmbedding,
  description: "Token embeddings for text. Input [B, seq_len] → Output [B, seq_len, embedding_dim]. Pair with Text Input and Positional Embedding (d_model = embedding_dim).",
};

const POSITIONAL_ENCODING_BLOCK: BlockDefinition = {
  id: "PositionalEncoding",
  type: "PositionalEncoding",
  label: "Positional Encoding",
  icon: "map-pin",
  category: "layer",
  defaultParams: { d_model: 128, max_len: 512 },
  paramSchema: [
    { name: "d_model", type: "int", min: 1, max: 8192 },
    { name: "max_len", type: "int", min: 1, max: 65536 },
  ],
  inputPorts: [{ id: "in", label: "Input", expectedDims: 3 }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: BLOCK_COLORS.PositionalEncoding,
  description: "Adds sinusoidal positional encodings to sequences (Transformer-style). Input [B, seq, d_model].",
  width: 252,
};

const POSITIONAL_EMBEDDING_BLOCK: BlockDefinition = {
  id: "PositionalEmbedding",
  type: "PositionalEmbedding",
  label: "Positional Embedding",
  icon: "map-pin",
  category: "layer",
  defaultParams: { d_model: 128, max_len: 512 },
  paramSchema: [
    { name: "d_model", type: "int", min: 1, max: 8192 },
    { name: "max_len", type: "int", min: 1, max: 65536 },
  ],
  inputPorts: [{ id: "in", label: "Input", expectedDims: 3 }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: BLOCK_COLORS.PositionalEmbedding,
  description: "Adds learned positional embeddings to sequences. Input [B, seq, d_model]. Set d_model to match Text Embedding embedding_dim.",
  width: 252,
};

const SOFTMAX_BLOCK: BlockDefinition = {
  id: "Softmax",
  type: "Softmax",
  label: "Softmax",
  icon: "percent",
  category: "activation",
  defaultParams: {},
  paramSchema: [],
  inputPorts: [{ id: "in", label: "Input" }],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.activation,
  description: "Normalises logits into a probability distribution along a dimension.",
};

const ADD_BLOCK: BlockDefinition = {
  id: "Add",
  type: "Add",
  label: "Add",
  icon: "plus",
  category: "utility",
  defaultParams: {},
  paramSchema: [],
  inputPorts: [
    { id: "in_a", label: "A" },
    { id: "in_b", label: "B" },
  ],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.utility,
  description: "Element-wise sum of two tensors (e.g. residual connection). Both inputs must have the same shape.",
};

const CONCAT_BLOCK: BlockDefinition = {
  id: "Concat",
  type: "Concat",
  label: "Concat",
  icon: "merge",
  category: "utility",
  defaultParams: { dim: 1 },
  paramSchema: [
    { name: "dim", type: "int", min: 0, max: 4 },
  ],
  inputPorts: [
    { id: "in_a", label: "A" },
    { id: "in_b", label: "B" },
  ],
  outputPorts: [{ id: "out", label: "Output" }],
  color: CATEGORY_COLORS.utility,
  description: "Concatenates two or more tensors along the given dimension.",
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
  InputSpace: INPUT_SPACE_BLOCK,
  Board: BOARD_BLOCK,
  TextInput: TEXT_INPUT_BLOCK,
  Output: OUTPUT_BLOCK,
  Display: DISPLAY_BLOCK,
  Linear: LINEAR_BLOCK,
  Conv2D: CONV2D_BLOCK,
  MaxPool2D: MAXPOOL2D_BLOCK,
  MaxPool1D: MAXPOOL1D_BLOCK,
  LSTM: LSTM_BLOCK,
  Attention: ATTENTION_BLOCK,
  LayerNorm: LAYERNORM_BLOCK,
  BatchNorm: BATCHNORM_BLOCK,
  Activation: ACTIVATION_BLOCK,
  Dropout: DROPOUT_BLOCK,
  Flatten: FLATTEN_BLOCK,
  Embedding: EMBEDDING_BLOCK,
  TextEmbedding: TEXT_EMBEDDING_BLOCK,
  PositionalEncoding: POSITIONAL_ENCODING_BLOCK,
  PositionalEmbedding: POSITIONAL_EMBEDDING_BLOCK,
  Softmax: SOFTMAX_BLOCK,
  Add: ADD_BLOCK,
  Concat: CONCAT_BLOCK,
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
