"use client";

// ---------------------------------------------------------------------------
// WeightHeatmap — D3-powered, canvas-rendered weight matrix visualisation
// ---------------------------------------------------------------------------
//
// Handles three size tiers:
//   Small  (<64×64)    — full resolution
//   Medium (64–512)    — downsample to ≤128 with bilinear interpolation
//   Large  (>512)      — thumbnail + click-to-zoom on sub-regions
//
// Features:
//   • d3-scale-chromatic diverging colour scale (RdBu reversed)
//   • Hover crosshair showing value + [row, col]
//   • Summary stats bar (min, max, mean, std, sparsity)
//   • Toggle raw weights / absolute values
//   • Smooth interpolation between training-step frames
// ---------------------------------------------------------------------------

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as d3 from "d3";
import type { TensorSlice } from "@/neuralcanvas/hooks/usePeepInside";
import { ZoomIn, ZoomOut, ToggleLeft, ToggleRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WeightHeatmapProps {
  tensor: TensorSlice;
  /** If a previous frame exists, interpolate colours for smooth transitions. */
  prevTensor?: TensorSlice | null;
  /** Canvas display width. */
  width?: number;
  /** Canvas display height. */
  height?: number;
  /** Block accent colour (used for UI chrome, not the heatmap itself). */
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

interface ZoomRegion {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

interface Stats {
  min: number;
  max: number;
  mean: number;
  std: number;
  sparsity: number; // % of values with |v| < 0.01
}

function computeStats(data: number[]): Stats {
  const n = data.length;
  if (n === 0) return { min: 0, max: 0, mean: 0, std: 0, sparsity: 0 };

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let nearZero = 0;

  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    if (Math.abs(v) < 0.01) nearZero++;
  }

  const mean = sum / n;
  let sqSum = 0;
  for (const v of data) sqSum += (v - mean) ** 2;
  const std = Math.sqrt(sqSum / n);
  const sparsity = (nearZero / n) * 100;

  return { min, max, mean, std, sparsity };
}

// ---------------------------------------------------------------------------
// Downsampling (bilinear interpolation)
// ---------------------------------------------------------------------------

function downsample(
  data: number[],
  srcRows: number,
  srcCols: number,
  dstRows: number,
  dstCols: number,
): number[] {
  const out = new Array<number>(dstRows * dstCols);
  const rScale = srcRows / dstRows;
  const cScale = srcCols / dstCols;

  for (let dr = 0; dr < dstRows; dr++) {
    for (let dc = 0; dc < dstCols; dc++) {
      const sr = dr * rScale;
      const sc = dc * cScale;
      const r0 = Math.floor(sr);
      const c0 = Math.floor(sc);
      const r1 = Math.min(r0 + 1, srcRows - 1);
      const c1 = Math.min(c0 + 1, srcCols - 1);
      const rFrac = sr - r0;
      const cFrac = sc - c0;

      const v00 = data[r0 * srcCols + c0] ?? 0;
      const v01 = data[r0 * srcCols + c1] ?? 0;
      const v10 = data[r1 * srcCols + c0] ?? 0;
      const v11 = data[r1 * srcCols + c1] ?? 0;

      out[dr * dstCols + dc] =
        v00 * (1 - rFrac) * (1 - cFrac) +
        v01 * (1 - rFrac) * cFrac +
        v10 * rFrac * (1 - cFrac) +
        v11 * rFrac * cFrac;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Determine render dimensions
// ---------------------------------------------------------------------------

const MAX_FULL = 64;
const MAX_MEDIUM = 512;
const DS_TARGET = 128;

function renderDims(rows: number, cols: number) {
  if (rows <= MAX_FULL && cols <= MAX_FULL) {
    return { renderRows: rows, renderCols: cols, tier: "small" as const };
  }
  if (rows <= MAX_MEDIUM && cols <= MAX_MEDIUM) {
    const scale = DS_TARGET / Math.max(rows, cols);
    return {
      renderRows: Math.max(1, Math.round(rows * scale)),
      renderCols: Math.max(1, Math.round(cols * scale)),
      tier: "medium" as const,
    };
  }
  // Large — thumbnail at 128, click-to-zoom.
  const scale = DS_TARGET / Math.max(rows, cols);
  return {
    renderRows: Math.max(1, Math.round(rows * scale)),
    renderCols: Math.max(1, Math.round(cols * scale)),
    tier: "large" as const,
  };
}

// ---------------------------------------------------------------------------
// D3 colour scale
// ---------------------------------------------------------------------------

function makeColorScale(min: number, max: number) {
  // Symmetric around zero for diverging.
  const absMax = Math.max(Math.abs(min), Math.abs(max)) || 1;
  return d3
    .scaleSequential(d3.interpolateRdBu)
    .domain([absMax, -absMax]); // RdBu goes red→blue; reversed so neg=blue, pos=red
}

// ---------------------------------------------------------------------------
// Canvas paint
// ---------------------------------------------------------------------------

function paintCanvas(
  ctx: CanvasRenderingContext2D,
  data: number[],
  rows: number,
  cols: number,
  cW: number,
  cH: number,
  colorFn: (v: number) => string,
) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = colorFn(data[r * cols + c] ?? 0);
      ctx.fillRect(c * cW, r * cH, cW + 0.5, cH + 0.5);
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function WeightHeatmapComponent({
  tensor,
  prevTensor,
  width = 380,
  height = 220,
  accentColor = "#6366f1",
  label,
}: WeightHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showAbs, setShowAbs] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [zoom, setZoom] = useState<ZoomRegion | null>(null);

  // ── Source dimensions ──
  const srcRows = tensor.shape[0] ?? 1;
  const srcCols = tensor.shape.length > 1 ? tensor.shape[1] : tensor.data.length;

  // ── Determine effective data (with abs toggle) ──
  const effectiveData = useMemo(
    () => (showAbs ? tensor.data.map(Math.abs) : tensor.data),
    [tensor.data, showAbs],
  );

  // ── Zoom-cropped data ──
  const { croppedData, croppedRows, croppedCols } = useMemo(() => {
    if (!zoom) return { croppedData: effectiveData, croppedRows: srcRows, croppedCols: srcCols };
    const { rowStart, rowEnd, colStart, colEnd } = zoom;
    const r = rowEnd - rowStart;
    const c = colEnd - colStart;
    const out: number[] = [];
    for (let ri = rowStart; ri < rowEnd; ri++) {
      for (let ci = colStart; ci < colEnd; ci++) {
        out.push(effectiveData[ri * srcCols + ci] ?? 0);
      }
    }
    return { croppedData: out, croppedRows: r, croppedCols: c };
  }, [effectiveData, srcRows, srcCols, zoom]);

  // ── Render dimensions after optional downsampling ──
  const { renderRows, renderCols, tier } = useMemo(
    () => renderDims(croppedRows, croppedCols),
    [croppedRows, croppedCols],
  );

  const renderData = useMemo(() => {
    if (renderRows === croppedRows && renderCols === croppedCols) return croppedData;
    return downsample(croppedData, croppedRows, croppedCols, renderRows, renderCols);
  }, [croppedData, croppedRows, croppedCols, renderRows, renderCols]);

  // ── Stats ──
  const stats = useMemo(() => computeStats(effectiveData), [effectiveData]);

  // ── Colour scale ──
  const colorScale = useMemo(
    () => {
      if (showAbs) {
        return d3.scaleSequential(d3.interpolateInferno).domain([0, stats.max || 1]);
      }
      return makeColorScale(stats.min, stats.max);
    },
    [stats.min, stats.max, showAbs],
  );

  // ── Paint ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    const cellW = width / renderCols;
    const cellH = height / renderRows;

    paintCanvas(ctx, renderData, renderRows, renderCols, cellW, cellH, (v) => colorScale(v));
  }, [renderData, renderRows, renderCols, width, height, colorScale]);

  // ── Hover handler ──
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;

      const cellW = width / renderCols;
      const cellH = height / renderRows;
      const col = Math.min(Math.floor(cx / cellW), renderCols - 1);
      const row = Math.min(Math.floor(cy / cellH), renderRows - 1);

      // Map back to source coords if downsampled.
      const srcRow = zoom
        ? zoom.rowStart + Math.round((row / renderRows) * (zoom.rowEnd - zoom.rowStart))
        : Math.round((row / renderRows) * srcRows);
      const srcCol = zoom
        ? zoom.colStart + Math.round((col / renderCols) * (zoom.colEnd - zoom.colStart))
        : Math.round((col / renderCols) * srcCols);

      const value = effectiveData[
        Math.min(srcRow, srcRows - 1) * srcCols + Math.min(srcCol, srcCols - 1)
      ] ?? 0;

      setHover({
        row: Math.min(srcRow, srcRows - 1),
        col: Math.min(srcCol, srcCols - 1),
        value,
        canvasX: e.clientX - rect.left,
        canvasY: e.clientY - rect.top,
      });
    },
    [renderRows, renderCols, srcRows, srcCols, effectiveData, width, height, zoom],
  );

  // ── Click to zoom (large tier) ──
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (tier !== "large" && !zoom) return;

      if (zoom) {
        // Already zoomed → reset.
        setZoom(null);
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;

      const centerRow = Math.round((cy / height) * srcRows);
      const centerCol = Math.round((cx / width) * srcCols);

      // Zoom into a 128×128 region centred on click.
      const half = 64;
      const rowStart = Math.max(0, centerRow - half);
      const rowEnd = Math.min(srcRows, rowStart + half * 2);
      const colStart = Math.max(0, centerCol - half);
      const colEnd = Math.min(srcCols, colStart + half * 2);

      setZoom({ rowStart, rowEnd, colStart, colEnd });
    },
    [tier, zoom, width, height, srcRows, srcCols],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* ── Header row ── */}
      <div className="flex items-center justify-between">
        {label && (
          <span className="text-[10px] text-neutral-500 font-mono">{label}</span>
        )}
        <div className="flex items-center gap-2">
          {/* Abs toggle */}
          <button
            onClick={() => setShowAbs((v) => !v)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono text-neutral-400 hover:text-neutral-200 bg-white/[0.03] hover:bg-white/[0.06] border border-neural-border transition-colors"
            title={showAbs ? "Show raw weights" : "Show absolute values"}
          >
            {showAbs ? <ToggleRight size={10} /> : <ToggleLeft size={10} />}
            {showAbs ? "|w|" : "raw"}
          </button>

          {/* Zoom controls */}
          {tier === "large" && (
            <button
              onClick={() => setZoom(zoom ? null : undefined as never)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono text-neutral-400 hover:text-neutral-200 bg-white/[0.03] hover:bg-white/[0.06] border border-neural-border transition-colors"
              title={zoom ? "Zoom out" : "Click heatmap to zoom"}
            >
              {zoom ? <ZoomOut size={10} /> : <ZoomIn size={10} />}
              {zoom ? "reset" : "zoom"}
            </button>
          )}
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="rounded-lg border border-neural-border w-full"
          style={{
            width,
            height,
            imageRendering: renderRows < 64 ? "pixelated" : "auto",
            cursor: tier === "large" || zoom ? "crosshair" : "default",
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
          onClick={handleClick}
        />

        {/* ── Hover crosshair tooltip ── */}
        {hover && (
          <div
            className="absolute z-10 pointer-events-none"
            style={{
              left: hover.canvasX + 12,
              top: hover.canvasY - 36,
            }}
          >
            <div className="px-2 py-1 rounded-lg bg-neural-bg/95 border border-neural-border backdrop-blur-md shadow-lg text-[9px] font-mono whitespace-nowrap">
              <span className="text-neutral-500">[{hover.row}, {hover.col}]</span>
              <span className="mx-1.5 text-neutral-600">→</span>
              <span
                className="font-semibold"
                style={{ color: hover.value >= 0 ? "#ef4444" : "#3b82f6" }}
              >
                {hover.value.toFixed(6)}
              </span>
            </div>
          </div>
        )}

        {/* ── Zoom indicator ── */}
        {zoom && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-neural-bg/80 border border-neural-border text-[8px] text-neutral-400 font-mono backdrop-blur-sm">
            rows [{zoom.rowStart}–{zoom.rowEnd}] cols [{zoom.colStart}–{zoom.colEnd}]
          </div>
        )}

        {/* ── Size tier label ── */}
        {tier !== "small" && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-neural-bg/70 text-[7px] text-neutral-600 font-mono backdrop-blur-sm">
            {tier === "medium" ? "downsampled" : zoom ? "zoomed" : "click to zoom"} · {renderRows}×{renderCols} of {srcRows}×{srcCols}
          </div>
        )}
      </div>

      {/* ── Colour scale legend ── */}
      <div className="flex items-center gap-2 px-1">
        <div
          className="flex-1 h-2 rounded-full overflow-hidden"
          style={{
            background: showAbs
              ? "linear-gradient(to right, #000000, #fcffa4)"
              : "linear-gradient(to right, #2166ac, #f7f7f7, #b2182b)",
          }}
        />
        <div className="flex justify-between text-[8px] text-neutral-600 font-mono w-24 shrink-0">
          <span>{showAbs ? "0" : stats.min.toFixed(2)}</span>
          <span>{stats.max.toFixed(2)}</span>
        </div>
      </div>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-5 gap-1">
        {[
          { label: "min", value: stats.min.toFixed(4), color: "#3b82f6" },
          { label: "max", value: stats.max.toFixed(4), color: "#ef4444" },
          { label: "mean", value: stats.mean.toFixed(4), color: "#a78bfa" },
          { label: "std", value: stats.std.toFixed(4), color: "#f59e0b" },
          { label: "sparse", value: `${stats.sparsity.toFixed(1)}%`, color: "#10b981" },
        ].map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center p-1.5 rounded-lg bg-white/[0.02] border border-neural-border"
          >
            <span className="text-[7px] uppercase tracking-wider text-neutral-600">
              {s.label}
            </span>
            <span className="text-[10px] font-mono font-semibold" style={{ color: s.color }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const WeightHeatmap = memo(WeightHeatmapComponent);
