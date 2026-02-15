"use client";

// ---------------------------------------------------------------------------
// BlockPalette — left sidebar with draggable neural-network blocks
// ---------------------------------------------------------------------------
// Light theme design:
// - White sidebar, soft borders, clean typography
// - Each block is a white card with a left color accent bar
// - Essentials section for beginners, expandable "All Blocks" for power users
// - Friendly descriptions, hover tooltips with default settings
// ---------------------------------------------------------------------------

import { memo, useState, useCallback, useMemo, type DragEvent } from "react";
import {
  getAllBlockDefinitions,
  type BlockCategory,
  type BlockDefinition,
} from "@/neuralcanvas/lib/blockRegistry";
import {
  Inbox,
  Target,
  Type,
  Rows3,
  Grid3X3,
  RefreshCw,
  Focus,
  SlidersHorizontal,
  BarChart3,
  Zap,
  Shuffle,
  FoldHorizontal,
  Hash,
  MapPin,
  Percent,
  Upload,
  Monitor,
  PenTool,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  Layers,
  Wrench,
  Star,
  Minimize2,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  inbox: Inbox,
  target: Target,
  type: Type,
  "rows-3": Rows3,
  "grid-3x3": Grid3X3,
  "refresh-cw": RefreshCw,
  focus: Focus,
  "sliders-horizontal": SlidersHorizontal,
  "bar-chart-3": BarChart3,
  zap: Zap,
  shuffle: Shuffle,
  "fold-horizontal": FoldHorizontal,
  hash: Hash,
  "map-pin": MapPin,
  percent: Percent,
  "minimize-2": Minimize2,
  upload: Upload,
  monitor: Monitor,
  "pen-tool": PenTool,
};

const CATEGORIES: {
  key: BlockCategory;
  label: string;
  icon: LucideIcon;
  color: string;
}[] = [
  { key: "input", label: "Input", icon: Inbox, color: "var(--block-input)" },
  { key: "data", label: "Data", icon: Upload, color: "#D97706" },
  { key: "output", label: "Output", icon: Target, color: "var(--block-output)" },
  { key: "layer", label: "Layers", icon: Layers, color: "var(--block-layer)" },
  { key: "activation", label: "Activations", icon: Zap, color: "var(--block-activation)" },
  { key: "normalization", label: "Normalization", icon: SlidersHorizontal, color: "var(--block-norm)" },
  { key: "utility", label: "Utility", icon: Wrench, color: "var(--block-utility)" },
];

export const DRAG_BLOCK_TYPE = "application/neuralcanvas-block";

const ESSENTIAL_BLOCK_TYPES = new Set([
  "Input",
  "Output",
  "Linear",
  "Activation",
  "Flatten",
  "Dropout",
  "Softmax",
]);

const FRIENDLY_DESCRIPTIONS: Record<string, string> = {
  Input: "Choose a dataset for training. Connect Custom Data block for your own data.",
  InputSpace: "Upload images, tables, or text, or capture from webcam. Connect to Input for custom data.",
  Board: "Draw an image with your mouse. Resized to the set dimensions and sent to Input when connected.",
  TextInput: "Where your text data enters the model",
  Output: "Where predictions come out",
  Display: "LCD-style display for predictions. Shows no-signal static when nothing is connected.",
  Linear: "Connects neurons — the core building block",
  Conv2D: "Finds patterns in images like edges and shapes",
  MaxPool2D: "Shrinks image size by taking the max in 2D windows",
  MaxPool1D: "Shrinks sequence length by taking the max in 1D windows",
  LSTM: "Remembers patterns over time in sequences",
  Attention: "Lets the model focus on what matters most",
  Activation: "Adds non-linearity so the model can learn",
  Dropout: "Prevents over-memorization by randomly dropping neurons",
  Flatten: "Reshapes image data into a list of numbers",
  LayerNorm: "Stabilizes training by normalizing values",
  BatchNorm: "Speeds up training by normalizing across batches",
  Embedding: "Converts categories into meaningful numbers",
  TextEmbedding: "Converts words into meaningful vectors",
  PositionalEncoding: "Tells the model about word order",
  PositionalEmbedding: "Combines word meaning with position info",
  Softmax: "Converts numbers into probabilities",
  Add: "Combines two paths together (residual connection)",
  Concat: "Joins two data streams side by side",
};

// ---------------------------------------------------------------------------
// PaletteItem — single draggable block card
// ---------------------------------------------------------------------------

