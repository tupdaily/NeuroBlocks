/**
 * Step-by-step walkthrough configs for paper levels.
 * Each step has a partial graph (nodes + edges) and a short description.
 */

import type { GraphSchema } from "@/types/graph";

export interface WalkthroughStep {
  title: string;
  description: string;
  /** Question shown after the description: "What layer should come next?" */
  nextQuestion?: string;
  /** Correct answer (title of the next step). Required if nextChoices is set. */
  correctNext?: string;
  /** Shuffled in UI. Include the correct answer. */
  nextChoices?: string[];
  graph: GraphSchema;
}

const STEP_META = {
  version: "1.0" as const,
  metadata: {
    name: "Transformer walkthrough",
    created_at: new Date().toISOString(),
  },
};

/** Node/edge positions match the Transformer paper diagram (bottom-to-top). */
const NODES = {
  text_input_1: { id: "text_input_1", type: "text_input", params: { batch_size: 1, seq_len: 128 }, position: { x: 80, y: 380 } },
  text_embed_1: { id: "text_embed_1", type: "text_embedding", params: { vocab_size: 10000, embedding_dim: 128 }, position: { x: 220, y: 380 } },
  pos_embed_1: { id: "pos_embed_1", type: "positional_embedding", params: { d_model: 128, max_len: 512 }, position: { x: 360, y: 380 } },
  ln_pre: { id: "ln_pre", type: "layernorm", params: { normalized_shape: 128 }, position: { x: 320, y: 280 } },
  attn: { id: "attn", type: "attention", params: { embed_dim: 128, num_heads: 4 }, position: { x: 460, y: 280 } },
  add_1: { id: "add_1", type: "add", params: {}, position: { x: 600, y: 280 } },
  ln_mid: { id: "ln_mid", type: "layernorm", params: { normalized_shape: 128 }, position: { x: 320, y: 180 } },
  linear_1: { id: "linear_1", type: "linear", params: { in_features: 128, out_features: 512 }, position: { x: 460, y: 180 } },
  relu_1: { id: "relu_1", type: "activation", params: { activation: "relu" }, position: { x: 540, y: 180 } },
  linear_2: { id: "linear_2", type: "linear", params: { in_features: 512, out_features: 128 }, position: { x: 620, y: 180 } },
  add_2: { id: "add_2", type: "add", params: {}, position: { x: 760, y: 180 } },
  ln_post: { id: "ln_post", type: "layernorm", params: { normalized_shape: 128 }, position: { x: 320, y: 80 } },
  output_1: { id: "output_1", type: "output", params: {}, position: { x: 460, y: 80 } },
};

const EDGES = {
  e0a: { id: "e0a", source: "text_input_1", sourceHandle: "out", target: "text_embed_1", targetHandle: "in" },
  e0b: { id: "e0b", source: "text_embed_1", sourceHandle: "out", target: "pos_embed_1", targetHandle: "in" },
  e1: { id: "e1", source: "pos_embed_1", sourceHandle: "out", target: "ln_pre", targetHandle: "in" },
  e2: { id: "e2", source: "pos_embed_1", sourceHandle: "out", target: "add_1", targetHandle: "in_a" },
  e3: { id: "e3", source: "ln_pre", sourceHandle: "out", target: "attn", targetHandle: "in" },
  e4: { id: "e4", source: "attn", sourceHandle: "out", target: "add_1", targetHandle: "in_b" },
  e5: { id: "e5", source: "add_1", sourceHandle: "out", target: "ln_mid", targetHandle: "in" },
  e6: { id: "e6", source: "ln_mid", sourceHandle: "out", target: "linear_1", targetHandle: "in" },
  e7: { id: "e7", source: "ln_mid", sourceHandle: "out", target: "add_2", targetHandle: "in_a" },
  e8: { id: "e8", source: "linear_1", sourceHandle: "out", target: "relu_1", targetHandle: "in" },
  e9: { id: "e9", source: "relu_1", sourceHandle: "out", target: "linear_2", targetHandle: "in" },
  e10: { id: "e10", source: "linear_2", sourceHandle: "out", target: "add_2", targetHandle: "in_b" },
  e11: { id: "e11", source: "add_2", sourceHandle: "out", target: "ln_post", targetHandle: "in" },
  e12: { id: "e12", source: "ln_post", sourceHandle: "out", target: "output_1", targetHandle: "in" },
};

/** One step per block; order follows data flow (bottom-to-top in diagram). */
const BLOCK_ORDER: (keyof typeof NODES)[] = [
  "text_input_1",
  "text_embed_1",
  "pos_embed_1",
  "ln_pre",
  "attn",
  "add_1",
  "ln_mid",
  "linear_1",
  "relu_1",
  "linear_2",
  "add_2",
  "ln_post",
  "output_1",
];

const ALL_EDGES = [EDGES.e0a, EDGES.e0b, EDGES.e1, EDGES.e2, EDGES.e3, EDGES.e4, EDGES.e5, EDGES.e6, EDGES.e7, EDGES.e8, EDGES.e9, EDGES.e10, EDGES.e11, EDGES.e12];

function graphUpToBlock(index: number): { nodes: (typeof NODES)[keyof typeof NODES][]; edges: (typeof EDGES)[keyof typeof EDGES][] } {
  const nodeIds = new Set(BLOCK_ORDER.slice(0, index + 1));
  const nodes = BLOCK_ORDER.slice(0, index + 1).map((id) => NODES[id]);
  const edges = ALL_EDGES.filter((e) => nodeIds.has(e.source as keyof typeof NODES) && nodeIds.has(e.target as keyof typeof NODES));
  return { nodes, edges };
}

const BLOCK_TITLES: Record<keyof typeof NODES, string> = {
  text_input_1: "Text Input",
  text_embed_1: "Text Embedding",
  pos_embed_1: "Positional Embedding",
  ln_pre: "LayerNorm (pre-attention)",
  attn: "Multi-Head Self-Attention",
  add_1: "Add & Norm (after attention)",
  ln_mid: "LayerNorm (pre–feed-forward)",
  linear_1: "Linear (expand)",
  relu_1: "ReLU",
  linear_2: "Linear (project)",
  add_2: "Add & Norm (after FFN)",
  ln_post: "LayerNorm (final)",
  output_1: "Output",
};

