"use client";

// ---------------------------------------------------------------------------
// ActivationHistogram — rich distribution histogram for activation values
// ---------------------------------------------------------------------------
//
// Uses Recharts BarChart with 50 bins, a KDE overlay curve, gradient fills,
// activation-type-specific zone highlighting, summary stats, and a
// plain-English diagnostic insight.
// ---------------------------------------------------------------------------

import { memo, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  Line,
} from "recharts";
import type { TensorSlice } from "@/neuralcanvas/hooks/usePeepInside";
import type { BlockType } from "@/neuralcanvas/lib/blockRegistry";
import { AlertTriangle, CheckCircle, Info } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivationHistogramProps {
  tensor: TensorSlice;
  bins?: number;
  accentColor?: string;
  label?: string;
  /** The BlockType this activation belongs to (e.g. "Activation", "Linear"). */
  blockType?: BlockType;
  /** The specific activation function, if applicable (e.g. "relu", "sigmoid"). */
  activationType?: string;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

interface ActivationStats {
  min: number;
  max: number;
  mean: number;
  std: number;
  deadPct: number;    // % of values exactly 0 (or ≤ 1e-7)
  saturatedPct: number; // % of values near ±1 (for bounded activations)
  total: number;
}

function computeStats(data: number[], actType?: string): ActivationStats {
  const n = data.length;
  if (n === 0)
    return { min: 0, max: 0, mean: 0, std: 0, deadPct: 0, saturatedPct: 0, total: 0 };

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let dead = 0;
  let saturated = 0;

  const isBounded = actType === "sigmoid" || actType === "tanh";
  const satThreshold = actType === "sigmoid" ? 0.02 : 0.05; // distance from boundary

  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    if (Math.abs(v) <= 1e-7) dead++;
    if (isBounded) {
      if (actType === "sigmoid" && (v < satThreshold || v > 1 - satThreshold)) saturated++;
      if (actType === "tanh" && (v < -1 + satThreshold || v > 1 - satThreshold)) saturated++;
    }
  }

  const mean = sum / n;
  let sqSum = 0;
  for (const v of data) sqSum += (v - mean) ** 2;
  const std = Math.sqrt(sqSum / n);

  return {
    min,
    max,
    mean,
    std,
    deadPct: (dead / n) * 100,
    saturatedPct: (saturated / n) * 100,
    total: n,
  };
}

// ---------------------------------------------------------------------------
// Histogram binning
// ---------------------------------------------------------------------------

interface BinDatum {
  /** Bin centre for X-axis display. */
  x: number;
  /** Left edge. */
  xMin: number;
  /** Right edge. */
  xMax: number;
  /** Frequency count. */
  count: number;
  /** Normalised to [0,1] for gradient colouring. */
  t: number;
  /** Fill colour. */
  fill: string;
  /** KDE value at this bin centre. */
  kde: number;
  /** Whether this bin is in a "danger zone" (dead/saturated). */
  danger: boolean;
}

function binData(
  data: number[],
  numBins: number,
  actType?: string,
): BinDatum[] {
  if (data.length === 0) return [];

  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) max = min + 1;

  // Slight padding so extreme values don't fall off.
  const pad = (max - min) * 0.01;
  const lo = min - pad;
  const hi = max + pad;
  const step = (hi - lo) / numBins;

  const counts = new Array<number>(numBins).fill(0);
  for (const v of data) {
    let idx = Math.floor((v - lo) / step);
    if (idx >= numBins) idx = numBins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }

  const maxCount = Math.max(...counts, 1);

  // Gaussian KDE (bandwidth via Silverman's rule).
  const n = data.length;
  const meanVal = data.reduce((a, b) => a + b, 0) / n;
  let variance = 0;
  for (const v of data) variance += (v - meanVal) ** 2;
  const stdDev = Math.sqrt(variance / n) || 1;
  const bandwidth = 1.06 * stdDev * Math.pow(n, -0.2);

  // Build output.
  const bins: BinDatum[] = [];
  for (let i = 0; i < numBins; i++) {
    const xMin = lo + i * step;
    const xMax = xMin + step;
    const centre = (xMin + xMax) / 2;
    const t = numBins > 1 ? i / (numBins - 1) : 0.5;

    // KDE at centre.
    let kdeSum = 0;
    for (const v of data) {
      const u = (centre - v) / bandwidth;
      kdeSum += Math.exp(-0.5 * u * u);
    }
    const kdeVal = (kdeSum / (n * bandwidth * Math.sqrt(2 * Math.PI)));

    // Determine danger zones.
    let danger = false;
    if (actType === "relu" && centre >= -step && centre <= step) {
      // Bin around 0 for ReLU.
      danger = counts[i] > maxCount * 0.15;
    }
    if (actType === "sigmoid") {
      danger = centre < 0.05 || centre > 0.95;
    }
    if (actType === "tanh") {
      danger = centre < -0.9 || centre > 0.9;
    }

    // Colour: cool-to-warm gradient (blue → purple → orange → red).
    const fill = danger
      ? "#ef4444"
      : interpolateActivationColor(t);

    bins.push({
      x: parseFloat(centre.toFixed(4)),
      xMin: parseFloat(xMin.toFixed(4)),
      xMax: parseFloat(xMax.toFixed(4)),
      count: counts[i],
      t,
      fill,
      kde: kdeVal,
      danger,
    });
  }

  // Normalise KDE to roughly match bar heights for visual overlay.
  const maxKde = Math.max(...bins.map((b) => b.kde), 1e-10);
  const kdeScale = maxCount / maxKde;
  for (const b of bins) b.kde = b.kde * kdeScale;

  return bins;
}

