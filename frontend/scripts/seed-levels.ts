/**
 * Seed the `levels` table in Supabase with pre-stored challenge graphs.
 * Run from frontend dir: npm run seed-levels  or  npx tsx scripts/seed-levels.ts
 *
 * Requires in .env.local (or env):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (bypasses RLS so we can insert into levels)
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function loadEnvLocal() {
  for (const f of [".env.local", ".env"]) {
    const p = resolve(projectRoot, f);
    if (existsSync(p)) {
      const content = readFileSync(p, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.replace(/#.*$/, "").trim();
        const eq = trimmed.indexOf("=");
        if (eq > 0) {
          const key = trimmed.slice(0, eq).trim();
          let val = trimmed.slice(eq + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
            val = val.slice(1, -1);
          if (key && !process.env[key]) process.env[key] = val;
        }
      }
      break;
    }
  }
}
loadEnvLocal();

import { createClient } from "@supabase/supabase-js";
import type { GraphSchema } from "../src/types/graph";

const LEVEL_1_GRAPH: GraphSchema = {
  version: "1.0",
  nodes: [
    {
      id: "input_1",
      type: "input",
      params: {},
      position: { x: 120, y: 200 },
    },
    {
      id: "output_1",
      type: "output",
      params: {},
      position: { x: 420, y: 200 },
    },
  ],
  edges: [],
  metadata: {
    name: "Level 1: Connect input to output",
    created_at: new Date().toISOString(),
    description: "Connect the Input block to the Output block by adding layers in between (e.g. Flatten, Linear, Activation) to build a feed-forward network.",
  },
};

/** Level 1 correct answer: Input → Flatten → Linear → Output */
const LEVEL_1_SOLUTION: GraphSchema = {
  version: "1.0",
  nodes: [
    { id: "input_1", type: "input", params: {}, position: { x: 80, y: 200 } },
    { id: "flatten_1", type: "flatten", params: {}, position: { x: 280, y: 200 } },
    { id: "linear_1", type: "linear", params: { in_features: 784, out_features: 128 }, position: { x: 480, y: 200 } },
    { id: "output_1", type: "output", params: {}, position: { x: 680, y: 200 } },
  ],
  edges: [
    { id: "e1", source: "input_1", sourceHandle: "out", target: "flatten_1", targetHandle: "in" },
    { id: "e2", source: "flatten_1", sourceHandle: "out", target: "linear_1", targetHandle: "in" },
    { id: "e3", source: "linear_1", sourceHandle: "out", target: "output_1", targetHandle: "in" },
  ],
  metadata: {
    name: "Level 1 solution",
    created_at: new Date().toISOString(),
  },
};

// Level 2: Add ReLU activation
const LEVEL_2_GRAPH: GraphSchema = {
  version: "1.0",
  nodes: [
    { id: "input_1", type: "input", params: {}, position: { x: 80, y: 200 } },
    { id: "output_1", type: "output", params: {}, position: { x: 520, y: 200 } },
  ],
  edges: [],
  metadata: {
    name: "Level 2",
    created_at: new Date().toISOString(),
    description: "Add a non-linear activation (ReLU) between the Linear layer and the Output.",
  },
};

const LEVEL_2_SOLUTION: GraphSchema = {
  version: "1.0",
  nodes: [
    { id: "input_1", type: "input", params: {}, position: { x: 80, y: 200 } },
    { id: "flatten_1", type: "flatten", params: {}, position: { x: 200, y: 200 } },
    { id: "linear_1", type: "linear", params: { in_features: 784, out_features: 128 }, position: { x: 320, y: 200 } },
    { id: "activation_1", type: "relu", params: {}, position: { x: 440, y: 200 } },
    { id: "output_1", type: "output", params: {}, position: { x: 560, y: 200 } },
  ],
  edges: [
    { id: "e1", source: "input_1", sourceHandle: "out", target: "flatten_1", targetHandle: "in" },
    { id: "e2", source: "flatten_1", sourceHandle: "out", target: "linear_1", targetHandle: "in" },
    { id: "e3", source: "linear_1", sourceHandle: "out", target: "activation_1", targetHandle: "in" },
    { id: "e4", source: "activation_1", sourceHandle: "out", target: "output_1", targetHandle: "in" },
  ],
  metadata: { name: "Level 2 solution", created_at: new Date().toISOString() },
};