const BLOCK_DESCRIPTIONS: Record<keyof typeof NODES, string> = {
  text_input_1: "Raw token IDs for the sequence. Typically shape [batch, seq_len]; the model will embed these into continuous vectors.",
  text_embed_1: "Maps each token ID to a dense vector of size embedding_dim. This is the lookup table that the model learns.",
  pos_embed_1: "Adds position information so the model knows token order. Attention alone is permutation-invariant; positional embeddings fix that.",
  ln_pre: "Layer normalization applied before the attention sublayer. Stabilizes activations and helps training.",
  attn: "Each position attends to every position via scaled dot-product attention. Multiple heads run in parallel for richer representations.",
  add_1: "Residual connection: adds the attention output to the pre-attention input, then (conceptually) LayerNorm. Preserves gradient flow.",
  ln_mid: "Layer normalization before the feed-forward sublayer. Same role as the pre-attention LayerNorm.",
  linear_1: "Position-wise linear layer that expands the model dimension (e.g. 128 → 512). Adds capacity before the non-linearity.",
  relu_1: "ReLU activation. Adds non-linearity; the inner dimension is typically 4× the model dimension.",
  linear_2: "Projects back to model dimension (e.g. 512 → 128). Together with linear_1 and ReLU this is the position-wise FFN.",
  add_2: "Residual connection after the feed-forward block. Add & Norm again to stabilize and preserve gradients.",
  ln_post: "Final LayerNorm before the output. Produces the encoder representation used by the decoder in a full Transformer.",
  output_1: "Encoder output. In a full model this feeds the decoder; here it's the end of the encoder stack.",
};

const QUIZ_DISTRACTORS = ["Dropout", "BatchNorm", "Another Attention layer", "Softmax"];

function choicesForStep(stepIndex: number): string[] {
  if (stepIndex >= BLOCK_ORDER.length - 1) return [];
  const correct = BLOCK_TITLES[BLOCK_ORDER[stepIndex + 1]];
  const wrong = BLOCK_ORDER.filter((_, i) => i !== stepIndex + 1).map((id) => BLOCK_TITLES[id]);
  const pool = [...QUIZ_DISTRACTORS, ...wrong].filter((t) => t !== correct);
  const threeWrong = pool.slice(0, 3);
  return [correct, ...threeWrong];
}

export const TRANSFORMER_WALKTHROUGH_STEPS: WalkthroughStep[] = BLOCK_ORDER.map((blockId, index) => {
  const { nodes, edges } = graphUpToBlock(index);
  const isLast = index === BLOCK_ORDER.length - 1;
  return {
    title: BLOCK_TITLES[blockId],
    description: BLOCK_DESCRIPTIONS[blockId],
    ...(!isLast && {
      nextQuestion: "What layer should come next?",
      correctNext: BLOCK_TITLES[BLOCK_ORDER[index + 1]],
      nextChoices: choicesForStep(index),
    }),
    graph: { ...STEP_META, nodes, edges },
  };
});

// ── AlexNet (Krizhevsky et al., 2012) ─────────────────────────────────────
const ALEXNET_STEP_META = {
  version: "1.0" as const,
  metadata: {
    name: "AlexNet walkthrough",
    created_at: new Date().toISOString(),
  },
};

const ALEXNET_NODES = {
  input_1: { id: "input_1", type: "input", params: {}, position: { x: 80, y: 200 } },
  conv1: { id: "conv1", type: "conv2d", params: { in_channels: 1, out_channels: 96, kernel_size: 11, stride: 4, padding: 2 }, position: { x: 200, y: 200 } },
  relu1: { id: "relu1", type: "activation", params: { activation: "relu" }, position: { x: 320, y: 200 } },
  conv2: { id: "conv2", type: "conv2d", params: { in_channels: 96, out_channels: 256, kernel_size: 5, stride: 1, padding: 2 }, position: { x: 440, y: 200 } },
  relu2: { id: "relu2", type: "activation", params: { activation: "relu" }, position: { x: 560, y: 200 } },
  conv3: { id: "conv3", type: "conv2d", params: { in_channels: 256, out_channels: 384, kernel_size: 3, stride: 1, padding: 1 }, position: { x: 680, y: 200 } },
  relu3: { id: "relu3", type: "activation", params: { activation: "relu" }, position: { x: 800, y: 200 } },
  conv4: { id: "conv4", type: "conv2d", params: { in_channels: 384, out_channels: 384, kernel_size: 3, stride: 1, padding: 1 }, position: { x: 920, y: 200 } },
  relu4: { id: "relu4", type: "activation", params: { activation: "relu" }, position: { x: 1040, y: 200 } },
  conv5: { id: "conv5", type: "conv2d", params: { in_channels: 384, out_channels: 256, kernel_size: 3, stride: 1, padding: 1 }, position: { x: 1160, y: 200 } },
  relu5: { id: "relu5", type: "activation", params: { activation: "relu" }, position: { x: 1280, y: 200 } },
  flatten_1: { id: "flatten_1", type: "flatten", params: {}, position: { x: 1400, y: 200 } },
  fc6: { id: "fc6", type: "linear", params: { in_features: 9216, out_features: 4096 }, position: { x: 1520, y: 200 } },
  relu6: { id: "relu6", type: "activation", params: { activation: "relu" }, position: { x: 1640, y: 200 } },
  dropout1: { id: "dropout1", type: "dropout", params: { p: 0.5 }, position: { x: 1760, y: 200 } },
  fc7: { id: "fc7", type: "linear", params: { in_features: 4096, out_features: 4096 }, position: { x: 1880, y: 200 } },
  relu7: { id: "relu7", type: "activation", params: { activation: "relu" }, position: { x: 2000, y: 200 } },
  dropout2: { id: "dropout2", type: "dropout", params: { p: 0.5 }, position: { x: 2120, y: 200 } },
  fc8: { id: "fc8", type: "linear", params: { in_features: 4096, out_features: 1000 }, position: { x: 2240, y: 200 } },
  output_1: { id: "output_1", type: "output", params: {}, position: { x: 2360, y: 200 } },
};

