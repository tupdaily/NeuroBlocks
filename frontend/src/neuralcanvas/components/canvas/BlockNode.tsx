"use client";

// ---------------------------------------------------------------------------
// BlockNode — generic custom React Flow node for every block type
// ---------------------------------------------------------------------------

import { memo, useMemo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  BLOCK_REGISTRY,
  type BlockType,
  type BlockDefinition,
} from "@/neuralcanvas/lib/blockRegistry";
import { getShapeLabel } from "@/neuralcanvas/lib/shapeEngine";
import { useShapes } from "./ShapeContext";
import {
  Database,
  ArrowRightLeft,
  Grid3X3,
  Repeat,
  ScanEye,
  AlignCenterHorizontal,
  BarChartHorizontal,
  Zap,
  Dice3,
  MoveHorizontal,
  TextCursorInput,
  Percent,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Icon lookup (lucide icon name → component)
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  database: Database,
  "arrow-right-left": ArrowRightLeft,
  "grid-3x3": Grid3X3,
  repeat: Repeat,
  "scan-eye": ScanEye,
  "align-center-horizontal": AlignCenterHorizontal,
  "bar-chart-horizontal": BarChartHorizontal,
  zap: Zap,
  "dice-3": Dice3,
  "move-horizontal": MoveHorizontal,
  "text-cursor-input": TextCursorInput,
  percent: Percent,
};

// ---------------------------------------------------------------------------
// Param summary (compact one-liner for the node body)
// ---------------------------------------------------------------------------

function paramSummary(
  def: BlockDefinition,
  params: Record<string, number | string>,
): string {
  if (def.paramSchema.length === 0) return "";
  return def.paramSchema
    .map((s) => {
      const val = params[s.name] ?? def.defaultParams[s.name] ?? "?";
      return `${s.name}: ${val}`;
    })
    .join(" · ");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BlockNodeData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

function BlockNodeComponent({ id, type, data, selected }: NodeProps<Node<BlockNodeData>>) {
  const blockType = type as BlockType;
  const def = BLOCK_REGISTRY[blockType];
  const { shapes } = useShapes();
  const result = shapes.get(id);

  const params = data?.params ?? {};
  const Icon = def ? ICON_MAP[def.icon] : null;
  const color = def?.color ?? "#6366f1";

  const summary = useMemo(
    () => (def ? paramSummary(def, params) : ""),
    [def, params],
  );

  const outLabel = getShapeLabel(result?.outputShape ?? null);
  const hasError = !!result?.error;

  if (!def) {
    return (
      <div className="px-3 py-2 rounded-lg bg-red-950 border border-red-500 text-red-300 text-xs">
        Unknown block: {type}
      </div>
    );
  }

  return (
    <div
      className={`
        group relative min-w-[170px] max-w-[220px]
        rounded-xl border shadow-lg
        transition-all duration-150
        ${selected ? "ring-2 ring-white/30 scale-[1.02]" : ""}
        ${hasError ? "border-red-500/70" : "border-neural-border"}
        bg-neural-surface
      `}
      style={{
        boxShadow: `0 0 12px ${color}22`,
      }}
    >
      {/* ── Header bar ── */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-xl"
        style={{ backgroundColor: `${color}18` }}
      >
        {Icon && <Icon size={14} style={{ color }} className="shrink-0" />}
        <span
          className="text-xs font-semibold tracking-wide truncate"
          style={{ color }}
        >
          {def.label}
        </span>
        {/* Output shape badge */}
        <span
          className={`
            ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded
            ${hasError ? "bg-red-500/20 text-red-400" : "bg-white/5 text-neutral-400"}
          `}
        >
          {outLabel}
        </span>
      </div>

      {/* ── Body ── */}
      <div className="px-3 py-2 space-y-1">
        {summary && (
          <p className="text-[10px] text-neutral-400 font-mono leading-relaxed truncate">
            {summary}
          </p>
        )}
        {hasError && (
          <p className="text-[10px] text-red-400 leading-snug line-clamp-2">
            {result?.error}
          </p>
        )}
      </div>

      {/* ── Input handles ── */}
      {def.inputPorts.map((port, i) => (
        <Handle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          style={{
            top: `${30 + i * 20}%`,
            width: 10,
            height: 10,
            background: hasError ? "#ef4444" : color,
            border: "2px solid #111827",
          }}
        />
      ))}

      {/* ── Output handles ── */}
      {def.outputPorts.map((port, i) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          style={{
            top: `${30 + i * 20}%`,
            width: 10,
            height: 10,
            background: hasError ? "#ef4444" : color,
            border: "2px solid #111827",
          }}
        />
      ))}
    </div>
  );
}

export const BlockNode = memo(BlockNodeComponent);
