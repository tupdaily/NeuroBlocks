"use client";

// ---------------------------------------------------------------------------
// FilterGrid — convolutional filter kernel & feature map visualisation
// ---------------------------------------------------------------------------
//
// Renders each filter kernel in a conv layer as a small interactive heatmap.
//
// Features:
//   • Responsive grid (8 per row, scrollable past 64)
//   • First-layer filters rendered larger (they're interpretable edge detectors)
//   • Deeper-layer filters shown alongside feature map activations
//   • Hover: filter index + summary stats + zoom preview
//   • Per-filter colour: diverging (blue-white-red) for signed weights
//   • Smooth animated transitions during training
//   • Summary stats row + pattern classification hints
// ---------------------------------------------------------------------------

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { TensorSlice } from "@/neuralcanvas/hooks/usePeepInside";
import { Info, ZoomIn, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterGridProps {
  /** Filter tensor — shape [num_filters, H, W]. */
  tensor: TensorSlice;
  /** Optional feature map activations — shape [num_filters, outH, outW]. */
  featureMaps?: TensorSlice | null;
  /** Whether this is the first conv layer (affects sizing). */
  isFirstLayer?: boolean;
  /** Accent colour for UI chrome. */
  accentColor?: string;
  label?: string;
}

interface HoverInfo {
  filterIdx: number;
  /** Screen-relative position for the tooltip. */
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Colour: diverging blue-white-red (for signed filter weights)
// ---------------------------------------------------------------------------

function filterColor(t: number): string {
  // t ∈ [0, 1] where 0.5 ≈ zero
  if (t >= 0.5) {
    const s = (t - 0.5) * 2; // 0→1
    const r = Math.round(255);
    const g = Math.round(255 * (1 - s));
    const b = Math.round(255 * (1 - s));
    return `rgb(${r},${g},${b})`;
  }
  const s = (0.5 - t) * 2; // 0→1
  const r = Math.round(255 * (1 - s));
  const g = Math.round(255 * (1 - s));
  const b = Math.round(255);
  return `rgb(${r},${g},${b})`;
}

/** Grayscale-to-accent colour for feature maps (activations). */
function featureMapColor(t: number, accent: string): string {
  const hex = accent.replace("#", "");
  const ar = parseInt(hex.slice(0, 2), 16);
  const ag = parseInt(hex.slice(2, 4), 16);
  const ab = parseInt(hex.slice(4, 6), 16);
  return `rgb(${Math.round(ar * t)},${Math.round(ag * t)},${Math.round(ab * t)})`;
}

// ---------------------------------------------------------------------------
// Per-filter statistics
// ---------------------------------------------------------------------------

interface FilterStats {
  min: number;
  max: number;
  mean: number;
  std: number;
  absMax: number;
  /** Simple pattern guess based on weight distribution. */
  pattern: string;
}

function computeFilterStats(data: number[]): FilterStats {
  const n = data.length;
  if (n === 0) return { min: 0, max: 0, mean: 0, std: 0, absMax: 0, pattern: "—" };

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const mean = sum / n;
  let sqSum = 0;
  for (const v of data) sqSum += (v - mean) ** 2;
  const std = Math.sqrt(sqSum / n);
  const absMax = Math.max(Math.abs(min), Math.abs(max));

  // Simple pattern heuristic for small kernels.
  const pattern = guessPattern(data, Math.round(Math.sqrt(n)), Math.round(Math.sqrt(n)));

  return { min, max, mean, std, absMax, pattern };
}

function guessPattern(data: number[], h: number, w: number): string {
  if (h < 2 || w < 2) return "point";

  // Compute horizontal, vertical, and diagonal energy.
  let hEnergy = 0;
  let vEnergy = 0;

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w - 1; c++) {
      hEnergy += Math.abs((data[r * w + c + 1] ?? 0) - (data[r * w + c] ?? 0));
    }
  }
  for (let r = 0; r < h - 1; r++) {
    for (let c = 0; c < w; c++) {
      vEnergy += Math.abs((data[(r + 1) * w + c] ?? 0) - (data[r * w + c] ?? 0));
    }
  }

  const totalEnergy = hEnergy + vEnergy;
  if (totalEnergy < 0.01) return "uniform";

  const hRatio = hEnergy / totalEnergy;
  if (hRatio > 0.7) return "vertical edge";
  if (hRatio < 0.3) return "horizontal edge";

  // Check for centre-surround (blob detector).
  const centerVal = data[Math.floor(h / 2) * w + Math.floor(w / 2)] ?? 0;
  const edgeVals: number[] = [];
  for (let c = 0; c < w; c++) {
    edgeVals.push(data[c] ?? 0);
    edgeVals.push(data[(h - 1) * w + c] ?? 0);
  }
  for (let r = 1; r < h - 1; r++) {
    edgeVals.push(data[r * w] ?? 0);
    edgeVals.push(data[r * w + w - 1] ?? 0);
  }
  const edgeMean = edgeVals.reduce((a, b) => a + b, 0) / edgeVals.length;
  if (Math.abs(centerVal - edgeMean) > 0.3) return "blob/centre-surround";

  return "mixed/diagonal";
}