const ALEXNET_EDGES = {
  e0: { id: "e0", source: "input_1", sourceHandle: "out", target: "conv1", targetHandle: "in" },
  e1: { id: "e1", source: "conv1", sourceHandle: "out", target: "relu1", targetHandle: "in" },
  e2: { id: "e2", source: "relu1", sourceHandle: "out", target: "conv2", targetHandle: "in" },
  e3: { id: "e3", source: "conv2", sourceHandle: "out", target: "relu2", targetHandle: "in" },
  e4: { id: "e4", source: "relu2", sourceHandle: "out", target: "conv3", targetHandle: "in" },
  e5: { id: "e5", source: "conv3", sourceHandle: "out", target: "relu3", targetHandle: "in" },
  e6: { id: "e6", source: "relu3", sourceHandle: "out", target: "conv4", targetHandle: "in" },
  e7: { id: "e7", source: "conv4", sourceHandle: "out", target: "relu4", targetHandle: "in" },
  e8: { id: "e8", source: "relu4", sourceHandle: "out", target: "conv5", targetHandle: "in" },
  e9: { id: "e9", source: "conv5", sourceHandle: "out", target: "relu5", targetHandle: "in" },
  e10: { id: "e10", source: "relu5", sourceHandle: "out", target: "flatten_1", targetHandle: "in" },
  e11: { id: "e11", source: "flatten_1", sourceHandle: "out", target: "fc6", targetHandle: "in" },
  e12: { id: "e12", source: "fc6", sourceHandle: "out", target: "relu6", targetHandle: "in" },
  e13: { id: "e13", source: "relu6", sourceHandle: "out", target: "dropout1", targetHandle: "in" },
  e14: { id: "e14", source: "dropout1", sourceHandle: "out", target: "fc7", targetHandle: "in" },
  e15: { id: "e15", source: "fc7", sourceHandle: "out", target: "relu7", targetHandle: "in" },
  e16: { id: "e16", source: "relu7", sourceHandle: "out", target: "dropout2", targetHandle: "in" },
  e17: { id: "e17", source: "dropout2", sourceHandle: "out", target: "fc8", targetHandle: "in" },
  e18: { id: "e18", source: "fc8", sourceHandle: "out", target: "output_1", targetHandle: "in" },
};

const ALEXNET_BLOCK_ORDER = [
  "input_1", "conv1", "relu1", "conv2", "relu2", "conv3", "relu3", "conv4", "relu4",
  "conv5", "relu5", "flatten_1", "fc6", "relu6", "dropout1", "fc7", "relu7", "dropout2",
  "fc8", "output_1",
] as const;

const ALEXNET_ALL_EDGES = Object.values(ALEXNET_EDGES);

function alexNetGraphUpToBlock(index: number) {
  const nodeIds = new Set(ALEXNET_BLOCK_ORDER.slice(0, index + 1));
  const nodes = ALEXNET_BLOCK_ORDER.slice(0, index + 1).map((id) => ALEXNET_NODES[id]);
  const edges = ALEXNET_ALL_EDGES.filter((e) => nodeIds.has(e.source as typeof ALEXNET_BLOCK_ORDER[number]) && nodeIds.has(e.target as typeof ALEXNET_BLOCK_ORDER[number]));
  return { nodes, edges };
}

const ALEXNET_BLOCK_TITLES: Record<typeof ALEXNET_BLOCK_ORDER[number], string> = {
  input_1: "Input",
  conv1: "Conv2D (96 filters, 11×11, stride 4)",
  relu1: "ReLU",
  conv2: "Conv2D (256 filters, 5×5)",
  relu2: "ReLU",
  conv3: "Conv2D (384 filters, 3×3)",
  relu3: "ReLU",
  conv4: "Conv2D (384 filters, 3×3)",
  relu4: "ReLU",
  conv5: "Conv2D (256 filters, 3×3)",
  relu5: "ReLU",
  flatten_1: "Flatten",
  fc6: "Linear (4096)",
  relu6: "ReLU",
  dropout1: "Dropout (0.5)",
  fc7: "Linear (4096)",
  relu7: "ReLU",
  dropout2: "Dropout (0.5)",
  fc8: "Linear (1000)",
  output_1: "Output",
};

const ALEXNET_BLOCK_DESCRIPTIONS: Record<typeof ALEXNET_BLOCK_ORDER[number], string> = {
  input_1: "Raw image input. Here we use 1 channel to match the default playground input (e.g. grayscale); the paper used 224×224×3 RGB for ImageNet.",
  conv1: "First convolutional layer: 96 filters, 11×11 kernel, stride 4, in_channels=1 to match the default input. Extracts low-level features. The paper used 3-channel RGB and overlapping pooling (3×3, stride 2) after this.",
  relu1: "ReLU non-linearity. AlexNet popularized ReLU over tanh—it trains faster and avoids vanishing gradients.",
  conv2: "Second conv: 256 filters, 5×5 kernel. Learns mid-level features. Padding 2 preserves spatial size before pooling.",
  relu2: "ReLU after conv2.",
  conv3: "Third conv: 384 filters, 3×3. No pooling between conv2 and conv3 in the original—the first fully-connected section starts after conv5.",
  relu3: "ReLU after conv3.",
  conv4: "Fourth conv: 384 filters, 3×3. Same size as conv3; these layers refine high-level representations.",
  relu4: "ReLU after conv4.",
  conv5: "Fifth conv: 256 filters, 3×3. Final conv layer. Output is pooled to 6×6×256 before flattening.",
  relu5: "ReLU after conv5.",
  flatten_1: "Flattens spatial and channel dimensions. After pooling: 6×6×256 = 9216 features fed into the first FC layer.",
  fc6: "First fully-connected layer: 9216 → 4096. The paper used dropout (0.5) after this to reduce overfitting.",
  relu6: "ReLU after FC6.",
  dropout1: "Dropout with p=0.5. Randomly zeros half the units during training. Key to AlexNet's generalization on ImageNet.",
  fc7: "Second FC layer: 4096 → 4096. Another large bottleneck; again followed by ReLU and dropout.",
  relu7: "ReLU after FC7.",
  dropout2: "Dropout (0.5) before the final classifier.",
  fc8: "Final FC layer: 4096 → 1000. Outputs logits for 1000 ImageNet classes. Softmax is applied at inference.",
  output_1: "Output logits. For ImageNet, these are the 1000-way class scores.",
};