// ---------------------------------------------------------------------------
// Colour interpolation (cool → warm)
// ---------------------------------------------------------------------------

function interpolateActivationColor(t: number): string {
  // 0 = cool blue, 0.5 = purple, 1.0 = warm orange/red
  const r = Math.round(40 + t * 215);          // 40 → 255
  const g = Math.round(120 - t * 80);           // 120 → 40
  const b = Math.round(220 - t * 180);          // 220 → 40
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Insight engine
// ---------------------------------------------------------------------------

interface Insight {
  level: "ok" | "warning" | "critical";
  message: string;
}

function generateInsights(
  stats: ActivationStats,
  actType?: string,
): Insight[] {
  const insights: Insight[] = [];

  // Dead neuron check (primarily for ReLU).
  if (actType === "relu" || !actType) {
    if (stats.deadPct > 50) {
      insights.push({
        level: "critical",
        message: `${stats.deadPct.toFixed(0)}% of neurons are dead (always outputting 0). Consider using LeakyReLU or adding BatchNorm before this layer.`,
      });
    } else if (stats.deadPct > 20) {
      insights.push({
        level: "warning",
        message: `${stats.deadPct.toFixed(0)}% of neurons are dead. This may reduce model capacity. Try a lower learning rate or LeakyReLU.`,
      });
    }
  }

  // Saturation check (sigmoid/tanh).
  if (actType === "sigmoid" || actType === "tanh") {
    if (stats.saturatedPct > 40) {
      insights.push({
        level: "critical",
        message: `${stats.saturatedPct.toFixed(0)}% of activations are saturated (near ±boundary). Gradients will vanish. Add BatchNorm or reduce the learning rate.`,
      });
    } else if (stats.saturatedPct > 15) {
      insights.push({
        level: "warning",
        message: `${stats.saturatedPct.toFixed(0)}% of activations are in the saturation zone. Monitor for vanishing gradients.`,
      });
    }
  }

  // Distribution health.
  if (stats.std < 0.01 && stats.total > 10) {
    insights.push({
      level: "warning",
      message: `Extremely low variance (std = ${stats.std.toFixed(4)}). Activations have collapsed — the layer may not be learning.`,
    });
  } else if (stats.std > 10) {
    insights.push({
      level: "warning",
      message: `Very high variance (std = ${stats.std.toFixed(2)}). Consider adding normalization to stabilize activations.`,
    });
  }

  // All good.
  if (insights.length === 0) {
    insights.push({
      level: "ok",
      message: "Activation distribution looks healthy. Values are well-spread with no dead or saturated neurons.",
    });
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: BinDatum }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="px-2.5 py-1.5 rounded-lg bg-neural-bg/95 border border-neural-border backdrop-blur-md shadow-lg text-[9px] font-mono">
      <div className="text-neutral-400">
        [{d.xMin.toFixed(3)}, {d.xMax.toFixed(3)})
      </div>
      <div className="text-neutral-200 font-semibold mt-0.5">
        count: {d.count}
      </div>
      {d.danger && (
        <div className="text-red-400 mt-0.5">danger zone</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom bar shape (Recharts v3-compatible)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarShape(props: any) {
  const { x, y, width: w, height: h, payload } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: BinDatum;
  };
  return (
    <rect
      x={x}
      y={y}
      width={Math.max(w, 1)}
      height={h}
      rx={1.5}
      fill={payload.fill}
      opacity={0.75}
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ActivationHistogramComponent({
  tensor,
  bins: numBins = 50,
  accentColor = "#22c55e",
  label,
  blockType,
  activationType,
}: ActivationHistogramProps) {
  // Determine the effective activation type.
  const actType = activationType?.toLowerCase();

  const histBins = useMemo(
    () => binData(tensor.data, numBins, actType),
    [tensor.data, numBins, actType],
  );

  const stats = useMemo(
    () => computeStats(tensor.data, actType),
    [tensor.data, actType],
  );

  const insights = useMemo(
    () => generateInsights(stats, actType),
    [stats, actType],
  );

  const maxCount = useMemo(
    () => Math.max(...histBins.map((b) => b.count), 1),
    [histBins],
  );

  if (histBins.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-[11px] text-neutral-600">
        No activation data to display.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Label ── */}
      {label && (
        <span className="text-[10px] text-neutral-500 font-mono">{label}</span>
      )}

      {/* ── Chart ── */}
      <div className="w-full" style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={histBins}
            margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
            barCategoryGap={0}
            barGap={0}
          >
            <defs>
              {/* Gradient definitions for each bar — we use per-bar fills via the shape. */}
              <linearGradient id="kde-gradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                <stop offset="50%" stopColor="#a855f7" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.8} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="x"
              tick={{ fontSize: 8, fill: "#6b7280" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickFormatter={(v: number) => v.toFixed(1)}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 8, fill: "#6b7280" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
              }
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
            />

            {/* Histogram bars with per-bar fill */}
            <Bar
              dataKey="count"
              radius={[2, 2, 0, 0]}
              isAnimationActive={true}
              animationDuration={600}
              animationEasing="ease-out"
              shape={BarShape}
            />

            {/* KDE smooth overlay curve */}
            <Line
              dataKey="kde"
              type="monotone"
              stroke="url(#kde-gradient)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={true}
              animationDuration={800}
            />

            {/* Zone highlight areas for bounded activations */}
            {(actType === "sigmoid" || actType === "tanh") && (
              <Area
                dataKey={(d: BinDatum) => (d.danger ? d.count : 0)}
                type="monotone"
                fill="#ef444440"
                stroke="none"
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── ReLU zero-spike annotation ── */}
      {actType === "relu" && stats.deadPct > 5 && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/[0.06] border border-red-500/20 text-[9px] font-mono text-red-400">
          <AlertTriangle size={10} className="shrink-0" />
          <span>Spike at 0 — {stats.deadPct.toFixed(1)}% dead neurons</span>
        </div>
      )}

      {/* ── Saturation zone annotation ── */}
      {(actType === "sigmoid" || actType === "tanh") && stats.saturatedPct > 5 && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/[0.06] border border-red-500/20 text-[9px] font-mono text-red-400">
          <AlertTriangle size={10} className="shrink-0" />
          <span>
            Saturation zones highlighted — {stats.saturatedPct.toFixed(1)}% of activations near
            {actType === "sigmoid" ? " 0 or 1" : " -1 or +1"}
          </span>
        </div>
      )}

      {/* ── Summary stats row ── */}
      <div className="grid grid-cols-5 gap-1">
        {[
          { label: "mean", value: stats.mean.toFixed(4), color: "#a78bfa" },
          { label: "std", value: stats.std.toFixed(4), color: "#f59e0b" },
          { label: "min", value: stats.min.toFixed(4), color: "#3b82f6" },
          { label: "max", value: stats.max.toFixed(4), color: "#ef4444" },
          {
            label: actType === "sigmoid" || actType === "tanh" ? "satur." : "dead",
            value:
              actType === "sigmoid" || actType === "tanh"
                ? `${stats.saturatedPct.toFixed(1)}%`
                : `${stats.deadPct.toFixed(1)}%`,
            color:
              (actType === "sigmoid" || actType === "tanh"
                ? stats.saturatedPct
                : stats.deadPct) > 20
                ? "#ef4444"
                : "#10b981",
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

      {/* ── Plain-English insights ── */}
      <div className="flex flex-col gap-1.5">
        {insights.map((insight, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-[10px] leading-relaxed ${
              insight.level === "critical"
                ? "bg-red-500/[0.06] border-red-500/20 text-red-300"
                : insight.level === "warning"
                  ? "bg-amber-500/[0.06] border-amber-500/20 text-amber-300"
                  : "bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-300"
            }`}
          >
            {insight.level === "critical" && (
              <AlertTriangle size={12} className="shrink-0 mt-0.5 text-red-400" />
            )}
            {insight.level === "warning" && (
              <AlertTriangle size={12} className="shrink-0 mt-0.5 text-amber-400" />
            )}
            {insight.level === "ok" && (
              <CheckCircle size={12} className="shrink-0 mt-0.5 text-emerald-400" />
            )}
            <span>{insight.message}</span>
          </div>
        ))}
      </div>

      {/* ── Sample count ── */}
      <div className="flex items-center gap-1 text-[8px] text-neutral-600 font-mono px-1">
        <Info size={8} />
        <span>{stats.total.toLocaleString()} activation values · {numBins} bins</span>
        {actType && <span> · {actType.toUpperCase()}</span>}
      </div>
    </div>
  );
}

export const ActivationHistogram = memo(ActivationHistogramComponent);