// ---------------------------------------------------------------------------
// Global summary across all filters
// ---------------------------------------------------------------------------

interface GridSummary {
  numFilters: number;
  kernelSize: string;
  avgAbsMax: number;
  avgStd: number;
  patterns: Map<string, number>;
}

function computeGridSummary(
  allStats: FilterStats[],
  fH: number,
  fW: number,
): GridSummary {
  const n = allStats.length;
  const patterns = new Map<string, number>();
  let sumAbsMax = 0;
  let sumStd = 0;

  for (const s of allStats) {
    sumAbsMax += s.absMax;
    sumStd += s.std;
    patterns.set(s.pattern, (patterns.get(s.pattern) ?? 0) + 1);
  }

  return {
    numFilters: n,
    kernelSize: `${fH}×${fW}`,
    avgAbsMax: n > 0 ? sumAbsMax / n : 0,
    avgStd: n > 0 ? sumStd / n : 0,
    patterns,
  };
}

// ---------------------------------------------------------------------------
// Paint a single filter kernel onto a canvas context
// ---------------------------------------------------------------------------

function paintFilter(
  ctx: CanvasRenderingContext2D,
  data: number[],
  w: number,
  h: number,
  px: number,
  py: number,
  cellSize: number,
  mode: "diverging" | "feature",
  accent: string,
) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const val = data[r * w + c] ?? 0;
      const t = (val - min) / range;
      ctx.fillStyle =
        mode === "diverging" ? filterColor(t) : featureMapColor(t, accent);
      ctx.fillRect(
        px + c * cellSize,
        py + r * cellSize,
        cellSize + 0.5,
        cellSize + 0.5,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Zoom preview component (enlarged single filter)
// ---------------------------------------------------------------------------

function ZoomPreview({
  data,
  fW,
  fH,
  stats,
  filterIdx,
  accentColor,
  featureMapData,
  fmW,
  fmH,
  onClose,
}: {
  data: number[];
  fW: number;
  fH: number;
  stats: FilterStats;
  filterIdx: number;
  accentColor: string;
  featureMapData?: number[] | null;
  fmW?: number;
  fmH?: number;
  onClose: () => void;
}) {
  const kernelRef = useRef<HTMLCanvasElement>(null);
  const fmRef = useRef<HTMLCanvasElement>(null);
  const cellSize = Math.max(12, Math.floor(120 / Math.max(fW, fH)));
  const kWidth = fW * cellSize;
  const kHeight = fH * cellSize;

  useEffect(() => {
    const canvas = kernelRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = kWidth;
    canvas.height = kHeight;
    paintFilter(ctx, data, fW, fH, 0, 0, cellSize, "diverging", accentColor);
  }, [data, fW, fH, cellSize, kWidth, kHeight, accentColor]);

  // Feature map canvas.
  useEffect(() => {
    if (!featureMapData || !fmW || !fmH) return;
    const canvas = fmRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fmCell = Math.max(4, Math.floor(120 / Math.max(fmW, fmH)));
    canvas.width = fmW * fmCell;
    canvas.height = fmH * fmCell;
    paintFilter(ctx, featureMapData, fmW, fmH, 0, 0, fmCell, "feature", accentColor);
  }, [featureMapData, fmW, fmH, accentColor]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="p-3 rounded-xl bg-neural-bg/95 border border-neural-border backdrop-blur-lg shadow-2xl"
      style={{ minWidth: 200 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono font-semibold" style={{ color: accentColor }}>
          Filter #{filterIdx}
        </span>
        <button
          onClick={onClose}
          className="p-0.5 rounded text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {/* Kernel */}
      <div className="flex gap-3 items-start">
        <div className="flex flex-col items-center gap-1">
          <canvas
            ref={kernelRef}
            className="rounded border border-neural-border"
            style={{ width: kWidth, height: kHeight, imageRendering: "pixelated" }}
          />
          <span className="text-[7px] font-mono text-neutral-600">
            kernel ({fH}×{fW})
          </span>
        </div>

        {/* Feature map (if available) */}
        {featureMapData && fmW && fmH && (
          <div className="flex flex-col items-center gap-1">
            <canvas
              ref={fmRef}
              className="rounded border border-neural-border"
              style={{
                width: fmW * Math.max(4, Math.floor(120 / Math.max(fmW, fmH))),
                height: fmH * Math.max(4, Math.floor(120 / Math.max(fmW, fmH))),
                imageRendering: fmW < 32 ? "pixelated" : "auto",
              }}
            />
            <span className="text-[7px] font-mono text-neutral-600">
              feature map ({fmH}×{fmW})
            </span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-1 mt-2">
        {[
          { label: "min", value: stats.min.toFixed(4), color: "#3b82f6" },
          { label: "max", value: stats.max.toFixed(4), color: "#ef4444" },
          { label: "std", value: stats.std.toFixed(4), color: "#f59e0b" },
        ].map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center py-1 rounded bg-white/[0.02] border border-neural-border"
          >
            <span className="text-[6px] uppercase tracking-wider text-neutral-600">{s.label}</span>
            <span className="text-[9px] font-mono font-semibold" style={{ color: s.color }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Pattern */}
      <div className="mt-1.5 text-[8px] font-mono text-neutral-500 text-center">
        pattern: <span style={{ color: accentColor }}>{stats.pattern}</span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function FilterGridComponent({
  tensor,
  featureMaps,
  isFirstLayer = false,
  accentColor = "#6366f1",
  label,
}: FilterGridProps) {
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [zoomedFilter, setZoomedFilter] = useState<number | null>(null);

  // ── Dimensions ──
  const numFilters = tensor.shape[0] ?? 1;
  const fH = tensor.shape[1] ?? 1;
  const fW = tensor.shape.length > 2 ? tensor.shape[2] : fH;
  const filterSize = fH * fW;

  // Feature map dimensions (if provided).
  const fmNumFilters = featureMaps?.shape[0] ?? 0;
  const fmH = featureMaps?.shape[1] ?? 0;
  const fmW = featureMaps ? (featureMaps.shape.length > 2 ? featureMaps.shape[2] : fmH) : 0;
  const fmSize = fmH * fmW;

  // ── Cell sizes ──
  // First layer filters are displayed larger since they're interpretable.
  const COLS = 8;
  const cellSize = isFirstLayer ? Math.max(14, Math.floor(40 / Math.max(fH, fW))) : Math.max(6, Math.floor(24 / Math.max(fH, fW)));
  const gap = isFirstLayer ? 6 : 3;
  const filterPxW = fW * cellSize;
  const filterPxH = fH * cellSize;

  const cols = Math.min(numFilters, COLS);
  const rows = Math.ceil(numFilters / cols);
  const totalW = cols * (filterPxW + gap) - gap;
  const totalH = rows * (filterPxH + gap) - gap;

  // ── Per-filter stats ──
  const allFilterData = useMemo(() => {
    const slices: number[][] = [];
    for (let f = 0; f < numFilters; f++) {
      slices.push(tensor.data.slice(f * filterSize, (f + 1) * filterSize));
    }
    return slices;
  }, [tensor.data, numFilters, filterSize]);

  const allStats = useMemo(
    () => allFilterData.map(computeFilterStats),
    [allFilterData],
  );

  const summary = useMemo(
    () => computeGridSummary(allStats, fH, fW),
    [allStats, fH, fW],
  );

  // ── Paint the grid ──
  useEffect(() => {
    const canvas = gridCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = totalW;
    canvas.height = totalH;

    // Dark background.
    ctx.fillStyle = "#0b0f1a";
    ctx.fillRect(0, 0, totalW, totalH);

    for (let f = 0; f < numFilters; f++) {
      const col = f % cols;
      const row = Math.floor(f / cols);
      const ox = col * (filterPxW + gap);
      const oy = row * (filterPxH + gap);
      paintFilter(ctx, allFilterData[f], fW, fH, ox, oy, cellSize, "diverging", accentColor);
    }
  }, [allFilterData, numFilters, fH, fW, cols, totalW, totalH, filterPxW, filterPxH, cellSize, gap, accentColor]);

  // ── Hover detection ──
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = gridCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = totalW / rect.width;
      const scaleY = totalH / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;

      const blockW = filterPxW + gap;
      const blockH = filterPxH + gap;
      const col = Math.floor(cx / blockW);
      const row = Math.floor(cy / blockH);

      // Check we're inside a filter cell (not in the gap).
      const localX = cx - col * blockW;
      const localY = cy - row * blockH;
      if (localX > filterPxW || localY > filterPxH || col >= cols) {
        setHover(null);
        return;
      }

      const idx = row * cols + col;
      if (idx >= numFilters) {
        setHover(null);
        return;
      }

      setHover({ filterIdx: idx, x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [totalW, totalH, filterPxW, filterPxH, gap, cols, numFilters],
  );

  // ── Click to zoom ──
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = gridCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = totalW / rect.width;
      const scaleY = totalH / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;

      const blockW = filterPxW + gap;
      const blockH = filterPxH + gap;
      const col = Math.floor(cx / blockW);
      const row = Math.floor(cy / blockH);
      const idx = row * cols + col;
      if (idx < numFilters) {
        setZoomedFilter(idx);
      }
    },
    [totalW, totalH, filterPxW, filterPxH, gap, cols, numFilters],
  );

  // Scrollable when many filters.
  const maxGridHeight = 260;
  const needsScroll = totalH > maxGridHeight;

  return (
    <div className="flex flex-col gap-3">
      {/* ── Label ── */}
      {label && (
        <span className="text-[10px] text-neutral-500 font-mono">{label}</span>
      )}

      {/* ── Filter grid ── */}
      <div
        className="relative"
        style={{
          maxHeight: needsScroll ? maxGridHeight : undefined,
          overflowY: needsScroll ? "auto" : undefined,
        }}
      >
        <canvas
          ref={gridCanvasRef}
          className="rounded-lg border border-neural-border cursor-pointer"
          style={{
            width: Math.min(totalW, 380),
            height: totalW > 380 ? totalH * (380 / totalW) : totalH,
            imageRendering: cellSize >= 6 ? "pixelated" : "auto",
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
          onClick={handleClick}
        />

        {/* ── Hover tooltip ── */}
        {hover && allStats[hover.filterIdx] && (
          <div
            className="absolute z-10 pointer-events-none"
            style={{
              left: hover.x + 14,
              top: hover.y - 48,
            }}
          >
            <div className="px-2.5 py-1.5 rounded-lg bg-neural-bg/95 border border-neural-border backdrop-blur-md shadow-lg text-[9px] font-mono whitespace-nowrap">
              <div className="font-semibold" style={{ color: accentColor }}>
                Filter #{hover.filterIdx}
              </div>
              <div className="text-neutral-500 mt-0.5">
                {fH}×{fW} · pattern: {allStats[hover.filterIdx].pattern}
              </div>
              <div className="text-neutral-600 mt-0.5">
                range: [{allStats[hover.filterIdx].min.toFixed(3)}, {allStats[hover.filterIdx].max.toFixed(3)}]
              </div>
              <div className="text-neutral-600 text-[7px] mt-1 flex items-center gap-1">
                <ZoomIn size={7} /> click to zoom
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Colour scale legend ── */}
      <div className="flex items-center gap-2 px-1">
        <div
          className="flex-1 h-2 rounded-full overflow-hidden"
          style={{
            background: "linear-gradient(to right, #3b82f6, #ffffff, #ef4444)",
          }}
        />
        <div className="flex justify-between text-[8px] text-neutral-600 font-mono w-16 shrink-0">
          <span>neg</span>
          <span>pos</span>
        </div>
      </div>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-4 gap-1">
        {[
          { label: "filters", value: `${summary.numFilters}`, color: accentColor },
          { label: "kernel", value: summary.kernelSize, color: "#a78bfa" },
          { label: "avg |max|", value: summary.avgAbsMax.toFixed(3), color: "#f59e0b" },
          { label: "avg std", value: summary.avgStd.toFixed(4), color: "#10b981" },
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

      {/* ── Pattern distribution ── */}
      {summary.patterns.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[8px] text-neutral-600 font-mono">patterns:</span>
          {Array.from(summary.patterns.entries()).map(([pattern, count]) => (
            <span
              key={pattern}
              className="px-1.5 py-0.5 rounded text-[8px] font-mono border border-neural-border bg-white/[0.02]"
              style={{ color: accentColor }}
            >
              {pattern} <span className="text-neutral-600">×{count}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Info hint ── */}
      <div className="flex items-center gap-1 text-[8px] text-neutral-600 font-mono px-1">
        <Info size={8} />
        <span>
          {isFirstLayer
            ? "First conv layer — filters learn basic edge/texture detectors"
            : "Deeper conv layer — filters combine lower-level features"}
          {featureMaps ? " · Feature maps shown on zoom" : ""}
        </span>
      </div>

      {/* ── Zoom preview overlay ── */}
      <AnimatePresence>
        {zoomedFilter !== null && allStats[zoomedFilter] && (
          <div className="relative">
            <ZoomPreview
              data={allFilterData[zoomedFilter]}
              fW={fW}
              fH={fH}
              stats={allStats[zoomedFilter]}
              filterIdx={zoomedFilter}
              accentColor={accentColor}
              featureMapData={
                featureMaps && zoomedFilter < fmNumFilters
                  ? featureMaps.data.slice(zoomedFilter * fmSize, (zoomedFilter + 1) * fmSize)
                  : null
              }
              fmW={fmW || undefined}
              fmH={fmH || undefined}
              onClose={() => setZoomedFilter(null)}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const FilterGrid = memo(FilterGridComponent);