const ALEXNET_QUIZ_DISTRACTORS = ["MaxPool", "BatchNorm", "LayerNorm", "Softmax"];

function alexNetChoicesForStep(stepIndex: number): string[] {
  if (stepIndex >= ALEXNET_BLOCK_ORDER.length - 1) return [];
  const correct = ALEXNET_BLOCK_TITLES[ALEXNET_BLOCK_ORDER[stepIndex + 1]];
  const wrong = ALEXNET_BLOCK_ORDER.filter((_, i) => i !== stepIndex + 1).map((id) => ALEXNET_BLOCK_TITLES[id]);
  const pool = [...ALEXNET_QUIZ_DISTRACTORS, ...wrong].filter((t) => t !== correct);
  const threeWrong = pool.slice(0, 3);
  return [correct, ...threeWrong];
}

export const ALEXNET_WALKTHROUGH_STEPS: WalkthroughStep[] = ALEXNET_BLOCK_ORDER.map((blockId, index) => {
  const { nodes, edges } = alexNetGraphUpToBlock(index);
  const isLast = index === ALEXNET_BLOCK_ORDER.length - 1;
  return {
    title: ALEXNET_BLOCK_TITLES[blockId],
    description: ALEXNET_BLOCK_DESCRIPTIONS[blockId],
    ...(!isLast && {
      nextQuestion: "What layer should come next?",
      correctNext: ALEXNET_BLOCK_TITLES[ALEXNET_BLOCK_ORDER[index + 1]],
      nextChoices: alexNetChoicesForStep(index),
    }),
    graph: { ...ALEXNET_STEP_META, nodes, edges },
  };
});

// ── ResNet (He et al., 2016) ─────────────────────────────────────────────
const RESNET_STEP_META = {
  version: "1.0" as const,
  metadata: {
    name: "ResNet walkthrough",
    created_at: new Date().toISOString(),
  },
};

const RESNET_NODES = {
  input_1: { id: "input_1", type: "input", params: {}, position: { x: 80, y: 200 } },
  conv1: { id: "conv1", type: "conv2d", params: { in_channels: 1, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 }, position: { x: 200, y: 200 } },
  bn1: { id: "bn1", type: "batchnorm", params: {}, position: { x: 320, y: 200 } },
  relu1: { id: "relu1", type: "activation", params: { activation: "relu" }, position: { x: 440, y: 200 } },
  conv2a: { id: "conv2a", type: "conv2d", params: { in_channels: 64, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 }, position: { x: 560, y: 200 } },
  bn2a: { id: "bn2a", type: "batchnorm", params: {}, position: { x: 680, y: 200 } },
  relu2a: { id: "relu2a", type: "activation", params: { activation: "relu" }, position: { x: 800, y: 200 } },
  conv2b: { id: "conv2b", type: "conv2d", params: { in_channels: 64, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 }, position: { x: 920, y: 200 } },
  bn2b: { id: "bn2b", type: "batchnorm", params: {}, position: { x: 1040, y: 200 } },
  add1: { id: "add1", type: "add", params: {}, position: { x: 1160, y: 200 } },
  relu2b: { id: "relu2b", type: "activation", params: { activation: "relu" }, position: { x: 1280, y: 200 } },
  conv3a: { id: "conv3a", type: "conv2d", params: { in_channels: 64, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 }, position: { x: 1400, y: 200 } },
  bn3a: { id: "bn3a", type: "batchnorm", params: {}, position: { x: 1520, y: 200 } },
  relu3a: { id: "relu3a", type: "activation", params: { activation: "relu" }, position: { x: 1640, y: 200 } },
  conv3b: { id: "conv3b", type: "conv2d", params: { in_channels: 64, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 }, position: { x: 1760, y: 200 } },
  bn3b: { id: "bn3b", type: "batchnorm", params: {}, position: { x: 1880, y: 200 } },
  add2: { id: "add2", type: "add", params: {}, position: { x: 2000, y: 200 } },
  relu3b: { id: "relu3b", type: "activation", params: { activation: "relu" }, position: { x: 2120, y: 200 } },
  flatten_1: { id: "flatten_1", type: "flatten", params: {}, position: { x: 2240, y: 200 } },
  fc: { id: "fc", type: "linear", params: { in_features: 50176, out_features: 10 }, position: { x: 2360, y: 200 } },
  output_1: { id: "output_1", type: "output", params: {}, position: { x: 2480, y: 200 } },
};

const RESNET_EDGES = {
  e0: { id: "e0", source: "input_1", sourceHandle: "out", target: "conv1", targetHandle: "in" },
  e1: { id: "e1", source: "conv1", sourceHandle: "out", target: "bn1", targetHandle: "in" },
  e2: { id: "e2", source: "bn1", sourceHandle: "out", target: "relu1", targetHandle: "in" },
  e3: { id: "e3", source: "relu1", sourceHandle: "out", target: "conv2a", targetHandle: "in" },
  e4: { id: "e4", source: "conv2a", sourceHandle: "out", target: "bn2a", targetHandle: "in" },
  e5: { id: "e5", source: "bn2a", sourceHandle: "out", target: "relu2a", targetHandle: "in" },
  e6: { id: "e6", source: "relu2a", sourceHandle: "out", target: "conv2b", targetHandle: "in" },
  e7: { id: "e7", source: "conv2b", sourceHandle: "out", target: "bn2b", targetHandle: "in" },
  e8a: { id: "e8a", source: "relu1", sourceHandle: "out", target: "add1", targetHandle: "in_a" },
  e8b: { id: "e8b", source: "bn2b", sourceHandle: "out", target: "add1", targetHandle: "in_b" },
  e9: { id: "e9", source: "add1", sourceHandle: "out", target: "relu2b", targetHandle: "in" },
  e10: { id: "e10", source: "relu2b", sourceHandle: "out", target: "conv3a", targetHandle: "in" },
  e11: { id: "e11", source: "conv3a", sourceHandle: "out", target: "bn3a", targetHandle: "in" },
  e12: { id: "e12", source: "bn3a", sourceHandle: "out", target: "relu3a", targetHandle: "in" },
  e13: { id: "e13", source: "relu3a", sourceHandle: "out", target: "conv3b", targetHandle: "in" },
  e14: { id: "e14", source: "conv3b", sourceHandle: "out", target: "bn3b", targetHandle: "in" },
  e15a: { id: "e15a", source: "relu2b", sourceHandle: "out", target: "add2", targetHandle: "in_a" },
  e15b: { id: "e15b", source: "bn3b", sourceHandle: "out", target: "add2", targetHandle: "in_b" },
  e16: { id: "e16", source: "add2", sourceHandle: "out", target: "relu3b", targetHandle: "in" },
  e17: { id: "e17", source: "relu3b", sourceHandle: "out", target: "flatten_1", targetHandle: "in" },
  e18: { id: "e18", source: "flatten_1", sourceHandle: "out", target: "fc", targetHandle: "in" },
  e19: { id: "e19", source: "fc", sourceHandle: "out", target: "output_1", targetHandle: "in" },
};

