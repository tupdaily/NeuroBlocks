"use client";

// ---------------------------------------------------------------------------
// AttentionHeatmap — multi-head attention weight matrix visualisation
// ---------------------------------------------------------------------------
//
// Renders a [heads, seq_q, seq_k] attention tensor as interactive heatmaps.
//
// Features:
//   • Per-head tab selector + "Average" pseudo-head
//   • Grid overview mode showing all heads at once
//   • Canvas-rendered heatmap (white → deep purple/blue scale)
//   • Row/column token labels (indices or actual tokens)
//   • Hover crosshair with exact attention weight
//   • Animated transitions between training steps
//   • "Explain" button — sends the matrix to the AI copilot for analysis
// ---------------------------------------------------------------------------

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TensorSlice } from "@/hooks/usePeepInside";
import {
  Grid3X3,
  Sparkles,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AttentionHeatmapProps {
  /** The attention tensor — shape [heads, seq_q, seq_k]. */
  tensor: TensorSlice;
  /** Optional token labels for rows (queries). Falls back to indices. */
  queryLabels?: string[];
  /** Optional token labels for columns (keys). Falls back to indices. */
  keyLabels?: string[];
  /** Display width for each individual heatmap. */
  width?: number;
  /** Display height for each individual heatmap. */
  height?: number;
  /** Block accent colour. */
  accentColor?: string;
  label?: string;
}

interface HoverInfo {
  row: number;
  col: number;
  value: number;
  canvasX: number;
  canvasY: number;
}

type ViewMode = "single" | "grid";

// ---------------------------------------------------------------------------
// Colour scale — white (0) to deep blue-purple (1)
// ---------------------------------------------------------------------------

function attentionColor(t: number): string {
  // 0 → white (255,255,255), 1 → deep indigo-purple (55, 48, 163)
  const r = Math.round(255 - t * 200);
  const g = Math.round(255 - t * 207);
  const b = Math.round(255 - t * 92);
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Extract a single head's [seq_q, seq_k] matrix from the flat tensor
// ---------------------------------------------------------------------------

function extractHead(
  data: number[],
  headIdx: number,
  seqQ: number,
  seqK: number,
): number[] {
  const offset = headIdx * seqQ * seqK;
  return data.slice(offset, offset + seqQ * seqK);
}

/** Average across all heads. */
function averageHeads(
  data: number[],
  numHeads: number,
  seqQ: number,
  seqK: number,
): number[] {
  const size = seqQ * seqK;
  const avg = new Array<number>(size).fill(0);
  for (let h = 0; h < numHeads; h++) {
    const offset = h * size;
    for (let i = 0; i < size; i++) {
      avg[i] += (data[offset + i] ?? 0) / numHeads;
    }
  }
  return avg;
}

// ---------------------------------------------------------------------------
// Summary stats for a single head
// ---------------------------------------------------------------------------

interface HeadStats {
  maxAttn: number;
  entropy: number; // average row-wise entropy (higher = more uniform)
  sparsity: number; // % of values < 0.02
}

function headStats(matrix: number[], seqQ: number, seqK: number): HeadStats {
  let maxAttn = 0;
  let totalEntropy = 0;
  let sparse = 0;
  const total = seqQ * seqK;

  for (let q = 0; q < seqQ; q++) {
    let rowEntropy = 0;
    for (let k = 0; k < seqK; k++) {
      const v = matrix[q * seqK + k] ?? 0;
      if (v > maxAttn) maxAttn = v;
      if (v < 0.02) sparse++;
      if (v > 1e-8) rowEntropy -= v * Math.log2(v);
    }
    totalEntropy += rowEntropy;
  }

  return {
    maxAttn,
    entropy: totalEntropy / seqQ,
    sparsity: (sparse / total) * 100,
  };
}

// ---------------------------------------------------------------------------
// Canvas paint
// ---------------------------------------------------------------------------

function paintAttentionCanvas(
  ctx: CanvasRenderingContext2D,
  matrix: number[],
  rows: number,
  cols: number,
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h);
  const cellW = w / cols;
  const cellH = h / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = Math.min(Math.max(matrix[r * cols + c] ?? 0, 0), 1);
      ctx.fillStyle = attentionColor(val);
      ctx.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
    }
  }
}

