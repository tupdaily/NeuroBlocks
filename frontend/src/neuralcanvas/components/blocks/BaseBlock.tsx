"use client";

// ---------------------------------------------------------------------------
// BaseBlock — the stunning reusable wrapper every block node renders through
// ---------------------------------------------------------------------------
//
// Visual design:
//   ┌─────────────────────────────────────┐
//   │ ● Icon  Block Name       type  👁   │ ← gradient header bar
//   ├─────────────────────────────────────┤
//   │  param₁: [__256__]  ▲▼             │ ← inline-editable params
//   │  param₂: [__128__]  ▲▼             │
//   ├─────────────────────────────────────┤
//   │  → [B, 256]  →  [B, 128]          │ ← shape bar (or error)
//   └─────────────────────────────────────┘
//   ◉ input handle (left)     output handle (right) ◉
// ---------------------------------------------------------------------------

import {
  memo,
  useState,
  useCallback,
  type ReactNode,
  type ChangeEvent,
} from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import {
  BLOCK_REGISTRY,
  type BlockType,
  type BlockDefinition,
  type ParamSchema,
} from "@/neuralcanvas/lib/blockRegistry";
import { getShapeLabel } from "@/neuralcanvas/lib/shapeEngine";
import { useShapes } from "@/neuralcanvas/components/canvas/ShapeContext";
import { usePeepInsideContext } from "@/neuralcanvas/components/peep-inside/PeepInsideContext";
import { useGradientFlow, healthToColor } from "@/neuralcanvas/components/peep-inside/GradientFlowContext";
import {
  Database,
  CircleDot,
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
  Eye,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

/** Uniform scale for block size on the playground (0.72 = 72% of design size). */
const BLOCK_SCALE = 0.72;

export const ICON_MAP: Record<string, LucideIcon> = {
  database: Database,
  "circle-dot": CircleDot,
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
// Inline number input with up/down steppers
// ---------------------------------------------------------------------------

interface NumberParamProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  color: string;
  onChange: (v: number) => void;
}

function NumberParam({ value, min, max, step = 1, color, onChange }: NumberParamProps) {
  const clamp = useCallback(
    (v: number) => {
      let n = v;
      if (min !== undefined) n = Math.max(min, n);
      if (max !== undefined) n = Math.min(max, n);
      return n;
    },
    [min, max],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const parsed = step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
      if (Number.isFinite(parsed)) onChange(clamp(parsed));
    },
    [onChange, clamp, step],
  );

  return (
    <div className="flex items-center gap-0.5">
      <input
        type="number"
        value={value}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        className="
          nodrag nopan
          min-h-0 px-0.5 py-px rounded leading-none font-mono text-center
          bg-white/[0.06] border border-white/[0.08]
          text-neutral-200
          outline-none focus:border-opacity-60
          transition-colors duration-100
          [appearance:textfield]
          [&::-webkit-outer-spin-button]:appearance-none
          [&::-webkit-inner-spin-button]:appearance-none
        "
        style={{ width: 36 * BLOCK_SCALE, fontSize: `${8 * BLOCK_SCALE}px`, borderColor: `${color}30` }}
      />
      <div className="flex flex-col -space-y-px">
        <button
          className="nodrag nopan p-0 text-neutral-500 hover:text-neutral-300 transition-colors"
          onClick={() => onChange(clamp(value + step))}
          tabIndex={-1}
        >
          <ChevronUp size={Math.round(7 * BLOCK_SCALE) || 5} />
        </button>
        <button
          className="nodrag nopan p-0 text-neutral-500 hover:text-neutral-300 transition-colors"
          onClick={() => onChange(clamp(value - step))}
          tabIndex={-1}
        >
          <ChevronDown size={Math.round(7 * BLOCK_SCALE) || 5} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline select input
// ---------------------------------------------------------------------------

interface SelectParamProps {
  value: string;
  options: string[];
  color: string;
  onChange: (v: string) => void;
}

function SelectParam({ value, options, color, onChange }: SelectParamProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="
        nodrag nopan
        min-h-0 px-0.5 py-px rounded leading-none font-mono
        bg-white/[0.06] border border-white/[0.08]
        text-neutral-200
        outline-none focus:border-opacity-60
        transition-colors duration-100 cursor-pointer
      "
      style={{ width: 52 * BLOCK_SCALE, fontSize: `${8 * BLOCK_SCALE}px`, borderColor: `${color}30` }}
    >
      {options.map((opt) => (
        <option key={opt} value={opt} className="bg-neural-surface text-neutral-200">
          {opt}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Param row renderer
// ---------------------------------------------------------------------------

interface ParamRowProps {
  schema: ParamSchema;
  value: number | string;
  color: string;
  onUpdate: (name: string, value: number | string) => void;
}

function ParamRow({ schema, value, color, onUpdate }: ParamRowProps) {
  const renderInput = () => {
    if (schema.type === "select" && schema.options) {
      return (
        <SelectParam
          value={String(value)}
          options={schema.options}
          color={color}
          onChange={(v) => onUpdate(schema.name, v)}
        />
      );
    }
    const numVal = typeof value === "number" ? value : parseFloat(String(value)) || 0;
    const step = schema.type === "float" ? 0.05 : 1;
    return (
      <NumberParam
        value={numVal}
        min={schema.min}
        max={schema.max}
        step={step}
        color={color}
        onChange={(v) => onUpdate(schema.name, v)}
      />
    );
  };

  return (
    <div className="flex items-center justify-between gap-0.5">
      <span className="text-neutral-500 font-mono shrink-0 truncate leading-none" style={{ fontSize: `${7 * BLOCK_SCALE}px`, maxWidth: 28 * BLOCK_SCALE }} title={schema.name}>
        {schema.name}
      </span>
      {renderInput()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BaseBlock props
// ---------------------------------------------------------------------------

export interface BaseBlockProps {
  /** React Flow node id. */
  id: string;
  /** Block type string. */
  blockType: BlockType;
  /** Current params from node data. */
  params: Record<string, number | string>;
  /** Whether the node is selected. */
  selected: boolean;
  /** Optional extra content to render in the body (after params). */
  children?: ReactNode;
}

// ---------------------------------------------------------------------------
// BaseBlock component
// ---------------------------------------------------------------------------

function BaseBlockComponent({
  id,
  blockType,
  params,
  selected,
  children,
}: BaseBlockProps) {
  const def: BlockDefinition | undefined = BLOCK_REGISTRY[blockType];
  const { shapes } = useShapes();
  const result = shapes.get(id);
  const { setNodes } = useReactFlow();
  const [errorTooltip, setErrorTooltip] = useState(false);
  const { open: openPeep } = usePeepInsideContext();
  const { enabled: gradFlowEnabled, gradients: gradMap } = useGradientFlow();
  const gradInfo = gradFlowEnabled ? gradMap.get(id) : undefined;
  const gradGlowColor = gradInfo ? healthToColor(gradInfo.health) : undefined;

  const handlePeepInside = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      openPeep({
        blockId: id,
        blockType,
        anchorX: rect.right,
        anchorY: rect.top,
        activationType:
          blockType === "Activation"
            ? String(params.activation ?? "")
            : undefined,
      });
    },
    [id, blockType, params, openPeep],
  );

  const color = def?.color ?? "#6366f1";
  const Icon = def ? ICON_MAP[def.icon] : null;
  const hasError = !!result?.error;
  const inLabel = getShapeLabel(result?.inputShape ?? null);
  const outLabel = getShapeLabel(result?.outputShape ?? null);

  // ── Param update handler ──
  const onParamUpdate = useCallback(
    (name: string, value: number | string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prevParams = (n.data?.params && typeof n.data.params === "object") ? n.data.params as Record<string, number | string> : {};
          return {
            ...n,
            data: {
              ...n.data,
              params: { ...prevParams, [name]: value },
            },
          };
        }),
      );
    },
    [id, setNodes],
  );

  if (!def) {
    return (
      <div className="px-2 py-1 rounded bg-red-950 border border-red-500 text-red-300 text-[9px]">
        Unknown block: {blockType}
      </div>
    );
  }

  return (
    <div
      className={`
        group/block relative
        rounded overflow-hidden
        transition-all duration-200
        ${selected ? "ring-2 scale-[1.02]" : ""}
        ${hasError ? "ring-red-500/50" : "ring-white/20"}
      `}
      style={{
        width: 88 * BLOCK_SCALE,
        minWidth: 72 * BLOCK_SCALE,
        maxWidth: 88 * BLOCK_SCALE,
      }}
      style={{
        boxShadow: gradFlowEnabled && gradGlowColor
          ? `0 0 ${Math.min(gradInfo!.norm * 40, 20)}px ${gradGlowColor}50, 0 2px 12px rgba(0,0,0,0.35)`
          : selected
            ? `0 0 12px ${color}30, 0 2px 12px rgba(0,0,0,0.4)`
            : `0 2px 8px rgba(0,0,0,0.35), 0 0 6px ${color}10`,
        ...(gradFlowEnabled && gradGlowColor
          ? { outline: `2px solid ${gradGlowColor}50`, outlineOffset: -1 }
          : {}),
      }}
    >
      {/* ── Gradient background ── */}
      <div
        className="absolute inset-0 rounded opacity-[0.07] pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${color}, transparent 60%)`,
        }}
      />
      <div className="relative bg-neural-surface/95 backdrop-blur-sm rounded border border-neural-border">
        {/* ══════════ Header bar ══════════ */}
        <div
          className="flex items-center gap-0.5 px-1 py-px min-h-0 leading-none"
          style={{
            background: `linear-gradient(135deg, ${color}20 0%, ${color}08 100%)`,
          }}
        >
          {Icon && (
            <div
              className="flex items-center justify-center rounded shrink-0"
              style={{ backgroundColor: `${color}25`, width: 12 * BLOCK_SCALE, height: 12 * BLOCK_SCALE }}
            >
              <Icon size={Math.round(6 * BLOCK_SCALE) || 4} style={{ color }} />
            </div>
          )}
          <span
            className="font-bold tracking-wide truncate flex-1 min-w-0 leading-none"
            style={{ color, fontSize: `${8 * BLOCK_SCALE}px` }}
          >
            {def.label}
          </span>
          <button
            className="
              nodrag nopan
              flex items-center justify-center rounded shrink-0
              text-neutral-600 hover:text-neutral-300
              bg-white/[0.03] hover:bg-white/[0.08]
              transition-all duration-150
              opacity-0 group-hover/block:opacity-100
            "
            style={{ width: 12 * BLOCK_SCALE, height: 12 * BLOCK_SCALE }}
            title="Peep inside this block"
            onClick={handlePeepInside}
          >
            <Eye size={Math.round(6 * BLOCK_SCALE) || 4} />
          </button>
        </div>

        {/* ══════════ Body — editable params ══════════ */}
        <div className="px-1 py-px space-y-px leading-none">
          {def.paramSchema.map((schema) => (
            <ParamRow
              key={schema.name}
              schema={schema}
              value={params[schema.name] ?? def.defaultParams[schema.name] ?? 0}
              color={color}
              onUpdate={onParamUpdate}
            />
          ))}

          {/* Extra custom content from specific blocks */}
          {children}
        </div>

        {/* ══════════ Shape bar ══════════ */}
        <div
          className={`
            flex items-center gap-0.5 px-1 py-px min-h-0 leading-none
            border-t font-mono
            ${hasError ? "border-red-500/30 bg-red-500/[0.05]" : "border-neural-border bg-white/[0.02]"}
          `}
          style={{ fontSize: `${6 * BLOCK_SCALE}px` }}
        >
          {hasError ? (
            <>
              <div className="relative">
                <button
                  className="nodrag nopan text-red-400 hover:text-red-300 transition-colors"
                  onClick={() => setErrorTooltip((v) => !v)}
                >
                  <AlertCircle size={Math.round(9 * BLOCK_SCALE) || 6} />
                </button>
                {/* Error tooltip */}
                {errorTooltip && (
                  <div className="absolute bottom-full left-0 mb-2 z-50 w-56 p-2 rounded-lg bg-red-950/95 border border-red-500/40 text-[10px] text-red-200 leading-relaxed shadow-xl backdrop-blur-md">
                    {result?.error}
                  </div>
                )}
              </div>
              <span className="text-red-400 truncate flex-1">{result?.error}</span>
            </>
          ) : (
            <>
              <span className="text-neutral-500">{inLabel}</span>
              <span className="text-neutral-600">→</span>
              <span style={{ color: `${color}cc` }}>{outLabel}</span>
            </>
          )}
        </div>

        {/* ══════════ Handles with glow ══════════ */}
        {def.inputPorts.map((port, i) => {
          const topPct = def.inputPorts.length === 1
            ? 50
            : 30 + (i / Math.max(def.inputPorts.length - 1, 1)) * 40;
          return (
            <Handle
              key={port.id}
              id={port.id}
              type="target"
              position={Position.Left}
              className="!transition-all !duration-200"
              style={{
                top: `${topPct}%`,
                width: Math.max(4, 6 * BLOCK_SCALE),
                height: Math.max(4, 6 * BLOCK_SCALE),
                background: hasError ? "#ef4444" : color,
                border: "1px solid #111827",
                boxShadow: `0 0 2px ${hasError ? "#ef4444" : color}40`,
              }}
            />
          );
        })}
        {def.outputPorts.map((port, i) => {
          const topPct = def.outputPorts.length === 1
            ? 50
            : 30 + (i / Math.max(def.outputPorts.length - 1, 1)) * 40;
          return (
            <Handle
              key={port.id}
              id={port.id}
              type="source"
              position={Position.Right}
              className="!transition-all !duration-200"
              style={{
                top: `${topPct}%`,
                width: Math.max(4, 6 * BLOCK_SCALE),
                height: Math.max(4, 6 * BLOCK_SCALE),
                background: hasError ? "#ef4444" : color,
                border: "1px solid #111827",
                boxShadow: `0 0 2px ${hasError ? "#ef4444" : color}40`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export const BaseBlock = memo(BaseBlockComponent);
