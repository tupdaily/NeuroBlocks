"use client";

// ---------------------------------------------------------------------------
// BlockPalette — collapsible left sidebar with draggable neural-network blocks
// ---------------------------------------------------------------------------

import { memo, useState, useCallback, useMemo, type DragEvent } from "react";
import {
  getAllBlockDefinitions,
  type BlockCategory,
  type BlockDefinition,
} from "@/neuralcanvas/lib/blockRegistry";
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
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
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

/** Category display order + metadata. */
const CATEGORIES: {
  key: BlockCategory;
  label: string;
  emoji: string;
  color: string;
}[] = [
  { key: "input", label: "Input", emoji: "📥", color: "#f59e0b" },
  { key: "output", label: "Output", emoji: "📤", color: "#22c55e" },
  { key: "layer", label: "Layers", emoji: "🧱", color: "#6366f1" },
  { key: "activation", label: "Activations", emoji: "⚡", color: "#f43f5e" },
  { key: "normalization", label: "Normalization", emoji: "📏", color: "#14b8a6" },
  { key: "utility", label: "Utility", emoji: "🔧", color: "#8b5cf6" },
];

/** MIME type used in the drag data transfer. */
export const DRAG_BLOCK_TYPE = "application/neuralcanvas-block";

// ---------------------------------------------------------------------------
// Param summary for tooltip
// ---------------------------------------------------------------------------

function defaultParamSummary(def: BlockDefinition): string {
  const entries = Object.entries(def.defaultParams);
  if (entries.length === 0) return "No parameters";
  return entries.map(([k, v]) => `${k}: ${v}`).join(", ");
}

// ---------------------------------------------------------------------------
// Single palette block item
// ---------------------------------------------------------------------------

interface PaletteItemProps {
  def: BlockDefinition;
}