// ---------------------------------------------------------------------------
// AI Explain feature
// ---------------------------------------------------------------------------

async function explainAttention(
  tensor: TensorSlice,
  numHeads: number,
  seqQ: number,
  seqK: number,
): Promise<string> {
  // Build a compact summary for the AI rather than the full matrix.
  const summaries: string[] = [];
  for (let h = 0; h < numHeads; h++) {
    const mat = extractHead(tensor.data, h, seqQ, seqK);
    const stats = headStats(mat, seqQ, seqK);

    // Detect dominant patterns.
    let diagonal = 0;
    let firstCol = 0;
    let lastCol = 0;
    let local = 0;
    for (let q = 0; q < seqQ; q++) {
      for (let k = 0; k < seqK; k++) {
        const v = mat[q * seqK + k] ?? 0;
        if (q === k) diagonal += v;
        if (k === 0) firstCol += v;
        if (k === seqK - 1) lastCol += v;
        if (Math.abs(q - k) <= 1) local += v;
      }
    }
    const total = seqQ * seqK;
    summaries.push(
      `Head ${h + 1}: maxAttn=${stats.maxAttn.toFixed(3)}, entropy=${stats.entropy.toFixed(2)}, ` +
        `sparsity=${stats.sparsity.toFixed(0)}%, diag=${(diagonal / seqQ).toFixed(2)}, ` +
        `firstColAvg=${(firstCol / seqQ).toFixed(2)}, localAvg=${(local / total).toFixed(3)}`,
    );
  }

  const prompt = [
    "You are analysing attention weight matrices from a multi-head self-attention layer in a neural network being trained interactively.",
    `The layer has ${numHeads} attention heads, ${seqQ} query positions, and ${seqK} key positions.`,
    "Here are per-head statistics:",
    ...summaries,
    "",
    "For EACH head, write one concise sentence explaining what pattern it appears to be learning.",
    'Examples of patterns: "positional/local" (attending to neighbors), "BOS/beginning" (attending to first token),',
    '"identity/self" (diagonal attention), "uniform/exploratory" (high entropy), "sparse/selective" (low entropy).',
    "Then write one summary sentence about the overall attention behaviour.",
    "Be specific about which heads show which patterns. Use plain English suitable for an ML student.",
  ].join("\n");

  try {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
    const resp = await fetch(`${backendUrl}/api/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context: "attention_analysis" }),
    });

    if (!resp.ok) throw new Error(`Backend returned ${resp.status}`);
    const json = (await resp.json()) as { explanation: string };
    return json.explanation;
  } catch {
    // Fallback: generate a local heuristic explanation.
    return generateLocalExplanation(tensor, numHeads, seqQ, seqK);
  }
}

/** Offline fallback when the backend / AI is unavailable. */
function generateLocalExplanation(
  tensor: TensorSlice,
  numHeads: number,
  seqQ: number,
  seqK: number,
): string {
  const lines: string[] = [];

  for (let h = 0; h < numHeads; h++) {
    const mat = extractHead(tensor.data, h, seqQ, seqK);
    const stats = headStats(mat, seqQ, seqK);

    // Heuristic pattern detection.
    let diagonal = 0;
    let firstCol = 0;
    let local = 0;
    for (let q = 0; q < seqQ; q++) {
      for (let k = 0; k < seqK; k++) {
        const v = mat[q * seqK + k] ?? 0;
        if (q === k) diagonal += v;
        if (k === 0) firstCol += v;
        if (Math.abs(q - k) <= 1) local += v;
      }
    }
    const diagAvg = diagonal / seqQ;
    const firstAvg = firstCol / seqQ;
    const localAvg = local / (seqQ * seqK);

    let pattern = "";
    if (diagAvg > 0.5) {
      pattern = "appears to be an identity/self-attention head — each token attends primarily to itself.";
    } else if (firstAvg > 0.4) {
      pattern = "shows a 'beginning of sequence' pattern — most tokens attend back to the first position.";
    } else if (localAvg > 0.15 && stats.entropy < 2.5) {
      pattern = "appears to be learning positional/local relationships — each token attends mostly to its neighbors.";
    } else if (stats.entropy > 3) {
      pattern = "shows a relatively uniform/exploratory attention pattern — it may still be learning what to focus on.";
    } else if (stats.sparsity > 60) {
      pattern = "is highly selective/sparse — it focuses attention on very few key positions.";
    } else {
      pattern = "shows a mixed attention pattern that may combine positional and content-based cues.";
    }

    lines.push(`**Head ${h + 1}**: ${pattern}`);
  }

  lines.push("");
  lines.push(
    `**Overall**: This ${numHeads}-head attention layer shows ` +
      `${numHeads > 2 ? "diverse" : "complementary"} attention strategies across heads, ` +
      `which is typical of a well-functioning multi-head attention mechanism.`,
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Single head heatmap sub-component
// ---------------------------------------------------------------------------

function SingleHeadCanvas({
  matrix,
  seqQ,
  seqK,
  width,
  height,
  queryLabels,
  keyLabels,
  onHover,
  onLeave,
}: {
  matrix: number[];
  seqQ: number;
  seqK: number;
  width: number;
  height: number;
  queryLabels: string[];
  keyLabels: string[];
  onHover: (info: HoverInfo) => void;
  onLeave: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Margin for labels.
  const labelW = seqQ <= 32 ? 24 : 0;
  const labelH = seqK <= 32 ? 16 : 0;
  const heatW = width - labelW;
  const heatH = height - labelH;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = width;
    canvas.height = height;

    // Clear.
    ctx.fillStyle = "#0b0f1a";
    ctx.fillRect(0, 0, width, height);

    // Paint heatmap area — use save/translate to offset by labelW.
    ctx.save();
    ctx.translate(labelW, 0);
    paintAttentionCanvas(ctx, matrix, seqQ, seqK, heatW, heatH);
    ctx.restore();

    // Draw row labels (query indices).
    if (seqQ <= 32) {
      ctx.fillStyle = "#6b7280";
      ctx.font = "7px monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const cellH = heatH / seqQ;
      for (let q = 0; q < seqQ; q++) {
        const lbl = queryLabels[q] ?? `${q}`;
        ctx.fillText(lbl, labelW - 3, q * cellH + cellH / 2);
      }
    }

    // Draw column labels (key indices).
    if (seqK <= 32) {
      ctx.fillStyle = "#6b7280";
      ctx.font = "7px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const cellW = heatW / seqK;
      for (let k = 0; k < seqK; k++) {
        const lbl = keyLabels[k] ?? `${k}`;
        ctx.fillText(lbl, labelW + k * cellW + cellW / 2, heatH + 2);
      }
    }
  }, [matrix, seqQ, seqK, width, height, labelW, labelH, heatW, heatH, queryLabels, keyLabels]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX - labelW;
      const cy = (e.clientY - rect.top) * scaleY;

      if (cx < 0 || cy < 0 || cx > heatW || cy > heatH) {
        onLeave();
        return;
      }

      const cellW = heatW / seqK;
      const cellH = heatH / seqQ;
      const col = Math.min(Math.floor(cx / cellW), seqK - 1);
      const row = Math.min(Math.floor(cy / cellH), seqQ - 1);
      const value = matrix[row * seqK + col] ?? 0;

      onHover({
        row,
        col,
        value,
        canvasX: e.clientX - rect.left,
        canvasY: e.clientY - rect.top,
      });
    },
    [width, height, labelW, heatW, heatH, seqQ, seqK, matrix, onHover, onLeave],
  );

  return (
    <canvas
      ref={canvasRef}
      className="rounded-lg border border-neural-border"
      style={{
        width,
        height,
        imageRendering: seqQ < 32 ? "pixelated" : "auto",
        cursor: "crosshair",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={onLeave}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function AttentionHeatmapComponent({
  tensor,
  queryLabels: queryLabelsProp,
  keyLabels: keyLabelsProp,
  width = 380,
  height = 260,
  accentColor = "#8b5cf6",
  label,
}: AttentionHeatmapProps) {
  const numHeads = tensor.shape[0] ?? 1;
  const seqQ = tensor.shape[1] ?? 1;
  const seqK = tensor.shape.length > 2 ? tensor.shape[2] : seqQ;

  // Defaults to index labels.
  const queryLabels = useMemo(
    () => queryLabelsProp ?? Array.from({ length: seqQ }, (_, i) => `${i}`),
    [queryLabelsProp, seqQ],
  );
  const keyLabels = useMemo(
    () => keyLabelsProp ?? Array.from({ length: seqK }, (_, i) => `${i}`),
    [keyLabelsProp, seqK],
  );

  const [activeHead, setActiveHead] = useState(0); // 0..numHeads-1, or numHeads for "avg"
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);

  // ── Extract the currently viewed matrix ──
  const activeMatrix = useMemo(() => {
    if (activeHead >= numHeads) {
      return averageHeads(tensor.data, numHeads, seqQ, seqK);
    }
    return extractHead(tensor.data, activeHead, seqQ, seqK);
  }, [tensor.data, activeHead, numHeads, seqQ, seqK]);

  // ── Per-head stats ──
  const activeStats = useMemo(
    () => headStats(activeMatrix, seqQ, seqK),
    [activeMatrix, seqQ, seqK],
  );

  // ── Grid matrices (all heads) ──
  const allHeadMatrices = useMemo(
    () =>
      Array.from({ length: numHeads }, (_, h) =>
        extractHead(tensor.data, h, seqQ, seqK),
      ),
    [tensor.data, numHeads, seqQ, seqK],
  );

  // ── Head navigation ──
  const prevHead = useCallback(() => {
    setActiveHead((h) => (h - 1 + numHeads + 1) % (numHeads + 1));
  }, [numHeads]);

  const nextHead = useCallback(() => {
    setActiveHead((h) => (h + 1) % (numHeads + 1));
  }, [numHeads]);

  // ── Explain handler ──
  const handleExplain = useCallback(async () => {
    setExplaining(true);
    setExplanation(null);
    try {
      const result = await explainAttention(tensor, numHeads, seqQ, seqK);
      setExplanation(result);
    } catch {
      setExplanation("Unable to generate explanation at this time.");
    } finally {
      setExplaining(false);
    }
  }, [tensor, numHeads, seqQ, seqK]);

  // ── Grid cell size ──
  const gridCols = numHeads <= 4 ? 2 : numHeads <= 9 ? 3 : 4;
  const gridCellW = Math.floor((width - (gridCols - 1) * 4) / gridCols);
  const gridCellH = Math.floor(gridCellW * (seqQ / seqK));

  return (
    <div className="flex flex-col gap-3">
      {/* ── Label ── */}
      {label && (
        <span className="text-[10px] text-neutral-500 font-mono">{label}</span>
      )}

      {/* ── Top toolbar ── */}
      <div className="flex items-center justify-between gap-2">
        {/* Head selector */}
        <div className="flex items-center gap-1">
          <button
            onClick={prevHead}
            className="p-0.5 rounded text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.05] transition-colors"
          >
            <ChevronLeft size={12} />
          </button>
          <div className="flex gap-0.5">
            {Array.from({ length: numHeads }, (_, h) => (
              <button
                key={h}
                onClick={() => setActiveHead(h)}
                className={`
                  px-1.5 py-0.5 rounded text-[8px] font-mono font-semibold transition-all
                  ${
                    activeHead === h
                      ? "text-white"
                      : "text-neutral-600 hover:text-neutral-400"
                  }
                `}
                style={
                  activeHead === h
                    ? { backgroundColor: `${accentColor}30`, color: accentColor }
                    : undefined
                }
                title={`Head ${h + 1}`}
              >
                H{h + 1}
              </button>
            ))}
            {/* Average pseudo-head */}
            <button
              onClick={() => setActiveHead(numHeads)}
              className={`
                px-1.5 py-0.5 rounded text-[8px] font-mono font-semibold transition-all
                ${
                  activeHead === numHeads
                    ? "text-white"
                    : "text-neutral-600 hover:text-neutral-400"
                }
              `}
              style={
                activeHead === numHeads
                  ? { backgroundColor: `${accentColor}30`, color: accentColor }
                  : undefined
              }
              title="Average across all heads"
            >
              AVG
            </button>
          </div>
          <button
            onClick={nextHead}
            className="p-0.5 rounded text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.05] transition-colors"
          >
            <ChevronRight size={12} />
          </button>
        </div>

        {/* View mode + Explain */}
        <div className="flex items-center gap-1.5">
          {numHeads > 1 && (
            <button
              onClick={() => setViewMode((m) => (m === "single" ? "grid" : "single"))}
              className={`
                flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono
                border transition-colors
                ${
                  viewMode === "grid"
                    ? "text-neutral-200 border-neural-border bg-white/[0.06]"
                    : "text-neutral-500 border-neural-border bg-white/[0.02] hover:text-neutral-300"
                }
              `}
              title={viewMode === "grid" ? "Single head view" : "Grid overview"}
            >
              <Grid3X3 size={10} />
              {viewMode === "grid" ? "single" : "grid"}
            </button>
          )}

          <button
            onClick={handleExplain}
            disabled={explaining}
            className={`
              flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-semibold
              border transition-all
              ${
                explaining
                  ? "text-neutral-500 border-neural-border bg-white/[0.02] cursor-wait"
                  : "text-amber-400 border-amber-500/20 bg-amber-500/[0.06] hover:bg-amber-500/[0.12]"
              }
            `}
            title="Ask AI to explain these attention patterns"
          >
            {explaining ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <Sparkles size={10} />
            )}
            Explain
          </button>
        </div>
      </div>

      {/* ── Single head view ── */}
      {viewMode === "single" && (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeHead}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="relative"
          >
            <SingleHeadCanvas
              matrix={activeMatrix}
              seqQ={seqQ}
              seqK={seqK}
              width={width}
              height={height}
              queryLabels={queryLabels}
              keyLabels={keyLabels}
              onHover={setHover}
              onLeave={() => setHover(null)}
            />

            {/* Hover tooltip */}
            {hover && (
              <div
                className="absolute z-10 pointer-events-none"
                style={{
                  left: hover.canvasX + 14,
                  top: hover.canvasY - 40,
                }}
              >
                <div className="px-2.5 py-1.5 rounded-lg bg-neural-bg/95 border border-neural-border backdrop-blur-md shadow-lg text-[9px] font-mono whitespace-nowrap">
                  <div className="text-neutral-500">
                    Q[{queryLabels[hover.row]}] → K[{keyLabels[hover.col]}]
                  </div>
                  <div className="mt-0.5">
                    <span className="text-neutral-400">attn: </span>
                    <span
                      className="font-semibold"
                      style={{ color: accentColor }}
                    >
                      {hover.value.toFixed(6)}
                    </span>
                    <span className="text-neutral-600 ml-1">
                      ({(hover.value * 100).toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Head title */}
            <div className="mt-2 flex items-center justify-between text-[9px] font-mono">
              <span className="text-neutral-400">
                {activeHead < numHeads
                  ? `Head ${activeHead + 1}`
                  : "Average (all heads)"}
              </span>
              <span className="text-neutral-600">
                {seqQ}×{seqK}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* ── Grid view (all heads) ── */}
      {viewMode === "grid" && (
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}
        >
          {allHeadMatrices.map((mat, h) => (
            <div key={h} className="flex flex-col items-center gap-0.5">
              <button
                onClick={() => {
                  setActiveHead(h);
                  setViewMode("single");
                }}
                className="hover:ring-1 hover:ring-white/20 rounded-md transition-all"
                title={`Click to zoom into Head ${h + 1}`}
              >
                <GridCellCanvas
                  matrix={mat}
                  seqQ={seqQ}
                  seqK={seqK}
                  width={gridCellW}
                  height={gridCellH}
                />
              </button>
              <span className="text-[7px] font-mono text-neutral-600">
                H{h + 1}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Colour scale legend ── */}
      <div className="flex items-center gap-2 px-1">
        <div
          className="flex-1 h-2 rounded-full overflow-hidden"
          style={{
            background: "linear-gradient(to right, #ffffff, #8b5cf6, #3730a3)",
          }}
        />
        <div className="flex justify-between text-[8px] text-neutral-600 font-mono w-16 shrink-0">
          <span>0</span>
          <span>1</span>
        </div>
      </div>

      {/* ── Per-head stats ── */}
      <div className="grid grid-cols-3 gap-1">
        {[
          {
            label: "max attn",
            value: activeStats.maxAttn.toFixed(4),
            color: accentColor,
          },
          {
            label: "entropy",
            value: activeStats.entropy.toFixed(2),
            color: "#f59e0b",
          },
          {
            label: "sparsity",
            value: `${activeStats.sparsity.toFixed(1)}%`,
            color: activeStats.sparsity > 80 ? "#ef4444" : "#10b981",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center p-1.5 rounded-lg bg-white/[0.02] border border-neural-border"
          >
            <span className="text-[7px] uppercase tracking-wider text-neutral-600">
              {s.label}
            </span>
            <span
              className="text-[10px] font-mono font-semibold"
              style={{ color: s.color }}
            >
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* ── AI Explanation panel ── */}
      <AnimatePresence>
        {(explaining || explanation) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.04]">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={11} className="text-amber-400" />
                <span className="text-[10px] font-semibold text-amber-400">
                  AI Explanation
                </span>
                {explaining && (
                  <Loader2
                    size={10}
                    className="animate-spin text-amber-500/50 ml-1"
                  />
                )}
              </div>
              {explaining && !explanation && (
                <p className="text-[10px] text-amber-300/60 italic">
                  Analyzing attention patterns...
                </p>
              )}
              {explanation && (
                <div className="text-[10px] text-neutral-300 leading-relaxed whitespace-pre-wrap space-y-1">
                  {explanation.split("\n").map((line, i) => {
                    if (!line.trim()) return null;
                    const isBold = line.startsWith("**");
                    return (
                      <p key={i} className={isBold ? "font-semibold" : ""}>
                        {line.replace(/\*\*/g, "")}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Axes hint ── */}
      <div className="flex items-center gap-1 text-[8px] text-neutral-600 font-mono px-1">
        <Info size={8} />
        <span>Rows = query positions, Columns = key positions</span>
        {numHeads > 1 && <span>· {numHeads} heads</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lightweight grid cell canvas (no labels, no hover)
// ---------------------------------------------------------------------------

function GridCellCanvas({
  matrix,
  seqQ,
  seqK,
  width,
  height,
}: {
  matrix: number[];
  seqQ: number;
  seqK: number;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = width;
    canvas.height = height;
    paintAttentionCanvas(ctx, matrix, seqQ, seqK, width, height);
  }, [matrix, seqQ, seqK, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded border border-neural-border"
      style={{ width, height, imageRendering: seqQ < 16 ? "pixelated" : "auto" }}
    />
  );
}

export const AttentionHeatmap = memo(AttentionHeatmapComponent);