const RESNET_BLOCK_ORDER = [
  "input_1", "conv1", "bn1", "relu1",
  "conv2a", "bn2a", "relu2a", "conv2b", "bn2b", "add1", "relu2b",
  "conv3a", "bn3a", "relu3a", "conv3b", "bn3b", "add2", "relu3b",
  "flatten_1", "fc", "output_1",
] as const;

const RESNET_ALL_EDGES = Object.values(RESNET_EDGES);

function resNetGraphUpToBlock(index: number) {
  const nodeIds = new Set(RESNET_BLOCK_ORDER.slice(0, index + 1));
  const nodes = RESNET_BLOCK_ORDER.slice(0, index + 1).map((id) => RESNET_NODES[id]);
  const edges = RESNET_ALL_EDGES.filter(
    (e) => nodeIds.has(e.source as typeof RESNET_BLOCK_ORDER[number]) && nodeIds.has(e.target as typeof RESNET_BLOCK_ORDER[number])
  );
  return { nodes, edges };
}

const RESNET_BLOCK_TITLES: Record<typeof RESNET_BLOCK_ORDER[number], string> = {
  input_1: "Input",
  conv1: "Conv2D (64 filters, 3×3, stem)",
  bn1: "BatchNorm",
  relu1: "ReLU",
  conv2a: "Conv2D (64, 3×3, block 1a)",
  bn2a: "BatchNorm",
  relu2a: "ReLU",
  conv2b: "Conv2D (64, 3×3, block 1b)",
  bn2b: "BatchNorm",
  add1: "Add (residual connection)",
  relu2b: "ReLU",
  conv3a: "Conv2D (64, 3×3, block 2a)",
  bn3a: "BatchNorm",
  relu3a: "ReLU",
  conv3b: "Conv2D (64, 3×3, block 2b)",
  bn3b: "BatchNorm",
  add2: "Add (residual connection)",
  relu3b: "ReLU",
  flatten_1: "Flatten",
  fc: "Linear (10 classes)",
  output_1: "Output",
};

const RESNET_BLOCK_DESCRIPTIONS: Record<typeof RESNET_BLOCK_ORDER[number], string> = {
  input_1: "Raw image input. ResNet was designed for 224×224 ImageNet; here we use 28×28 (e.g. MNIST) for compatibility.",
  conv1: "Stem conv: 64 filters, 3×3, stride 1. In ResNet-18 the stem uses 7×7 stride 2; we simplify to 3×3 for smaller inputs.",
  bn1: "BatchNorm stabilizes activations and accelerates training. ResNet uses BN after every conv, before ReLU.",
  relu1: "ReLU after the stem. This output is the identity path for the first residual block.",
  conv2a: "First conv of residual block 1: 3×3, 64 channels. The residual path: Conv → BN → ReLU → Conv → BN.",
  bn2a: "BatchNorm after conv2a.",
  relu2a: "ReLU before the second conv in the block.",
  conv2b: "Second conv of block 1: 3×3, 64 channels. Output is added to the identity (skip connection).",
  bn2b: "BatchNorm after conv2b. This output goes to the Add block.",
  add1: "Residual connection: Add(identity, conv_output). The skip path carries the input unchanged; gradients flow directly through it, enabling very deep networks.",
  relu2b: "ReLU after the first residual block. Output feeds the next block.",
  conv3a: "First conv of residual block 2.",
  bn3a: "BatchNorm after conv3a.",
  relu3a: "ReLU before conv3b.",
  conv3b: "Second conv of block 2.",
  bn3b: "BatchNorm after conv3b.",
  add2: "Second residual Add. Same idea: identity + learned residual.",
  relu3b: "ReLU after block 2. Then flatten and classify.",
  flatten_1: "Flattens spatial and channel dimensions. ResNet typically uses global average pool; we use Flatten for compatibility.",
  fc: "Final linear layer: 50176 → 10. For ImageNet the paper uses 2048 → 1000.",
  output_1: "Output logits for 10 classes.",
};

const RESNET_QUIZ_DISTRACTORS = ["MaxPool", "LayerNorm", "Dropout", "Softmax"];

function resNetChoicesForStep(stepIndex: number): string[] {
  if (stepIndex >= RESNET_BLOCK_ORDER.length - 1) return [];
  const correct = RESNET_BLOCK_TITLES[RESNET_BLOCK_ORDER[stepIndex + 1]];
  const wrong = RESNET_BLOCK_ORDER.filter((_, i) => i !== stepIndex + 1).map((id) => RESNET_BLOCK_TITLES[id]);
  const pool = [...RESNET_QUIZ_DISTRACTORS, ...wrong].filter((t) => t !== correct);
  const threeWrong = pool.slice(0, 3);
  return [correct, ...threeWrong];
}