// Level 3: Simple CNN (Conv2D → Activation → Flatten → Linear → Output)
const LEVEL_3_GRAPH: GraphSchema = {
  version: "1.0",
  nodes: [
    { id: "input_1", type: "input", params: {}, position: { x: 80, y: 200 } },
    { id: "output_1", type: "output", params: {}, position: { x: 600, y: 200 } },
  ],
  edges: [],
  metadata: {
    name: "Level 3",
    created_at: new Date().toISOString(),
    description: "Build a small convolutional network: Conv2D → Activation → Flatten → Linear → Output.",
  },
};

const LEVEL_3_SOLUTION: GraphSchema = {
  version: "1.0",
  nodes: [
    { id: "input_1", type: "input", params: {}, position: { x: 80, y: 200 } },
    { id: "conv_1", type: "conv2d", params: { in_channels: 1, out_channels: 32, kernel_size: 3, stride: 1, padding: 1 }, position: { x: 200, y: 200 } },
    { id: "activation_1", type: "relu", params: {}, position: { x: 320, y: 200 } },
    { id: "flatten_1", type: "flatten", params: {}, position: { x: 440, y: 200 } },
    { id: "linear_1", type: "linear", params: { in_features: 32 * 28 * 28, out_features: 128 }, position: { x: 560, y: 200 } },
    { id: "output_1", type: "output", params: {}, position: { x: 680, y: 200 } },
  ],
  edges: [
    { id: "e1", source: "input_1", sourceHandle: "out", target: "conv_1", targetHandle: "in" },
    { id: "e2", source: "conv_1", sourceHandle: "out", target: "activation_1", targetHandle: "in" },
    { id: "e3", source: "activation_1", sourceHandle: "out", target: "flatten_1", targetHandle: "in" },
    { id: "e4", source: "flatten_1", sourceHandle: "out", target: "linear_1", targetHandle: "in" },
    { id: "e5", source: "linear_1", sourceHandle: "out", target: "output_1", targetHandle: "in" },
  ],
  metadata: { name: "Level 3 solution", created_at: new Date().toISOString() },
};

// Level 4: Dropout for regularization
const LEVEL_4_GRAPH: GraphSchema = {
  version: "1.0",
  nodes: [
    { id: "input_1", type: "input", params: {}, position: { x: 80, y: 200 } },
    { id: "output_1", type: "output", params: {}, position: { x: 520, y: 200 } },
  ],
  edges: [],
  metadata: {
    name: "Level 4",
    created_at: new Date().toISOString(),
    description: "Add Dropout between Linear and Output to reduce overfitting.",
  },
};

const LEVEL_4_SOLUTION: GraphSchema = {
  version: "1.0",
  nodes: [
    { id: "input_1", type: "input", params: {}, position: { x: 80, y: 200 } },
    { id: "flatten_1", type: "flatten", params: {}, position: { x: 200, y: 200 } },
    { id: "linear_1", type: "linear", params: { in_features: 784, out_features: 128 }, position: { x: 320, y: 200 } },
    { id: "dropout_1", type: "dropout", params: { p: 0.5 }, position: { x: 440, y: 200 } },
    { id: "output_1", type: "output", params: {}, position: { x: 560, y: 200 } },
  ],
  edges: [
    { id: "e1", source: "input_1", sourceHandle: "out", target: "flatten_1", targetHandle: "in" },
    { id: "e2", source: "flatten_1", sourceHandle: "out", target: "linear_1", targetHandle: "in" },
    { id: "e3", source: "linear_1", sourceHandle: "out", target: "dropout_1", targetHandle: "in" },
    { id: "e4", source: "dropout_1", sourceHandle: "out", target: "output_1", targetHandle: "in" },
  ],
  metadata: { name: "Level 4 solution", created_at: new Date().toISOString() },
};

