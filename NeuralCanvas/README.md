# NeuralCanvas

A visual, block-based neural network builder that lets you design, inspect, and understand deep learning architectures in real time. Built with **Next.js 14**, **React Flow**, **FastAPI**, and a rich set of interactive visualization components.

> Drag blocks. Connect layers. Watch gradients flow. Peer inside attention heads. Understand your network.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Architecture Deep Dive](#architecture-deep-dive)
  - [1. Scaffolding & Configuration](#1-scaffolding--configuration)
  - [2. Block Type System](#2-block-type-system)
  - [3. Tensor Shape Propagation Engine](#3-tensor-shape-propagation-engine)
  - [4. Canvas & Graph Editor](#4-canvas--graph-editor)
  - [5. Block Palette Sidebar](#5-block-palette-sidebar)
  - [6. Block Components (BaseBlock + All Layers)](#6-block-components-baseblock--all-layers)
  - [7. PeepInside Modal — The X-Ray View](#7-peepinside-modal--the-x-ray-view)
  - [8. WeightHeatmap — D3-Powered Weight Visualization](#8-weightheatmap--d3-powered-weight-visualization)
  - [9. ActivationHistogram — Distribution Analysis](#9-activationhistogram--distribution-analysis)
  - [10. GradientFlowViz — Gradient Health System](#10-gradientflowviz--gradient-health-system)
  - [11. AttentionHeatmap — Multi-Head Attention Visualizer](#11-attentionheatmap--multi-head-attention-visualizer)
  - [12. FilterGrid — Convolutional Filter Inspector](#12-filtergrid--convolutional-filter-inspector)
- [All Files Reference](#all-files-reference)
- [Environment Variables](#environment-variables)
- [Branch Info](#branch-info)

---

## Project Overview

NeuralCanvas is a full-stack application for building neural networks visually. Users drag-and-drop layer blocks onto a canvas, connect them into a computation graph, and get instant feedback on tensor shapes, errors, and network health. The "PeepInside" system lets users click any block to see its internal state — weights, activations, gradients, attention patterns, and convolutional filters — rendered as interactive, animated visualizations.

### Key Features

- **Visual block-based network builder** with 12 neural network layer types
- **Real-time tensor shape propagation** — see `[B, 784] -> [B, 128]` on every wire
- **Shape validation** with human-friendly error messages on invalid connections
- **PeepInside modal** — X-ray view into any block's internal state
- **D3-powered weight heatmaps** with zoom, hover, stats, and absolute-value toggle
- **Activation histograms** with KDE curves, dead neuron detection, and saturation warnings
- **Gradient flow visualization** — per-layer bar charts + canvas-wide gradient health glow overlay
- **Multi-head attention heatmaps** with grid view, per-head stats, and AI-powered pattern explanation
- **Convolutional filter grid** with click-to-zoom, pattern detection, and feature map pairing
- **Undo/redo**, keyboard shortcuts, drag-and-drop from palette, minimap, and zoom controls

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| Next.js | 14.2.35 | App Router, SSR framework |
| React | 18.x | UI library |
| TypeScript | 5.x | Type safety |
| React Flow | 11.11.4 | Node-based graph canvas |
| Tailwind CSS | 3.4.1 | Utility-first styling with custom dark theme |
| Framer Motion | 12.34.0 | Animations and transitions |
| D3.js | 7.9.0 | Colour scales (RdBu, Inferno) and data visualization |
| Recharts | 3.7.0 | BarChart, LineChart, ComposedChart for histograms and gradients |
| Lucide React | 0.564.0 | Icon library |
| Socket.IO Client | 4.8.3 | WebSocket connection for live training data |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| FastAPI | 0.115.6 | REST API + WebSocket server |
| Uvicorn | 0.34.0 | ASGI server |
| PyTorch | 2.5.1 | Neural network execution engine |
| TorchVision | 0.20.1 | Dataset and transform utilities |
| Google Generative AI | 0.8.3 | Gemini API for AI explanations |
| Groq | 0.13.0 | Groq API for fast inference |
| Pydantic | 2.10.3 | Data validation |
| WebSockets | 14.1 | Real-time communication |

### Infrastructure

- **Docker Compose** — runs frontend (port 3000) and backend (port 8000) with hot-reload volumes
- **Custom Tailwind Theme** — dark neural network aesthetic with `neural-bg`, `neural-surface`, `neural-border`, `neural-accent` colour tokens

---

## Project Structure

```
NeuralCanvas/
├── .env.example                    # Environment variable template
├── .gitignore                      # Git ignore rules
├── docker-compose.yml              # Docker multi-service configuration
├── README.md                       # This file
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt            # Python dependencies
│   └── app/
│       └── main.py                 # FastAPI app with CORS and health endpoints
│
└── frontend/
    ├── Dockerfile
    ├── package.json                # Node.js dependencies
    ├── tailwind.config.ts          # Custom dark theme configuration
    ├── tsconfig.json               # TypeScript config with @/* path alias
    ├── next.config.mjs             # Next.js configuration
    │
    └── src/
        ├── app/
        │   ├── globals.css         # Global styles and CSS variables
        │   ├── layout.tsx          # Root layout (dark mode, fonts)
        │   └── page.tsx            # Entry point — dynamically imports NeuralCanvas
        │
        ├── lib/
        │   ├── blockRegistry.ts    # Block type definitions and registry
        │   └── shapeEngine.ts      # Tensor shape propagation engine
        │
        ├── hooks/
        │   ├── useUndoRedo.ts      # Undo/redo state history for the canvas
        │   └── usePeepInside.ts    # WebSocket hook for block inspection data
        │
        └── components/
            ├── blocks/
            │   ├── index.ts             # Barrel exports for all block components
            │   ├── BaseBlock.tsx         # Shared block wrapper (header, params, shapes, handles)
            │   ├── InputBlock.tsx        # Input (dataset selector)
            │   ├── LinearBlock.tsx       # Fully-connected layer
            │   ├── Conv2DBlock.tsx       # 2D convolution
            │   ├── LSTMBlock.tsx         # LSTM recurrent layer
            │   ├── AttentionBlock.tsx    # Multi-head self-attention
            │   ├── NormBlock.tsx         # LayerNorm + BatchNorm
            │   ├── ActivationBlock.tsx   # ReLU, GELU, Sigmoid, Tanh, Softmax
            │   ├── DropoutBlock.tsx      # Dropout regularization
            │   ├── FlattenBlock.tsx      # Flatten spatial dimensions
            │   ├── EmbeddingBlock.tsx    # Token embedding
            │   └── SoftmaxBlock.tsx      # Softmax normalization
            │
            ├── canvas/
            │   ├── NeuralCanvas.tsx      # Main canvas component (providers, toolbar, keyboard shortcuts)
            │   ├── BlockPalette.tsx      # Draggable block sidebar with search and categories
            │   ├── ConnectionWire.tsx    # Custom animated edge with shape labels
            │   └── ShapeContext.tsx      # React context for propagated tensor shapes
            │
            └── peep-inside/
                ├── PeepInsideContext.tsx     # Context for modal open/close state
                ├── PeepInsideModal.tsx       # Main modal with tabs and visualization routing
                ├── HeatmapViz.tsx           # Basic canvas heatmap (diverging / sequential)
                ├── WeightHeatmap.tsx         # D3-powered weight matrix visualization
                ├── ActivationHistogram.tsx   # Recharts histogram with KDE and diagnostics
                ├── BarChartViz.tsx           # Simple horizontal bar chart
                ├── GradientFlowContext.tsx   # Global gradient health state
                ├── GradientFlowViz.tsx       # Per-layer gradient visualization
                ├── AttentionHeatmap.tsx      # Multi-head attention visualizer with AI explain
                └── FilterGrid.tsx           # Conv filter grid with zoom and pattern detection
```

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Python 3.11+ (for backend)
- Docker and Docker Compose (optional, for containerized setup)

### Option 1: Run locally (development)

```bash
# Clone and enter the project
cd NeuralCanvas

# --- Frontend ---
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000

# --- Backend (in a separate terminal) ---
cd ../backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# Runs on http://localhost:8000
```

### Option 2: Docker Compose

```bash
cd NeuralCanvas
cp .env.example .env
# Fill in API keys in .env

docker-compose up --build
# Frontend: http://localhost:3000
# Backend:  http://localhost:8000
```

### Verify everything works

1. Open **http://localhost:3000** — you should see the NeuralCanvas with a demo graph
2. The demo graph has: Input → Flatten → Linear → ReLU → Linear
3. Drag blocks from the left palette onto the canvas
4. Connect blocks by dragging from output handles (right) to input handles (left)
5. Hover over connections to see tensor shape labels
6. Click the **eye icon** on any block to open the PeepInside modal
7. Click **"Show Gradient Flow"** in the top-right to see the canvas light up

---

## Architecture Deep Dive

### 1. Scaffolding & Configuration

**What was done:**
- Created the full project scaffolding with a Next.js 14 frontend (App Router, TypeScript, Tailwind CSS) and a FastAPI backend (Python 3.11)
- Configured a custom **dark theme** in `tailwind.config.ts` with `neural-*` colour tokens: `bg` (#0b0f1a), `surface` (#111827), `border` (#1f2937), `accent` (#8b5cf6)
- Set up `@/*` path aliases in `tsconfig.json` mapping to `./src/*`
- Created `docker-compose.yml` with hot-reload volumes for both services
- Set up CORS on the FastAPI backend for `localhost:3000`
- Created `.env.example` with placeholders for `GEMINI_API_KEY`, `GROQ_API_KEY`, `BACKEND_URL`

**Key files:** `docker-compose.yml`, `.env.example`, `tailwind.config.ts`, `next.config.mjs`, `backend/app/main.py`

---

### 2. Block Type System

**File:** `frontend/src/lib/blockRegistry.ts`

Defines the complete type system for all neural network blocks. Each block definition includes:

- `id`, `type`, `label`, `icon` (Lucide icon name)
- `category`: `"layer"` | `"normalization"` | `"activation"` | `"utility"` | `"input"`
- `defaultParams`: default parameter values
- `paramSchema`: array of parameter definitions with types (`int`, `float`, `select`), ranges, and options
- `inputPorts` / `outputPorts`: connection port definitions with optional expected dimensions
- `color`: category-based hex colour
- `description`: one-line plain-English description

**12 Block Types:**

| Block | Category | Key Parameters |
|---|---|---|
| Input | input | dataset (MNIST / CIFAR / TinyShakespeare) |
| Linear | layer | in_features, out_features |
| Conv2D | layer | in_channels, out_channels, kernel_size, stride, padding |
| LSTM | layer | input_size, hidden_size, num_layers |
| Attention | layer | embed_dim, num_heads |
| LayerNorm | normalization | normalized_shape |
| BatchNorm | normalization | num_features |
| Activation | activation | type (relu / gelu / sigmoid / tanh / softmax) |
| Dropout | utility | p (float 0-1) |
| Flatten | utility | (none) |
| Embedding | layer | num_embeddings, embedding_dim |
| Softmax | activation | dim |

**Exports:** `BLOCK_REGISTRY` (map), `getBlockDefaults()`, `getAllBlockDefinitions()`, `getBlocksByCategory()`

---

### 3. Tensor Shape Propagation Engine

**File:** `frontend/src/lib/shapeEngine.ts`

The critical engine that computes output tensor shapes through the entire graph in real time.

**`propagateShapes(nodes, edges)`** — returns `Map<nodeId, { inputShape, outputShape, error? }>`

Uses **topological sort** (Kahn's algorithm) to process nodes in dependency order. Handles cycles (marks as error) and disconnected nodes (shows `?` shape).

**Shape rules per block type:**
- **Input(MNIST):** → `[batch, 1, 28, 28]`
- **Input(CIFAR):** → `[batch, 3, 32, 32]`
- **Input(TinyShakespeare):** → `[batch, seq_len]`
- **Linear(in, out):** `[batch, ..., in]` → `[batch, ..., out]` (validates last dim)
- **Conv2D:** `[batch, C_in, H, W]` → `[batch, C_out, H', W']` using floor formula
- **Flatten:** `[batch, ...rest]` → `[batch, product(rest)]`
- **LSTM:** `[batch, seq, input]` → `[batch, seq, hidden]`
- **Attention:** `[batch, seq, embed]` → `[batch, seq, embed]` (validates embed % num_heads)
- **Embedding:** `[batch, seq_len]` → `[batch, seq_len, embed_dim]`
- **LayerNorm/BatchNorm/Activation/Dropout/Softmax:** shape passthrough with validation

**`validateConnection(source, target, sourceShape)`** — returns human-friendly errors like:
> "Conv2D expects 4D input [batch, channels, height, width] but got 2D [batch, 784]. Try adding a Reshape block."

**`getShapeLabel(shape)`** — formats shapes as `[B, 256]` or `[B, 3, 32, 32]`

---

### 4. Canvas & Graph Editor

**File:** `frontend/src/components/canvas/NeuralCanvas.tsx`

The main orchestrator component. Wraps everything in a provider stack:

```
ReactFlowProvider → ShapeProvider → PeepInsideProvider → GradientFlowProvider
```

**Features:**
- **React Flow v11** canvas with dark dot-grid background
- **Custom node types** registered for all 12 block types
- **Custom edge type** (`ConnectionWire`) with animated flowing dots and shape labels
- **Drag-and-drop** from the BlockPalette — converts screen coords to flow coords
- **Shape propagation** runs on every node/edge change via `useEffect`
- **Connection validation** — validates tensor shapes on connect, marks invalid edges
- **Undo/redo** (Ctrl+Z / Ctrl+Shift+Z) with state history stack
- **Keyboard shortcuts:** Delete/Backspace (remove), Ctrl+D (duplicate), Space (pan mode)
- **Minimap** (bottom-right) with block-colour coding
- **Zoom controls** (0.15x to 2.5x)
- **"Show Gradient Flow" toggle** (top-right) — lights up the entire canvas with gradient health glow
- **Keyboard hint bar** (bottom-centre)

**File:** `frontend/src/components/canvas/ConnectionWire.tsx`

Custom React Flow edge component:
- Animated bezier curve with dashed lines and flowing dots (SVG markers)
- Three-state colour: green (valid), red (error), grey (unknown)
- Midpoint pill badge showing tensor shape (e.g., `[B, 784]`) or error icon
- Rich hover tooltip with shape description, error details, and route info
- CSS keyframe animations (`connectionFlowDash`, `connectionDotFlow`)

**File:** `frontend/src/components/canvas/ShapeContext.tsx`

React Context that stores the `Map<nodeId, ShapeResult>` and provides a `recompute(nodes, edges)` function. All blocks and edges read their shapes from this context.

---

### 5. Block Palette Sidebar

**File:** `frontend/src/components/canvas/BlockPalette.tsx`

Collapsible left sidebar for adding blocks to the canvas:
- **5 categories** with coloured accent bars: Input, Layers, Activations, Normalization, Utility
- **Collapsible sections** per category
- **Search bar** that filters blocks by name or description
- **Drag-and-drop** — each block item has `onDragStart` that sets `DRAG_BLOCK_TYPE`
- **Hover tooltips** with description and default parameters
- **Frosted glass** design (backdrop-blur on dark background)
- Toggle button to collapse/expand (64px expanded, 48px collapsed)

---

### 6. Block Components (BaseBlock + All Layers)

**File:** `frontend/src/components/blocks/BaseBlock.tsx`

The shared visual wrapper every block renders through:

```
┌─────────────────────────────────────┐
│ ● Icon  Block Name       type  eye  │  ← gradient header bar
├─────────────────────────────────────┤
│  param₁: [__256__]  ▲▼             │  ← inline-editable params
│  param₂: [__128__]  ▲▼             │
├─────────────────────────────────────┤
│  → [B, 256]  →  [B, 128]          │  ← shape bar (or error)
└─────────────────────────────────────┘
◉ input handle (left)     output handle (right) ◉
```

**Visual design:**
- Rounded rectangle with gradient background based on category colour
- Inline editable parameters (number inputs with up/down steppers, select dropdowns)
- Shape bar showing input → output shapes, or red error message with tooltip
- Glowing handle dots on left (input) and right (output)
- Selection glow (ring + scale) and error state (red ring)
- **Gradient flow overlay** — when enabled, blocks get coloured glow borders (green/red/blue) based on gradient health
- **PeepInside eye button** — hidden by default, appears on hover, opens the inspection modal

**Specific block components** (all extend BaseBlock):
- `InputBlock` — dataset dropdown + output shape display
- `LinearBlock`, `Conv2DBlock`, `LSTMBlock` — standard param display
- `AttentionBlock` — adds head_dim calculation hint
- `ActivationBlock` — adds `f(x)` function hint
- `NormBlock` — exports both `LayerNormBlock` and `BatchNormBlock`
- `DropoutBlock` — shows keep-percentage bar
- `FlattenBlock` — shows flatten formula hint
- `EmbeddingBlock` — shows parameter count
- `SoftmaxBlock` — shows softmax formula hint

---

### 7. PeepInside Modal — The X-Ray View

**File:** `frontend/src/components/peep-inside/PeepInsideModal.tsx`

The core inspection system. Clicking the eye icon on any block opens this modal.

**Animation:** Expands from the block's position using Framer Motion spring animation. Positioned near the source block (not a centred modal — feels like the block is "opening up").

**Layout:**
- **Title bar** — block icon, name, category, shape info, live indicator, step badge, refresh/close buttons
- **Tab bar** — dynamically generated per block type
- **Content area** — renders the appropriate visualization component
- **Footer** — block ID and timestamp

**Tabs and their visualization components:**

| Tab | Component | Available For |
|---|---|---|
| Weights | `WeightHeatmap` | All trainable blocks |
| Activations | `ActivationHistogram` + `HeatmapViz` | All blocks |
| Gradients | `GradientFlowViz` | All trainable blocks |
| Attention Map | `AttentionHeatmap` | Attention blocks only |
| Filters | `FilterGrid` | Conv2D blocks only |

**Data flow:** `usePeepInside(blockId, blockType)` hook manages WebSocket connection to the backend. Falls back to realistic demo data when the backend is unavailable.

**File:** `frontend/src/hooks/usePeepInside.ts`

WebSocket-backed hook that:
- Sends `subscribe` message on open
- Receives `PeepData` payloads with weights, activations, gradients, attention maps, and filters
- Tracks loading, trained, live, and error states
- Falls back to `generateDemoData()` if WebSocket fails (generates realistic random data)

**Types:** `TensorSlice` (flat data + shape), `PeepData` (full block state snapshot)

---

### 8. WeightHeatmap — D3-Powered Weight Visualization

**File:** `frontend/src/components/peep-inside/WeightHeatmap.tsx`

Full-featured weight matrix visualizer replacing the basic `HeatmapViz` in the Weights tab.

**D3 colour scales:**
- Raw weights: `d3.interpolateRdBu` (reversed) — blue = negative, white = zero, red = positive
- Absolute values: `d3.interpolateInferno` — black to yellow

**Three-tier size handling:**
- **Small** (<64x64): full resolution, pixelated rendering
- **Medium** (64-512): bilinear interpolation downsampled to ~128x128
- **Large** (>512): thumbnail at 128px + click-to-zoom on sub-regions

**Interactive features:**
- **Hover crosshair** — tooltip showing `[row, col]` and value (6 decimal places), colour-coded by sign
- **Raw / |w| toggle** — switches data and colour scheme
- **Click-to-zoom** — for large matrices, click to drill into a 128x128 crop; click again to reset
- **Zoom indicator** overlay showing current row/col range
- **Colour scale legend** — gradient bar with min/max labels

**Summary stats:** min, max, mean, std, sparsity (% near zero) — 5 colour-coded stat cards

---

### 9. ActivationHistogram — Distribution Analysis

**File:** `frontend/src/components/peep-inside/ActivationHistogram.tsx`

Rich activation distribution histogram with diagnostic intelligence.

**Recharts ComposedChart:**
- **50-bin histogram** with per-bar gradient fills (cool blue → warm red based on position)
- **KDE overlay** — Gaussian Kernel Density Estimation using Silverman's bandwidth rule, rendered as a smooth `Line` with blue-purple-red gradient
- **Danger zone highlighting** — `Area` overlay for bounded activations

**Activation-type-specific diagnostics:**
- **ReLU:** bins near zero highlighted in red when spike detected (dead neurons)
- **Sigmoid:** saturation zones at <0.05 and >0.95 highlighted
- **Tanh:** saturation zones at <-0.9 and >0.9 highlighted

**Summary stats:** mean, std, min, max, and a context-sensitive 5th card (dead% or saturated%)

**Plain-English insight engine:**
- Critical: "34% of neurons are dead. Consider using LeakyReLU or adding BatchNorm."
- Warning: "Extremely low variance — activations have collapsed."
- OK: "Activation distribution looks healthy."

---

### 10. GradientFlowViz — Gradient Health System

**Two-part system:** per-layer visualization + canvas-wide overlay

#### Per-Layer View (inside PeepInsideModal)

**File:** `frontend/src/components/peep-inside/GradientFlowViz.tsx`

- **Colour-coded horizontal bar chart** — Recharts `BarChart` (vertical layout) with log-scale X-axis
  - Green: healthy (1e-3 to 1), Yellow: warning, Red: vanishing (<1e-5), Blue: exploding (>10)
  - Green reference area highlighting the "healthy zone"
- **Mini sparkline** — gradient norm over training steps with log Y-axis, vanishing/exploding thresholds as dashed reference lines
- **Overall health badge** — pulsing coloured dot with status text
- **Summary stats:** norm, param count, min, max
- **Plain-English insights:** "X parameter groups have vanishing gradients — this block is 'starving'"

#### Global Canvas Overlay (the WOW feature)

**File:** `frontend/src/components/peep-inside/GradientFlowContext.tsx`

React Context (`GradientFlowProvider`) that stores per-block `GradientInfo` and an `enabled` toggle.

When enabled, every block on the canvas gets a **dynamic glow border** based on its gradient health:
- **Green glow** = healthy gradients flowing through
- **Red glow** = vanishing gradients (block is "starving")
- **Blue glow** = exploding gradients
- Glow radius scales with gradient magnitude

**Toggle button** ("Show Gradient Flow") in the top-right corner of the canvas. Auto-seeds demo data on first toggle so the effect is immediately visible.

---

### 11. AttentionHeatmap — Multi-Head Attention Visualizer

**File:** `frontend/src/components/peep-inside/AttentionHeatmap.tsx`

Full replacement for the basic `HeatmapViz` in the Attention Map tab.

**Multi-head navigation:**
- Per-head tab buttons (`H1`, `H2`, ...) with accent colour highlight
- **"AVG" pseudo-head** — computes average attention across all heads
- Arrow navigation with wrapping
- Framer Motion fade transitions between heads

**Grid overview mode:**
- Toggle between single (one large heatmap) and grid (all heads as thumbnails)
- Click any grid cell to zoom into that head

**Canvas rendering:**
- Colour scale: white (0) → deep indigo-purple (1)
- Row/column labels for sequences ≤32 tokens
- Supports actual token strings via optional props

**Hover crosshair:** tooltip showing `Q[row] → K[col]`, exact weight (6 decimal places), and percentage

**Per-head stats:** max attention, entropy, sparsity

**"Explain" AI button (demo-killer feature):**
- Sends compact per-head summaries (entropy, sparsity, diagonal/local/BOS concentration) to the backend's `/api/explain` endpoint
- AI generates plain-English analysis like:
  > "Head 1 appears to be learning positional relationships — each token attends mostly to its neighbors.
  > Head 3 shows a 'beginning of sequence' pattern — most tokens attend back to the first token."
- **Robust local fallback** — when backend is unavailable, runs heuristic pattern detection (identity, BOS, local, uniform, sparse) and generates similar output

---

### 12. FilterGrid — Convolutional Filter Inspector

**File:** `frontend/src/components/peep-inside/FilterGrid.tsx`

Full replacement for the original basic filter grid.

**Grid rendering:**
- Canvas-based, 8 filters per row, scrollable past 64 filters
- **First-layer mode** (`isFirstLayer`): larger cells since filters are interpretable edge/texture detectors
- Diverging blue-white-red colour scale for signed weights

**Hover interaction:** tooltip with filter index, kernel size, pattern type, weight range, and "click to zoom" hint

**Click-to-zoom preview (Framer Motion animated panel):**
- Enlarged kernel rendered at 12+ pixels per cell
- **Feature map** alongside (if activations are available) — shows what this filter "sees"
- Per-filter stats: min, max, std
- Pattern classification label

**Pattern detection heuristics:**
- Analyses gradient energy (horizontal vs vertical) for **edge orientation**
- Centre vs surround comparison for **blob detectors**
- Uniformity check for untrained/random filters
- Pattern distribution aggregated below the grid (e.g., "vertical edge x12, blob x5, mixed x15")

**Summary stats:** filter count, kernel size, avg absolute max, avg std

---

## All Files Reference

| File | Lines | Description |
|---|---|---|
| `docker-compose.yml` | ~25 | Multi-service Docker configuration |
| `.env.example` | 3 | Environment variable template |
| `backend/app/main.py` | ~30 | FastAPI with CORS, health check |
| `backend/requirements.txt` | 9 | Python dependencies |
| `frontend/tailwind.config.ts` | ~65 | Custom dark theme colours and animations |
| `frontend/src/lib/blockRegistry.ts` | ~350 | Block type definitions and registry |
| `frontend/src/lib/shapeEngine.ts` | ~350 | Tensor shape propagation engine |
| `frontend/src/hooks/useUndoRedo.ts` | ~60 | Undo/redo state history |
| `frontend/src/hooks/usePeepInside.ts` | ~220 | WebSocket hook + demo data |
| `frontend/src/components/canvas/NeuralCanvas.tsx` | ~490 | Main canvas with providers and toolbar |
| `frontend/src/components/canvas/BlockPalette.tsx` | ~280 | Draggable block sidebar |
| `frontend/src/components/canvas/ConnectionWire.tsx` | ~250 | Animated edge with shape labels |
| `frontend/src/components/canvas/ShapeContext.tsx` | ~50 | Shape propagation context |
| `frontend/src/components/blocks/BaseBlock.tsx` | ~495 | Shared block wrapper |
| `frontend/src/components/blocks/*.tsx` | ~30 each | 12 specific block components |
| `frontend/src/components/peep-inside/PeepInsideContext.tsx` | ~55 | Modal state context |
| `frontend/src/components/peep-inside/PeepInsideModal.tsx` | ~475 | Main modal with tabbed routing |
| `frontend/src/components/peep-inside/HeatmapViz.tsx` | ~115 | Basic canvas heatmap |
| `frontend/src/components/peep-inside/WeightHeatmap.tsx` | ~490 | D3-powered weight visualizer |
| `frontend/src/components/peep-inside/ActivationHistogram.tsx` | ~540 | Recharts histogram + KDE + diagnostics |
| `frontend/src/components/peep-inside/BarChartViz.tsx` | ~65 | Simple horizontal bar chart |
| `frontend/src/components/peep-inside/GradientFlowContext.tsx` | ~170 | Global gradient health state |
| `frontend/src/components/peep-inside/GradientFlowViz.tsx` | ~540 | Per-layer gradient visualization |
| `frontend/src/components/peep-inside/AttentionHeatmap.tsx` | ~660 | Multi-head attention + AI explain |
| `frontend/src/components/peep-inside/FilterGrid.tsx` | ~670 | Conv filter grid + zoom + patterns |

---

## Environment Variables

```bash
# .env (copy from .env.example)
GEMINI_API_KEY=            # Google Gemini API key (for AI explanations)
GROQ_API_KEY=              # Groq API key (for fast AI inference)
BACKEND_URL=http://localhost:8000  # Backend API URL
```

The frontend reads `NEXT_PUBLIC_BACKEND_URL` (defaults to `http://localhost:8000`) for API calls.

---

## Branch Info

All development work has been done on the **`codeit`** branch.

```bash
git checkout codeit
```

The initial commit was "base ui changes", followed by incremental additions of the PeepInside modal and each visualization component.