export const RESNET_WALKTHROUGH_STEPS: WalkthroughStep[] = RESNET_BLOCK_ORDER.map((blockId, index) => {
  const { nodes, edges } = resNetGraphUpToBlock(index);
  const isLast = index === RESNET_BLOCK_ORDER.length - 1;
  return {
    title: RESNET_BLOCK_TITLES[blockId],
    description: RESNET_BLOCK_DESCRIPTIONS[blockId],
    ...(!isLast && {
      nextQuestion: "What layer should come next?",
      correctNext: RESNET_BLOCK_TITLES[RESNET_BLOCK_ORDER[index + 1]],
      nextChoices: resNetChoicesForStep(index),
    }),
    graph: { ...RESNET_STEP_META, nodes, edges },
  };
});

// ── BERT (Devlin et al., 2019) ────────────────────────────────────────────
// Architecturally identical to Transformer encoder; BERT uses GELU in FFN instead of ReLU.
const BERT_STEP_META = {
  version: "1.0" as const,
  metadata: {
    name: "BERT walkthrough",
    created_at: new Date().toISOString(),
  },
};

const BERT_NODES = {
  text_input_1: { id: "text_input_1", type: "text_input", params: { batch_size: 1, seq_len: 128 }, position: { x: 80, y: 380 } },
  text_embed_1: { id: "text_embed_1", type: "text_embedding", params: { vocab_size: 30522, embedding_dim: 128 }, position: { x: 220, y: 380 } },
  pos_embed_1: { id: "pos_embed_1", type: "positional_embedding", params: { d_model: 128, max_len: 512 }, position: { x: 360, y: 380 } },
  ln_pre: { id: "ln_pre", type: "layernorm", params: { normalized_shape: 128 }, position: { x: 320, y: 280 } },
  attn: { id: "attn", type: "attention", params: { embed_dim: 128, num_heads: 4 }, position: { x: 460, y: 280 } },
  add_1: { id: "add_1", type: "add", params: {}, position: { x: 600, y: 280 } },
  ln_mid: { id: "ln_mid", type: "layernorm", params: { normalized_shape: 128 }, position: { x: 320, y: 180 } },
  linear_1: { id: "linear_1", type: "linear", params: { in_features: 128, out_features: 512 }, position: { x: 460, y: 180 } },
  gelu_1: { id: "gelu_1", type: "activation", params: { activation: "gelu" }, position: { x: 540, y: 180 } },
  linear_2: { id: "linear_2", type: "linear", params: { in_features: 512, out_features: 128 }, position: { x: 620, y: 180 } },
  add_2: { id: "add_2", type: "add", params: {}, position: { x: 760, y: 180 } },
  ln_post: { id: "ln_post", type: "layernorm", params: { normalized_shape: 128 }, position: { x: 320, y: 80 } },
  output_1: { id: "output_1", type: "output", params: {}, position: { x: 460, y: 80 } },
};

const BERT_EDGES = {
  e0a: { id: "e0a", source: "text_input_1", sourceHandle: "out", target: "text_embed_1", targetHandle: "in" },
  e0b: { id: "e0b", source: "text_embed_1", sourceHandle: "out", target: "pos_embed_1", targetHandle: "in" },
  e1: { id: "e1", source: "pos_embed_1", sourceHandle: "out", target: "ln_pre", targetHandle: "in" },
  e2: { id: "e2", source: "pos_embed_1", sourceHandle: "out", target: "add_1", targetHandle: "in_a" },
  e3: { id: "e3", source: "ln_pre", sourceHandle: "out", target: "attn", targetHandle: "in" },
  e4: { id: "e4", source: "attn", sourceHandle: "out", target: "add_1", targetHandle: "in_b" },
  e5: { id: "e5", source: "add_1", sourceHandle: "out", target: "ln_mid", targetHandle: "in" },
  e6: { id: "e6", source: "ln_mid", sourceHandle: "out", target: "linear_1", targetHandle: "in" },
  e7: { id: "e7", source: "ln_mid", sourceHandle: "out", target: "add_2", targetHandle: "in_a" },
  e8: { id: "e8", source: "linear_1", sourceHandle: "out", target: "gelu_1", targetHandle: "in" },
  e9: { id: "e9", source: "gelu_1", sourceHandle: "out", target: "linear_2", targetHandle: "in" },
  e10: { id: "e10", source: "linear_2", sourceHandle: "out", target: "add_2", targetHandle: "in_b" },
  e11: { id: "e11", source: "add_2", sourceHandle: "out", target: "ln_post", targetHandle: "in" },
  e12: { id: "e12", source: "ln_post", sourceHandle: "out", target: "output_1", targetHandle: "in" },
};

const BERT_BLOCK_ORDER = [
  "text_input_1", "text_embed_1", "pos_embed_1", "ln_pre", "attn", "add_1",
  "ln_mid", "linear_1", "gelu_1", "linear_2", "add_2", "ln_post", "output_1",
] as const;

const BERT_ALL_EDGES = Object.values(BERT_EDGES);

function bertGraphUpToBlock(index: number) {
  const nodeIds = new Set(BERT_BLOCK_ORDER.slice(0, index + 1));
  const nodes = BERT_BLOCK_ORDER.slice(0, index + 1).map((id) => BERT_NODES[id]);
  const edges = BERT_ALL_EDGES.filter(
    (e) => nodeIds.has(e.source as typeof BERT_BLOCK_ORDER[number]) && nodeIds.has(e.target as typeof BERT_BLOCK_ORDER[number])
  );
  return { nodes, edges };
}

const BERT_BLOCK_TITLES: Record<typeof BERT_BLOCK_ORDER[number], string> = {
  text_input_1: "Text Input",
  text_embed_1: "Token Embedding",
  pos_embed_1: "Position Embedding",
  ln_pre: "LayerNorm (pre-attention)",
  attn: "Multi-Head Self-Attention",
  add_1: "Add & Norm (after attention)",
  ln_mid: "LayerNorm (pre–feed-forward)",
  linear_1: "Linear (expand)",
  gelu_1: "GELU",
  linear_2: "Linear (project)",
  add_2: "Add & Norm (after FFN)",
  ln_post: "LayerNorm (final)",
  output_1: "Output",
};