// Level 5: Transformer-style (LayerNorm → Attention → Output). Uses 3D input [B, seq, dim]; Add available for later challenges.
const LEVEL_5_GRAPH: GraphSchema = {
  version: "1.0",
  nodes: [
    { id: "input_1", type: "input", params: {}, position: { x: 80, y: 200 } },
    { id: "output_1", type: "output", params: {}, position: { x: 480, y: 200 } },
  ],
  edges: [],
  metadata: {
    name: "Level 5",
    created_at: new Date().toISOString(),
    description: "Build a transformer-style path: LayerNorm then Attention. (Input must be 3D [batch, seq, features]; e.g. use Embedding first for token sequences.)",
  },
};

const LEVEL_5_SOLUTION: GraphSchema = {
  version: "1.0",
  nodes: [
    { id: "input_1", type: "input", params: {}, position: { x: 80, y: 200 } },
    { id: "ln1", type: "layernorm", params: {}, position: { x: 200, y: 200 } },
    { id: "attn", type: "attention", params: { embed_dim: 128, num_heads: 4 }, position: { x: 320, y: 200 } },
    { id: "output_1", type: "output", params: {}, position: { x: 440, y: 200 } },
  ],
  edges: [
    { id: "e1", source: "input_1", sourceHandle: "out", target: "ln1", targetHandle: "in" },
    { id: "e2", source: "ln1", sourceHandle: "out", target: "attn", targetHandle: "in" },
    { id: "e3", source: "attn", sourceHandle: "out", target: "output_1", targetHandle: "in" },
  ],
  metadata: { name: "Level 5 solution", created_at: new Date().toISOString() },
};

// Level 6: Residual connection with Add (teaches Add block)
const LEVEL_6_GRAPH: GraphSchema = {
  version: "1.0",
  nodes: [
    { id: "input_1", type: "input", params: {}, position: { x: 80, y: 200 } },
    { id: "output_1", type: "output", params: {}, position: { x: 520, y: 200 } },
  ],
  edges: [],
  metadata: {
    name: "Level 6",
    created_at: new Date().toISOString(),
    description: "Use the Add block with two inputs: a skip path and a path through Linear. Connect both of Add’s input ports.",
  },
};

const LEVEL_6_SOLUTION: GraphSchema = {
  version: "1.0",
  nodes: [
    { id: "input_1", type: "input", params: {}, position: { x: 80, y: 200 } },
    { id: "flatten_1", type: "flatten", params: {}, position: { x: 180, y: 200 } },
    { id: "linear_1", type: "linear", params: { in_features: 784, out_features: 784 }, position: { x: 300, y: 200 } },
    { id: "add_1", type: "add", params: {}, position: { x: 440, y: 200 } },
    { id: "output_1", type: "output", params: {}, position: { x: 560, y: 200 } },
  ],
  edges: [
    { id: "e1", source: "input_1", sourceHandle: "out", target: "flatten_1", targetHandle: "in" },
    { id: "e2", source: "flatten_1", sourceHandle: "out", target: "linear_1", targetHandle: "in" },
    { id: "e3", source: "flatten_1", sourceHandle: "out", target: "add_1", targetHandle: "in_a" },
    { id: "e4", source: "linear_1", sourceHandle: "out", target: "add_1", targetHandle: "in_b" },
    { id: "e5", source: "add_1", sourceHandle: "out", target: "output_1", targetHandle: "in" },
  ],
  metadata: { name: "Level 6 solution", created_at: new Date().toISOString() },
};

// ---------------------------------------------------------------------------
// Paper: Attention is All You Need (Vaswani et al.) — pre-built with text pipeline
// ---------------------------------------------------------------------------