const PaletteItem = memo(function PaletteItem({ def }: PaletteItemProps) {
  const Icon = ICON_MAP[def.icon];

  const onDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData(DRAG_BLOCK_TYPE, def.type);
      e.dataTransfer.effectAllowed = "move";
    },
    [def.type],
  );

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="
        group/item relative flex items-center gap-2.5
        px-3 py-2 rounded-lg cursor-grab
        transition-all duration-150 select-none
        hover:bg-white/[0.04]
        active:cursor-grabbing active:scale-[0.97]
      "
      title={`${def.label}\n${def.description}\n\nDefaults: ${defaultParamSummary(def)}`}
    >
      {/* Hover glow */}
      <div
        className="
          absolute inset-0 rounded-lg opacity-0
          group-hover/item:opacity-100
          transition-opacity duration-200
          pointer-events-none
        "
        style={{
          boxShadow: `inset 0 0 20px ${def.color}10, 0 0 8px ${def.color}08`,
        }}
      />

      {/* Icon */}
      {Icon && (
        <div
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md"
          style={{ backgroundColor: `${def.color}18` }}
        >
          <Icon size={14} style={{ color: def.color }} />
        </div>
      )}

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-neutral-200 truncate leading-tight">
          {def.label}
        </p>
        <p className="text-[9px] text-neutral-500 truncate leading-tight mt-0.5">
          {def.description}
        </p>
      </div>

      {/* Tooltip on hover */}
      <div
        className="
          absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50
          hidden group-hover/item:block
          w-56 p-3 rounded-lg
          bg-neural-surface/95 border border-neural-border
          shadow-xl backdrop-blur-md
          pointer-events-none
        "
      >
        <p className="text-[11px] font-semibold text-neutral-200 mb-1">
          {def.label}
        </p>
        <p className="text-[10px] text-neutral-400 leading-relaxed mb-2">
          {def.description}
        </p>
        {Object.keys(def.defaultParams).length > 0 && (
          <>
            <p className="text-[9px] text-neutral-500 uppercase tracking-wider mb-1">
              Default params
            </p>
            <div className="space-y-0.5">
              {Object.entries(def.defaultParams).map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between text-[10px] font-mono"
                >
                  <span className="text-neutral-400">{k}</span>
                  <span className="text-neutral-300">{String(v)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Collapsible category section
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  label: string;
  emoji: string;
  color: string;
  blocks: BlockDefinition[];
  defaultOpen?: boolean;
}

const CategorySection = memo(function CategorySection({
  label,
  emoji,
  color,
  blocks,
  defaultOpen = true,
}: CategorySectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (blocks.length === 0) return null;

  return (
    <div>
      {/* Category header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="
          w-full flex items-center gap-2 px-3 py-2
          text-left transition-colors duration-100
          hover:bg-white/[0.03] rounded-lg
        "
      >
        {/* Colored accent bar */}
        <div
          className="w-0.5 h-4 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs select-none">{emoji}</span>
        <span className="text-[11px] font-semibold text-neutral-300 flex-1 select-none">
          {label}
        </span>
        <span className="text-neutral-500">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>

      {/* Block list */}
      {open && (
        <div className="ml-1 mt-0.5 space-y-0.5">
          {blocks.map((def) => (
            <PaletteItem key={def.id} def={def} />
          ))}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main palette component
// ---------------------------------------------------------------------------

function BlockPaletteInner() {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const allDefs = useMemo(() => getAllBlockDefinitions(), []);

  const filteredByCategory = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? allDefs.filter(
          (d) =>
            d.label.toLowerCase().includes(q) ||
            d.description.toLowerCase().includes(q) ||
            d.category.toLowerCase().includes(q),
        )
      : allDefs;

    const map = new Map<BlockCategory, BlockDefinition[]>();
    for (const cat of CATEGORIES) {
      map.set(cat.key, []);
    }
    for (const def of filtered) {
      map.get(def.category)?.push(def);
    }
    return map;
  }, [allDefs, search]);

  const totalResults = useMemo(() => {
    let count = 0;
    filteredByCategory.forEach((v) => (count += v.length));
    return count;
  }, [filteredByCategory]);

  return (
    <div
      className={`
        relative h-full flex flex-col
        bg-neural-bg/70 backdrop-blur-xl
        border-r border-neural-border
        transition-all duration-300 ease-in-out
        ${collapsed ? "w-12" : "w-64"}
      `}
    >
      {/* ── Collapse / Expand toggle ── */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="
          absolute -right-3 top-4 z-10
          w-6 h-6 rounded-full
          bg-neural-surface border border-neural-border
          flex items-center justify-center
          text-neutral-400 hover:text-neutral-200
          shadow-md transition-colors duration-100
        "
        title={collapsed ? "Expand palette" : "Collapse palette"}
      >
        {collapsed ? (
          <PanelLeftOpen size={12} />
        ) : (
          <PanelLeftClose size={12} />
        )}
      </button>

      {/* ── Collapsed state: vertical icon strip ── */}
      {collapsed && (
        <div className="flex flex-col items-center gap-3 pt-14 px-1">
          {CATEGORIES.map((cat) => (
            <div
              key={cat.key}
              className="w-7 h-7 rounded-md flex items-center justify-center text-xs select-none"
              style={{ backgroundColor: `${cat.color}18` }}
              title={cat.label}
            >
              {cat.emoji}
            </div>
          ))}
        </div>
      )}

      {/* ── Expanded state ── */}
      {!collapsed && (
        <>
          {/* Header */}
          <div className="px-3 pt-4 pb-2">
            <h2 className="text-xs font-bold text-neutral-200 tracking-wide uppercase mb-3">
              Blocks
            </h2>

            {/* Search bar */}
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search blocks..."
                className="
                  w-full pl-8 pr-3 py-1.5
                  text-[11px] text-neutral-300 placeholder-neutral-600
                  bg-white/[0.03] border border-neural-border rounded-lg
                  outline-none
                  focus:border-neural-accent/40 focus:bg-white/[0.05]
                  transition-colors duration-150
                "
              />
            </div>
          </div>

          {/* Block list */}
          <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1 scrollbar-thin">
            {totalResults === 0 && (
              <p className="text-[11px] text-neutral-600 text-center mt-8">
                No blocks match &ldquo;{search}&rdquo;
              </p>
            )}
            {CATEGORIES.map((cat) => (
              <CategorySection
                key={cat.key}
                label={cat.label}
                emoji={cat.emoji}
                color={cat.color}
                blocks={filteredByCategory.get(cat.key) ?? []}
                defaultOpen={!search} // collapse when searching to show only matches
              />
            ))}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-neural-border">
            <p className="text-[9px] text-neutral-600 text-center select-none">
              Drag a block onto the canvas to add it
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export const BlockPalette = memo(BlockPaletteInner);