const BERT_BLOCK_DESCRIPTIONS: Record<typeof BERT_BLOCK_ORDER[number], string> = {
  text_input_1: "Token IDs with [CLS] and [SEP] special tokens. BERT is pre-trained on masked LM and NSP; architecture is encoder-only.",
  text_embed_1: "Token embeddings (vocab 30522 in BERT-base). Plus segment and position embeddings summed; we use a single position embedding block.",
  pos_embed_1: "Learned position embeddings. BERT uses learned (not sinusoidal) positions; max_len 512 matches BERT.",
  ln_pre: "LayerNorm before attention. BERT uses post-norm architecture (norm after residual), similar to Transformer.",
  attn: "Bidirectional self-attention. Each token attends to all positions; BERT is bidirectional (unlike autoregressive GPT).",
  add_1: "Residual connection after attention. Add & Norm preserves gradient flow.",
  ln_mid: "LayerNorm before the intermediate FFN.",
  linear_1: "Position-wise FFN: expand 128 → 512. Same as Transformer; inner dim typically 4× hidden size.",
  gelu_1: "GELU activation. BERT uses GELU instead of ReLU in the FFN; GELU is smoother and often works better for NLP.",
  linear_2: "Project back 512 → 128. Position-wise FFN completes: Linear → GELU → Linear.",
  add_2: "Residual after FFN. Add & Norm.",
  ln_post: "Final LayerNorm. Output is the contextualized representation for each token (e.g. [CLS] for sentence classification).",
  output_1: "Encoder output [B, seq, 128]. BERT-base has 12 such layers, d_model=768; we use 1 layer, 128 dim for clarity.",
};

const BERT_QUIZ_DISTRACTORS = ["Dropout", "BatchNorm", "Another Attention layer", "ReLU"];

function bertChoicesForStep(stepIndex: number): string[] {
  if (stepIndex >= BERT_BLOCK_ORDER.length - 1) return [];
  const correct = BERT_BLOCK_TITLES[BERT_BLOCK_ORDER[stepIndex + 1]];
  const wrong = BERT_BLOCK_ORDER.filter((_, i) => i !== stepIndex + 1).map((id) => BERT_BLOCK_TITLES[id]);
  const pool = [...BERT_QUIZ_DISTRACTORS, ...wrong].filter((t) => t !== correct);
  const threeWrong = pool.slice(0, 3);
  return [correct, ...threeWrong];
}

export const BERT_WALKTHROUGH_STEPS: WalkthroughStep[] = BERT_BLOCK_ORDER.map((blockId, index) => {
  const { nodes, edges } = bertGraphUpToBlock(index);
  const isLast = index === BERT_BLOCK_ORDER.length - 1;
  return {
    title: BERT_BLOCK_TITLES[blockId],
    description: BERT_BLOCK_DESCRIPTIONS[blockId],
    ...(!isLast && {
      nextQuestion: "What layer should come next?",
      correctNext: BERT_BLOCK_TITLES[BERT_BLOCK_ORDER[index + 1]],
      nextChoices: bertChoicesForStep(index),
    }),
    graph: { ...BERT_STEP_META, nodes, edges },
  };
});

// ── GPT (Radford et al., 2018) ────────────────────────────────────────────
// Decoder-only Transformer: same block layout as BERT but with causal (autoregressive) self-attention.
const GPT_STEP_META = {
  version: "1.0" as const,
  metadata: {
    name: "GPT walkthrough",
    created_at: new Date().toISOString(),
  },
};

const GPT_NODES = {
  text_input_1: { id: "text_input_1", type: "text_input", params: { batch_size: 1, seq_len: 128 }, position: { x: 80, y: 380 } },
  text_embed_1: { id: "text_embed_1", type: "text_embedding", params: { vocab_size: 50257, embedding_dim: 128 }, position: { x: 220, y: 380 } },
  pos_embed_1: { id: "pos_embed_1", type: "positional_embedding", params: { d_model: 128, max_len: 1024 }, position: { x: 360, y: 380 } },
  ln_pre: { id: "ln_pre", type: "layernorm", params: { normalized_shape: 128 }, position: { x: 320, y: 280 } },
  attn: { id: "attn", type: "attention", params: { embed_dim: 128, num_heads: 4 }, position: { x: 460, y: 280 } },
  add_1: { id: "add_1", type: "add", params: {}, position: { x: 600, y: 280 } },
  ln_mid: { id: "ln_mid", type: "layernorm", params: { normalized_shape: 128 }, position: { x: 320, y: 180 } },
  linear_1: { id: "linear_1", type: "linear", params: { in_features: 128, out_features: 512 }, position: { x: 460, y: 180 } },
  gelu_1: { id: "gelu_1", type: "activation", params: { activation: "gelu" }, position: { x: 540, y: 180 } },
  linear_2: { id: "linear_2", type: "linear", params: { in_features: 512, out_features: 128 }, position: { x: 620, y: 180 } },
  add_2: { id: "add_2", type: "add", params: {}, position: { x: 760, y: 180 } },
  ln_post: { id: "ln_post", type: "layernorm", params: { normalized_shape: 128 }, position: { x: 320, y: 80 } },
  output_1: { id: "output_1", type: "output", params: {}, position: { x: 460, y: 80 } },
};

const GPT_EDGES = {
  e0a: { id: "e0a", source: "text_input_1", sourceHandle: "out", target: "text_embed_1", targetHandle: "in" },
  e0b: { id: "e0b", source: "text_embed_1", sourceHandle: "out", target: "pos_embed_1", targetHandle: "in" },
  e1: { id: "e1", source: "pos_embed_1", sourceHandle: "out", target: "ln_pre", targetHandle: "in" },
  e2: { id: "e2", source: "pos_embed_1", sourceHandle: "out", target: "add_1", targetHandle: "in_a" },
  e3: { id: "e3", source: "ln_pre", sourceHandle: "out", target: "attn", targetHandle: "in" },
  e4: { id: "e4", source: "attn", sourceHandle: "out", target: "add_1", targetHandle: "in_b" },
  e5: { id: "e5", source: "add_1", sourceHandle: "out", target: "ln_mid", targetHandle: "in" },
  e6: { id: "e6", source: "ln_mid", sourceHandle: "out", target: "linear_1", targetHandle: "in" },
  e7: { id: "e7", source: "ln_mid", sourceHandle: "out", target: "add_2", targetHandle: "in_a" },
  e8: { id: "e8", source: "linear_1", sourceHandle: "out", target: "gelu_1", targetHandle: "in" },
  e9: { id: "e9", source: "gelu_1", sourceHandle: "out", target: "linear_2", targetHandle: "in" },
  e10: { id: "e10", source: "linear_2", sourceHandle: "out", target: "add_2", targetHandle: "in_b" },
  e11: { id: "e11", source: "add_2", sourceHandle: "out", target: "ln_post", targetHandle: "in" },
  e12: { id: "e12", source: "ln_post", sourceHandle: "out", target: "output_1", targetHandle: "in" },
};