/** Encoder layout matching "Attention is All You Need" diagram: bottom = Inputs → Input Embedding → Positional Encoding; then Nx encoder block = Multi-Head Attention → Add & Norm → Feed Forward → Add & Norm; top = Output. Y increases downward so diagram flows bottom-to-top. */
const TRANSFORMER_PAPER_GRAPH: GraphSchema = {
  version: "1.0",
  nodes: [
    // Bottom (diagram): Inputs → Input Embedding → Positional Encoding
    { id: "text_input_1", type: "text_input", params: { batch_size: 1, seq_len: 128 }, position: { x: 80, y: 380 } },
    { id: "text_embed_1", type: "text_embedding", params: { vocab_size: 10000, embedding_dim: 128 }, position: { x: 220, y: 380 } },
    { id: "pos_embed_1", type: "positional_embedding", params: { d_model: 128, max_len: 512 }, position: { x: 360, y: 380 } },
    // Encoder layer 1: Multi-Head Attention → Add & Norm
    { id: "ln_pre", type: "layernorm", params: { normalized_shape: 128 }, position: { x: 320, y: 280 } },
    { id: "attn", type: "attention", params: { embed_dim: 128, num_heads: 4 }, position: { x: 460, y: 280 } },
    { id: "add_1", type: "add", params: {}, position: { x: 600, y: 280 } },
    // Encoder layer 2: Feed Forward → Add & Norm
    { id: "ln_mid", type: "layernorm", params: { normalized_shape: 128 }, position: { x: 320, y: 180 } },
    { id: "linear_1", type: "linear", params: { in_features: 128, out_features: 512 }, position: { x: 460, y: 180 } },
    { id: "relu_1", type: "activation", params: { activation: "relu" }, position: { x: 540, y: 180 } },
    { id: "linear_2", type: "linear", params: { in_features: 512, out_features: 128 }, position: { x: 620, y: 180 } },
    { id: "add_2", type: "add", params: {}, position: { x: 760, y: 180 } },
    // Top (diagram): final LayerNorm → Output
    { id: "ln_post", type: "layernorm", params: { normalized_shape: 128 }, position: { x: 320, y: 80 } },
    { id: "output_1", type: "output", params: {}, position: { x: 460, y: 80 } },
  ],
  edges: [
    { id: "e0a", source: "text_input_1", sourceHandle: "out", target: "text_embed_1", targetHandle: "in" },
    { id: "e0b", source: "text_embed_1", sourceHandle: "out", target: "pos_embed_1", targetHandle: "in" },
    { id: "e1", source: "pos_embed_1", sourceHandle: "out", target: "ln_pre", targetHandle: "in" },
    { id: "e2", source: "pos_embed_1", sourceHandle: "out", target: "add_1", targetHandle: "in_a" },
    { id: "e3", source: "ln_pre", sourceHandle: "out", target: "attn", targetHandle: "in" },
    { id: "e4", source: "attn", sourceHandle: "out", target: "add_1", targetHandle: "in_b" },
    { id: "e5", source: "add_1", sourceHandle: "out", target: "ln_mid", targetHandle: "in" },
    { id: "e6", source: "ln_mid", sourceHandle: "out", target: "linear_1", targetHandle: "in" },
    { id: "e7", source: "ln_mid", sourceHandle: "out", target: "add_2", targetHandle: "in_a" },
    { id: "e8", source: "linear_1", sourceHandle: "out", target: "relu_1", targetHandle: "in" },
    { id: "e9", source: "relu_1", sourceHandle: "out", target: "linear_2", targetHandle: "in" },
    { id: "e10", source: "linear_2", sourceHandle: "out", target: "add_2", targetHandle: "in_b" },
    { id: "e11", source: "add_2", sourceHandle: "out", target: "ln_post", targetHandle: "in" },
    { id: "e12", source: "ln_post", sourceHandle: "out", target: "output_1", targetHandle: "in" },
  ],
  metadata: {
    name: "Transformer (Vaswani et al.)",
    created_at: new Date().toISOString(),
    description: "Pre-built Transformer with text pipeline: Text Input → Text Embedding → Positional Embedding → one Encoder block (Self-Attention + FFN with residuals). Explore, run, and modify. Shapes: [B, seq] → [B, seq, 128] → encoder.",
  },
};

