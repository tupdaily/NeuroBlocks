"use client";

// ---------------------------------------------------------------------------
// HeatmapViz — canvas-rendered heatmap for weight matrices, attention maps, etc.
// ---------------------------------------------------------------------------

import { memo, useRef, useEffect } from "react";
import type { TensorSlice } from "@/hooks/usePeepInside";

interface HeatmapVizProps {
  tensor: TensorSlice;
  /** Colour scheme: "diverging" (blue-white-red) or "sequential" (black→colour). */
  colorScheme?: "diverging" | "sequential";
  /** Accent colour for sequential scheme. */
  accentColor?: string;
  width?: number;
  height?: number;
  label?: string;
}

/** Map a value in [min, max] to a diverging blue-white-red colour. */
function divergingColor(t: number): string {
  // t ∈ [0, 1] where 0.5 = zero.
  const r = t > 0.5 ? Math.round(255 * (t - 0.5) * 2) : 0;
  const b = t < 0.5 ? Math.round(255 * (0.5 - t) * 2) : 0;
  const g = Math.round(255 * (1 - Math.abs(t - 0.5) * 2) * 0.3);
  return `rgb(${r},${g},${b})`;
}

/** Map a value in [0, 1] to a sequential colour from black → accent. */
function sequentialColor(t: number, accent: string): string {
  // Parse hex accent.
  const hex = accent.replace("#", "");
  const ar = parseInt(hex.slice(0, 2), 16);
  const ag = parseInt(hex.slice(2, 4), 16);
  const ab = parseInt(hex.slice(4, 6), 16);
  return `rgb(${Math.round(ar * t)},${Math.round(ag * t)},${Math.round(ab * t)})`;
}

function HeatmapVizComponent({
  tensor,
  colorScheme = "diverging",
  accentColor = "#8b5cf6",
  width = 280,
  height = 200,
  label,
}: HeatmapVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const rows = tensor.shape[0] ?? 1;
  const cols = tensor.shape.length > 1 ? tensor.shape[1] : tensor.data.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    // Find min/max for normalisation.
    let min = Infinity;
    let max = -Infinity;
    for (const v of tensor.data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;

    const cellW = width / cols;
    const cellH = height / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const val = tensor.data[idx] ?? 0;
        const t = (val - min) / range; // [0, 1]

        ctx.fillStyle =
          colorScheme === "diverging"
            ? divergingColor(t)
            : sequentialColor(t, accentColor);
        ctx.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
      }
    }
  }, [tensor, colorScheme, accentColor, width, height, rows, cols]);

  return (
    <div className="flex flex-col items-center gap-2">
      {label && (
        <span className="text-[10px] text-neutral-500 font-mono">{label}</span>
      )}
      <canvas
        ref={canvasRef}
        className="rounded-lg border border-neural-border"
        style={{
          width,
          height,
          imageRendering: "pixelated",
        }}
      />
      <div className="flex justify-between w-full text-[8px] text-neutral-600 font-mono px-1">
        <span>{rows}×{cols}</span>
        <span>
          {colorScheme === "diverging" ? "blue(-) → red(+)" : "dark → bright"}
        </span>
      </div>
    </div>
  );
}

export const HeatmapViz = memo(HeatmapVizComponent);
