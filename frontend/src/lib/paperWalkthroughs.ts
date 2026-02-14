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

/** Walkthrough config by level number (papers only). */
export const PAPER_WALKTHROUGHS: Record<number, WalkthroughStep[]> = {
  7: TRANSFORMER_WALKTHROUGH_STEPS,
};