const LEVELS = [
  { level_number: 1, section: "challenges" as const, name: "Connect input to output", description: LEVEL_1_GRAPH.metadata.description!, task: "Create a feed forward network using the flatten and linear layer", graph_json: LEVEL_1_GRAPH, solution_graph_json: LEVEL_1_SOLUTION },
  { level_number: 2, section: "challenges" as const, name: "Add activation", description: LEVEL_2_GRAPH.metadata.description!, task: "Add a ReLU activation between the Linear layer and the Output (Input → Flatten → Linear → Activation → Output)", graph_json: LEVEL_2_GRAPH, solution_graph_json: LEVEL_2_SOLUTION },
  { level_number: 3, section: "challenges" as const, name: "Simple CNN", description: LEVEL_3_GRAPH.metadata.description!, task: "Build a small CNN: Input → Conv2D (e.g. 32 filters) → Activation → Flatten → Linear → Output", graph_json: LEVEL_3_GRAPH, solution_graph_json: LEVEL_3_SOLUTION },
  { level_number: 4, section: "challenges" as const, name: "Dropout regularization", description: LEVEL_4_GRAPH.metadata.description!, task: "Add Dropout between Linear and Output (Input → Flatten → Linear → Dropout → Output)", graph_json: LEVEL_4_GRAPH, solution_graph_json: LEVEL_4_SOLUTION },
  { level_number: 5, section: "challenges" as const, name: "LayerNorm and Attention", description: LEVEL_5_GRAPH.metadata.description!, task: "Build a path with LayerNorm then Attention (Input → LayerNorm → Attention → Output). Use 3D input or Embedding first.", graph_json: LEVEL_5_GRAPH, solution_graph_json: LEVEL_5_SOLUTION },
  { level_number: 6, section: "challenges" as const, name: "Residual with Add", description: LEVEL_6_GRAPH.metadata.description!, task: "Build one residual step: (1) Input → Flatten → Linear(784, 784) → Add. (2) Flatten → Add (skip path). So Add gets two inputs: from Linear and from Flatten. Connect both input ports of the Add block, then Add → Output. Both wires into Add must be shape [B, 784].", graph_json: LEVEL_6_GRAPH, solution_graph_json: LEVEL_6_SOLUTION },
  {
    level_number: 7,
    section: "papers" as const,
    name: "Attention is All You Need (Vaswani et al.)",
    description: TRANSFORMER_PAPER_GRAPH.metadata.description!,
    task: [
      "Vaswani et al., NeurIPS 2017. The Transformer relies entirely on self-attention without recurrence or convolution.",
      "• Scaled Dot-Product Attention: Attention(Q,K,V) = softmax(QK^T / √d_k)V",
      "• Multi-Head Attention runs h attention heads in parallel (d_model = h × d_k); this model uses 4 heads, d_model=128.",
      "• Each encoder layer has two sublayers: (1) Multi-Head Self-Attention + residual & LayerNorm, (2) Position-wise FFN (two linear layers with ReLU) + residual & LayerNorm.",
      "• Input embeddings are combined with positional encodings (here: learned Positional Embedding); then stacked encoder layers produce the representation.",
    ].join("\n"),
    graph_json: TRANSFORMER_PAPER_GRAPH,
    solution_graph_json: TRANSFORMER_PAPER_GRAPH,
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error(
      "Missing env: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local)"
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey);

  const { data, error } = await supabase
    .from("levels")
    .upsert(LEVELS, { onConflict: "level_number" })
    .select("id, level_number, name");

  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }

  console.log("Levels seeded successfully:", data);
}

main();