const GPT_BLOCK_ORDER = [
  "text_input_1", "text_embed_1", "pos_embed_1", "ln_pre", "attn", "add_1",
  "ln_mid", "linear_1", "gelu_1", "linear_2", "add_2", "ln_post", "output_1",
] as const;

const GPT_ALL_EDGES = Object.values(GPT_EDGES);

function gptGraphUpToBlock(index: number) {
  const nodeIds = new Set(GPT_BLOCK_ORDER.slice(0, index + 1));
  const nodes = GPT_BLOCK_ORDER.slice(0, index + 1).map((id) => GPT_NODES[id]);
  const edges = GPT_ALL_EDGES.filter(
    (e) => nodeIds.has(e.source as typeof GPT_BLOCK_ORDER[number]) && nodeIds.has(e.target as typeof GPT_BLOCK_ORDER[number])
  );
  return { nodes, edges };
}

const GPT_BLOCK_TITLES: Record<typeof GPT_BLOCK_ORDER[number], string> = {
  text_input_1: "Text Input",
  text_embed_1: "Token Embedding",
  pos_embed_1: "Position Embedding",
  ln_pre: "LayerNorm (pre-attention)",
  attn: "Masked Multi-Head Self-Attention",
  add_1: "Add & Norm (after attention)",
  ln_mid: "LayerNorm (pre–feed-forward)",
  linear_1: "Linear (expand)",
  gelu_1: "GELU",
  linear_2: "Linear (project)",
  add_2: "Add & Norm (after FFN)",
  ln_post: "LayerNorm (final)",
  output_1: "Output",
};

const GPT_BLOCK_DESCRIPTIONS: Record<typeof GPT_BLOCK_ORDER[number], string> = {
  text_input_1: "Token IDs for the input sequence. GPT is autoregressive: at each step it conditions on previous tokens only. No [CLS] or [SEP]; the model sees a causal (left-to-right) context.",
  text_embed_1: "Token embeddings. GPT-2 uses vocab size 50257; we use the same for compatibility. Embedding weights are shared with the output projection in the full model.",
  pos_embed_1: "Learned position embeddings. GPT uses learned positions (max_len 1024 in GPT-2). Position tells the model where each token sits in the sequence for causal attention.",
  ln_pre: "LayerNorm before the attention sublayer. GPT uses pre-norm: normalize first, then attention, then add residual. This stabilizes training in deep decoder stacks.",
  attn: "Causal (masked) self-attention. Each position can attend only to itself and previous positions—future tokens are masked. This enables autoregressive next-token prediction.",
  add_1: "Residual connection after attention. Add & Norm: output = x + Attention(LayerNorm(x)). Gradients flow through the skip path for deep stacks.",
  ln_mid: "LayerNorm before the position-wise feed-forward sublayer. Same pre-norm pattern as before attention.",
  linear_1: "Position-wise FFN: expand 128 → 512. Inner dimension is typically 4× the model dimension (e.g. GPT-2 small: 768 → 3072).",
  gelu_1: "GELU activation. GPT uses GELU in the FFN (like BERT). GELU is smoother than ReLU and works well for language modeling.",
  linear_2: "Project back 512 → 128. The FFN is Linear → GELU → Linear; output is added to the residual (identity) from before the block.",
  add_2: "Residual after FFN. Add & Norm completes the decoder block. One GPT layer = (Masked Attention + Add) + (FFN + Add), each with pre-LayerNorm.",
  ln_post: "Final LayerNorm. Output of the last decoder block is LayerNorm'd; in the full model this is then projected to vocab size for next-token logits.",
  output_1: "Decoder output [B, seq, 128]. GPT stacks many such blocks (e.g. 12 in GPT-2 small, 96 in GPT-3). Here we show one block; the rest repeat the same pattern.",
};

const GPT_QUIZ_DISTRACTORS = ["Dropout", "BatchNorm", "Another Attention layer", "ReLU"];

function gptChoicesForStep(stepIndex: number): string[] {
  if (stepIndex >= GPT_BLOCK_ORDER.length - 1) return [];
  const correct = GPT_BLOCK_TITLES[GPT_BLOCK_ORDER[stepIndex + 1]];
  const wrong = GPT_BLOCK_ORDER.filter((_, i) => i !== stepIndex + 1).map((id) => GPT_BLOCK_TITLES[id]);
  const pool = [...GPT_QUIZ_DISTRACTORS, ...wrong].filter((t) => t !== correct);
  const threeWrong = pool.slice(0, 3);
  return [correct, ...threeWrong];
}

export const GPT_WALKTHROUGH_STEPS: WalkthroughStep[] = GPT_BLOCK_ORDER.map((blockId, index) => {
  const { nodes, edges } = gptGraphUpToBlock(index);
  const isLast = index === GPT_BLOCK_ORDER.length - 1;
  return {
    title: GPT_BLOCK_TITLES[blockId],
    description: GPT_BLOCK_DESCRIPTIONS[blockId],
    ...(!isLast && {
      nextQuestion: "What layer should come next?",
      correctNext: GPT_BLOCK_TITLES[GPT_BLOCK_ORDER[index + 1]],
      nextChoices: gptChoicesForStep(index),
    }),
    graph: { ...GPT_STEP_META, nodes, edges },
  };
});

/** Walkthrough config by level number (papers only). */
export const PAPER_WALKTHROUGHS: Record<number, WalkthroughStep[]> = {
  7: TRANSFORMER_WALKTHROUGH_STEPS,
  8: ALEXNET_WALKTHROUGH_STEPS,
  9: RESNET_WALKTHROUGH_STEPS,
  10: BERT_WALKTHROUGH_STEPS,
  11: GPT_WALKTHROUGH_STEPS,
};

