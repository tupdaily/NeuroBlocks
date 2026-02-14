"use client";

// ---------------------------------------------------------------------------
// GradientFlowViz — per-layer gradient health visualisation
// ---------------------------------------------------------------------------
//
// Rendered inside the PeepInsideModal "Gradients" tab. Shows:
//   1. Colour-coded horizontal bar chart of gradient norms per param group
//   2. Mini sparkline of gradient norm over training steps
//   3. Summary stats + plain-English health insight
// ---------------------------------------------------------------------------

import { memo, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import {
  type GradientInfo,
  healthToBarColor,
  healthToColor,
  classifyGradientDetailed,
  type GradientHealth,
} from "./GradientFlowContext";
import {
  AlertTriangle,
  CheckCircle,
  TrendingDown,
  TrendingUp,
  Activity,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GradientFlowVizProps {
  /** Gradient data for this specific block. */
  gradientInfo: GradientInfo | null;
  /** Raw per-param data from usePeepInside (fallback). */
  rawGradients?: { name: string; norm: number }[] | null;
  /** Accent colour for the block. */
  accentColor?: string;
  label?: string;
}

// ---------------------------------------------------------------------------
// Bar chart data
// ---------------------------------------------------------------------------

interface ParamBar {
  name: string;
  norm: number;
  logNorm: number; // log10 for better visibility
  fill: string;
  health: GradientHealth;
}

function buildParamBars(
  info: GradientInfo | null,
  rawGradients?: { name: string; norm: number }[] | null,
): ParamBar[] {
  // Normalise both sources into a common shape.
  const source: { name: string; norm: number; health: GradientHealth }[] =
    info?.params ??
    rawGradients?.map((g) => ({
      name: g.name,
      norm: g.norm,
      health: classifyGradientDetailed(g.norm),
    })) ??
    [];

  return source.map((p) => ({
    name: p.name,
    norm: p.norm,
    logNorm: p.norm > 0 ? Math.log10(p.norm) + 6 : 0, // shift so 1e-6 → 0, 1 → 6, 10 → 7
    fill: healthToBarColor(p.norm),
    health: p.health,
  }));
}

// ---------------------------------------------------------------------------
// Sparkline data
// ---------------------------------------------------------------------------

interface SparkPoint {
  step: number;
  norm: number;
}

function buildSparkline(history: number[]): SparkPoint[] {
  return history.map((norm, i) => ({ step: i + 1, norm }));
}

// ---------------------------------------------------------------------------
// Insight generator
// ---------------------------------------------------------------------------

interface Insight {
  level: "ok" | "warning" | "critical";
  icon: typeof CheckCircle;
  message: string;
}

function generateInsight(
  info: GradientInfo | null,
  bars: ParamBar[],
): Insight[] {
  const insights: Insight[] = [];

  if (!info && bars.length === 0) {
    return [{ level: "ok", icon: Activity, message: "No gradient data yet. Run a backward pass to see gradient flow." }];
  }

  const health = info?.health ?? (bars.length > 0 ? bars[0].health : "unknown");

  // Check for vanishing.
  const vanishing = bars.filter((b) => b.norm < 1e-5);
  if (vanishing.length > 0) {
    insights.push({
      level: "critical",
      icon: TrendingDown,
      message: `${vanishing.length} parameter group${vanishing.length > 1 ? "s" : ""} ha${vanishing.length > 1 ? "ve" : "s"} vanishing gradients (norm < 1e-5). This block is "starving" — gradients are not reaching it. Consider using skip connections, reducing depth, or switching to ReLU/GELU.`,
    });
  }

  // Check for exploding.
  const exploding = bars.filter((b) => b.norm > 10);
  if (exploding.length > 0) {
    insights.push({
      level: "critical",
      icon: TrendingUp,
      message: `${exploding.length} parameter group${exploding.length > 1 ? "s" : ""} ha${exploding.length > 1 ? "ve" : "s"} exploding gradients (norm > 10). Add gradient clipping, reduce learning rate, or add normalization layers.`,
    });
  }

  // Check for weak (warning zone).
  const weak = bars.filter((b) => b.norm >= 1e-5 && b.norm < 1e-3);
  if (weak.length > 0 && vanishing.length === 0) {
    insights.push({
      level: "warning",
      icon: TrendingDown,
      message: `${weak.length} parameter group${weak.length > 1 ? "s" : ""} ha${weak.length > 1 ? "ve" : "s"} small gradients (1e-5 to 1e-3). Learning may be slow for this layer. Monitor over more steps.`,
    });
  }

  // All good.
  if (insights.length === 0) {
    insights.push({
      level: "ok",
      icon: CheckCircle,
      message: "Gradient flow is healthy through this layer. All parameter groups have norms in the optimal range (1e-3 to 1).",
    });
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Custom tooltip for the bar chart
// ---------------------------------------------------------------------------

function BarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ParamBar }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="px-2.5 py-1.5 rounded-lg bg-neural-bg/95 border border-neural-border backdrop-blur-md shadow-lg text-[9px] font-mono">
      <div className="text-neutral-300 font-semibold">{d.name}</div>
      <div className="mt-0.5">
        <span className="text-neutral-500">norm: </span>
        <span style={{ color: d.fill }} className="font-semibold">
          {d.norm.toExponential(3)}
        </span>
      </div>
      <div className="mt-0.5 text-neutral-500">
        {d.health === "healthy" && "healthy"}
        {d.health === "vanishing" && "vanishing"}
        {d.health === "exploding" && "exploding"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom bar shape (Recharts v3)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GradBarShape(props: any) {
  const { x, y, width: w, height: h, payload } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: ParamBar;
  };
  return (
    <rect
      x={x}
      y={y}
      width={Math.max(w, 2)}
      height={h}
      rx={3}
      fill={payload.fill}
      opacity={0.85}
    />
  );
}

// ---------------------------------------------------------------------------
// Sparkline tooltip
// ---------------------------------------------------------------------------

function SparkTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SparkPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="px-2 py-1 rounded bg-neural-bg/95 border border-neural-border text-[8px] font-mono shadow-lg">
      <span className="text-neutral-500">step {d.step}: </span>
      <span className="text-neutral-300">{d.norm.toExponential(3)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function GradientFlowVizComponent({
  gradientInfo,
  rawGradients,
  accentColor = "#6366f1",
  label,
}: GradientFlowVizProps) {
  const bars = useMemo(
    () => buildParamBars(gradientInfo, rawGradients),
    [gradientInfo, rawGradients],
  );

  const sparkData = useMemo(
    () => buildSparkline(gradientInfo?.normHistory ?? []),
    [gradientInfo?.normHistory],
  );

  const insights = useMemo(
    () => generateInsight(gradientInfo, bars),
    [gradientInfo, bars],
  );

  const overallHealth = gradientInfo?.health ?? "unknown";
  const overallNorm = gradientInfo?.norm ?? (bars.length > 0 ? bars[0].norm : 0);

  if (bars.length === 0 && sparkData.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-[11px] text-neutral-600">
        No gradient data available. Run a backward pass first.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Label ── */}
      {label && (
        <span className="text-[10px] text-neutral-500 font-mono">{label}</span>
      )}

      {/* ── Overall health badge ── */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono font-semibold"
          style={{
            color: healthToColor(overallHealth),
            borderColor: `${healthToColor(overallHealth)}30`,
            backgroundColor: `${healthToColor(overallHealth)}10`,
          }}
        >
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: healthToColor(overallHealth) }}
          />
          {overallHealth === "healthy" && "Healthy"}
          {overallHealth === "vanishing" && "Vanishing"}
          {overallHealth === "exploding" && "Exploding"}
          {overallHealth === "unknown" && "Unknown"}
        </div>
        <span className="text-[9px] text-neutral-600 font-mono">
          avg norm: {overallNorm.toExponential(2)}
        </span>
      </div>

      {/* ── Per-parameter bar chart ── */}
      {bars.length > 0 && (
        <div>
          <div className="text-[9px] text-neutral-500 font-mono mb-1.5">
            Gradient norm per parameter group
          </div>
          <div style={{ height: Math.max(bars.length * 32 + 24, 80) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bars}
                layout="vertical"
                margin={{ top: 0, right: 8, bottom: 0, left: 50 }}
                barCategoryGap={4}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  dataKey="logNorm"
                  tick={{ fontSize: 8, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                  tickFormatter={(v: number) => {
                    const exp = v - 6;
                    if (exp === 0) return "1";
                    return `1e${exp}`;
                  }}
                  domain={[0, "auto"]}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 9, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  content={<BarTooltip />}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                {/* Healthy zone highlight */}
                <ReferenceArea
                  x1={3}
                  x2={6}
                  fill="#22c55e"
                  fillOpacity={0.04}
                  stroke="none"
                />
                <Bar
                  dataKey="logNorm"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={true}
                  animationDuration={500}
                  shape={GradBarShape}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mt-1 text-[8px] font-mono">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-[#22c55e]" />
              <span className="text-neutral-500">healthy (1e-3 – 1)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-[#f59e0b]" />
              <span className="text-neutral-500">warning</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-[#ef4444]" />
              <span className="text-neutral-500">vanishing</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-[#3b82f6]" />
              <span className="text-neutral-500">exploding</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Gradient norm sparkline over training steps ── */}
      {sparkData.length > 1 && (
        <div>
          <div className="text-[9px] text-neutral-500 font-mono mb-1.5">
            Gradient norm over training steps
          </div>
          <div style={{ height: 80 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={sparkData}
                margin={{ top: 4, right: 8, bottom: 0, left: -20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                />
                <XAxis
                  dataKey="step"
                  tick={{ fontSize: 7, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 7, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => v.toExponential(0)}
                  scale="log"
                  domain={["auto", "auto"]}
                  allowDataOverflow
                />
                <Tooltip content={<SparkTooltip />} />
                {/* Healthy band */}
                <ReferenceArea
                  y1={1e-3}
                  y2={1}
                  fill="#22c55e"
                  fillOpacity={0.06}
                  stroke="none"
                />
                <ReferenceLine
                  y={1e-5}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  strokeOpacity={0.4}
                />
                <ReferenceLine
                  y={10}
                  stroke="#3b82f6"
                  strokeDasharray="4 4"
                  strokeOpacity={0.4}
                />
                <Line
                  dataKey="norm"
                  type="monotone"
                  stroke={accentColor}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={600}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[7px] font-mono text-neutral-600">
            <span>--- <span className="text-red-400">vanishing threshold (1e-5)</span></span>
            <span>--- <span className="text-blue-400">exploding threshold (10)</span></span>
            <span className="text-emerald-500/40">healthy zone</span>
          </div>
        </div>
      )}

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-4 gap-1">
        {[
          {
            label: "norm",
            value: overallNorm.toExponential(2),
            color: healthToColor(overallHealth),
          },
          {
            label: "params",
            value: `${bars.length}`,
            color: "#a78bfa",
          },
          {
            label: "min",
            value: bars.length > 0
              ? Math.min(...bars.map((b) => b.norm)).toExponential(1)
              : "—",
            color: "#3b82f6",
          },
          {
            label: "max",
            value: bars.length > 0
              ? Math.max(...bars.map((b) => b.norm)).toExponential(1)
              : "—",
            color: "#ef4444",
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
        {insights.map((insight, i) => {
          const InsightIcon = insight.icon;
          return (
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
              <InsightIcon size={12} className="shrink-0 mt-0.5" />
              <span>{insight.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const GradientFlowViz = memo(GradientFlowVizComponent);