interface PaletteItemProps {
  def: BlockDefinition;
  isEssential?: boolean;
}

const PaletteItem = memo(function PaletteItem({ def, isEssential }: PaletteItemProps) {
  const Icon = ICON_MAP[def.icon];

  const onDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData(DRAG_BLOCK_TYPE, def.type);
      e.dataTransfer.effectAllowed = "move";
    },
    [def.type],
  );

  const friendlyDesc = FRIENDLY_DESCRIPTIONS[def.type] ?? def.description;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="
        group/item relative flex items-center gap-3
        px-3 py-2.5 rounded-xl cursor-grab
        bg-[var(--surface)] border border-[var(--border)]
        transition-all duration-150 select-none
        hover:shadow-md hover:border-[var(--border-strong)]
        active:cursor-grabbing active:scale-[0.97]
      "
    >
      {/* Colored left accent bar */}
      <div
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
        style={{ backgroundColor: def.color }}
      />

      {/* Icon */}
      {Icon && (
        <div
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg ml-1"
          style={{ backgroundColor: `${def.color}18` }}
        >
          <Icon size={15} style={{ color: def.color }} />
        </div>
      )}

      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[13px] font-semibold text-[var(--foreground)] truncate leading-tight">
            {def.label}
          </p>
          {isEssential && (
            <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
          )}
        </div>
        <p className="text-[11px] text-[var(--foreground-muted)] truncate leading-tight mt-0.5">
          {friendlyDesc}
        </p>
      </div>

      {/* Hover tooltip */}
      <div
        className="
          absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50
          hidden group-hover/item:block
          w-60 p-4 rounded-xl
          bg-[var(--surface)] border border-[var(--border)]
          shadow-lg
          pointer-events-none
        "
      >
        <p className="text-[13px] font-semibold text-[var(--foreground)] mb-1">
          {def.label}
        </p>
        <p className="text-[12px] text-[var(--foreground-secondary)] leading-relaxed mb-3">
          {friendlyDesc}
        </p>
        {Object.keys(def.defaultParams).length > 0 && (
          <>
            <p className="text-[11px] text-[var(--foreground-muted)] uppercase tracking-wider mb-1.5 font-medium">
              Default settings
            </p>
            <div className="space-y-1">
              {Object.entries(def.defaultParams).map(([k, v]) => (
                <div key={k} className="flex justify-between text-[12px]">
                  <span className="text-[var(--foreground-muted)] font-mono">{k}</span>
                  <span className="text-[var(--foreground-secondary)] font-mono">{String(v)}</span>
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
  icon: LucideIcon;
  color: string;
  blocks: BlockDefinition[];
  defaultOpen?: boolean;
}

const CategorySection = memo(function CategorySection({
  label,
  icon: Icon,
  color,
  blocks,
  defaultOpen = true,
}: CategorySectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (blocks.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="
          w-full flex items-center gap-2.5 px-3 py-2
          text-left transition-colors duration-100
          hover:bg-[var(--surface-hover)] rounded-lg
        "
      >
        <div
          className="w-1 h-4 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <Icon size={13} style={{ color }} className="shrink-0" />
        <span className="text-[12px] font-semibold text-[var(--foreground-secondary)] flex-1 select-none">
          {label}
        </span>
        <span className="text-[var(--foreground-muted)]">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>

      {open && (
        <div className="ml-1 mt-1 space-y-1.5">
          {blocks.map((def) => (
            <PaletteItem
              key={def.id}
              def={def}
              isEssential={ESSENTIAL_BLOCK_TYPES.has(def.type)}
            />
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
  const [showAllBlocks, setShowAllBlocks] = useState(false);
  const allDefs = useMemo(() => getAllBlockDefinitions(), []);

  const { essentials, advanced, filteredByCategory, totalResults } = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? allDefs.filter(
          (d) =>
            d.label.toLowerCase().includes(q) ||
            d.description.toLowerCase().includes(q) ||
            d.category.toLowerCase().includes(q) ||
            (FRIENDLY_DESCRIPTIONS[d.type] ?? "").toLowerCase().includes(q),
        )
      : allDefs;

    const essentials = filtered.filter((d) => ESSENTIAL_BLOCK_TYPES.has(d.type));
    const advanced = filtered.filter((d) => !ESSENTIAL_BLOCK_TYPES.has(d.type));

    const map = new Map<BlockCategory, BlockDefinition[]>();
    for (const cat of CATEGORIES) {
      map.set(cat.key, []);
    }
    for (const def of filtered) {
      map.get(def.category)?.push(def);
    }

    let count = 0;
    map.forEach((v) => (count += v.length));

    return { essentials, advanced, filteredByCategory: map, totalResults: count };
  }, [allDefs, search]);

  return (
    <div
      className={`
        relative h-full flex flex-col
        bg-[var(--surface)] border-r border-[var(--border)]
        transition-all duration-300 ease-in-out
        ${collapsed ? "w-12" : "w-[280px]"}
      `}
    >
      {/* Collapse / Expand toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="
          absolute -right-3 top-4 z-10
          w-6 h-6 rounded-full
          bg-[var(--surface)] border border-[var(--border)]
          flex items-center justify-center
          text-[var(--foreground-muted)] hover:text-[var(--accent)]
          shadow-md transition-colors duration-100
        "
        title={collapsed ? "Expand palette" : "Collapse palette"}
      >
        {collapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
      </button>

      {/* Collapsed state: icon strip */}
      {collapsed && (
        <div className="flex flex-col items-center gap-3 pt-14 px-1">
          {CATEGORIES.map((cat) => {
            const CatIcon = cat.icon;
            return (
              <div
                key={cat.key}
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `color-mix(in srgb, ${cat.color} 12%, transparent)` }}
                title={cat.label}
              >
                <CatIcon size={13} style={{ color: cat.color }} />
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded state */}
      {!collapsed && (
        <>
          {/* Header */}
          <div className="px-4 pt-5 pb-3">
            <h2 className="text-[13px] font-bold text-[var(--foreground)] tracking-wide uppercase mb-3">
              Building Blocks
            </h2>

            {/* Search */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)]"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search blocks..."
                className="
                  w-full pl-9 pr-3 py-2.5
                  text-[13px] text-[var(--foreground)] placeholder-[var(--foreground-muted)]
                  bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl
                  outline-none
                  focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]
                  transition-all duration-150
                "
              />
            </div>
          </div>

          {/* Block list */}
          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
            {totalResults === 0 && (
              <p className="text-[12px] text-[var(--foreground-muted)] text-center mt-8">
                No blocks match &ldquo;{search}&rdquo;
              </p>
            )}

            {search.trim() ? (
              CATEGORIES.map((cat) => (
                <CategorySection
                  key={cat.key}
                  label={cat.label}
                  icon={cat.icon}
                  color={cat.color}
                  blocks={filteredByCategory.get(cat.key) ?? []}
                  defaultOpen
                />
              ))
            ) : (
              <>
                {/* Essentials Section */}
                <div className="mb-3">
                  <div className="flex items-center gap-2 px-2 py-2">
                    <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                    <span className="text-[12px] font-bold text-[var(--foreground)] select-none">
                      Essentials
                    </span>
                    <span className="text-[11px] ml-auto bg-[var(--warning-muted)] text-[var(--warning)] px-2 py-0.5 rounded-full font-medium">Start here</span>
                  </div>
                  <div className="space-y-1.5">
                    {essentials.map((def) => (
                      <PaletteItem key={def.id} def={def} isEssential />
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div className="mx-2 my-3 border-t border-[var(--border)]" />

                {/* All Blocks (expandable) */}
                <button
                  onClick={() => setShowAllBlocks((s) => !s)}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <Layers className="h-3.5 w-3.5 text-[var(--foreground-muted)]" />
                  <span className="text-[12px] font-bold text-[var(--foreground-secondary)] flex-1 select-none">
                    All Blocks
                  </span>
                  <span className="text-[11px] text-[var(--foreground-muted)] bg-[var(--surface-elevated)] px-2 py-0.5 rounded-full mr-1 font-medium">
                    {advanced.length + essentials.length}
                  </span>
                  <span className="text-[var(--foreground-muted)]">
                    {showAllBlocks ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                </button>

                {showAllBlocks && (
                  <div className="mt-2 space-y-2">
                    {CATEGORIES.map((cat) => (
                      <CategorySection
                        key={cat.key}
                        label={cat.label}
                        icon={cat.icon}
                        color={cat.color}
                        blocks={filteredByCategory.get(cat.key) ?? []}
                        defaultOpen
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--surface-elevated)]">
            <p className="text-[11px] text-[var(--foreground-muted)] text-center select-none leading-relaxed">
              Drag blocks onto the canvas to build your model
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export const BlockPalette = memo(BlockPaletteInner);
