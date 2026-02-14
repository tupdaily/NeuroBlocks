"use client";

// ---------------------------------------------------------------------------
// PeepInsideModal — the X-ray view inside any neural-network block
// ---------------------------------------------------------------------------
//
// Expands from the block's position with Framer Motion. Shows tabbed views
// of weights, activations, gradients, and block-type-specific views
// (attention maps, conv filters).
// ---------------------------------------------------------------------------

import { memo, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  RefreshCw,
  Radio,
  Eye,
  Layers,
  Activity,
  BarChart3,
  Grid3X3,
  ScanEye,
} from "lucide-react";
import { BLOCK_REGISTRY, type BlockType } from "@/neuralcanvas/lib/blockRegistry";
import { getShapeLabel } from "@/neuralcanvas/lib/shapeEngine";
import { useShapes } from "@/neuralcanvas/components/canvas/ShapeContext";
import { usePeepInside } from "@/neuralcanvas/hooks/usePeepInside";
import { ICON_MAP } from "@/neuralcanvas/components/blocks/BaseBlock";
import { HeatmapViz } from "./HeatmapViz";
import { WeightHeatmap } from "./WeightHeatmap";
import { BarChartViz } from "./BarChartViz";
import { GradientFlowViz } from "./GradientFlowViz";
import { useGradientFlow } from "./GradientFlowContext";
import { ActivationHistogram } from "./ActivationHistogram";
import { AttentionHeatmap } from "./AttentionHeatmap";
import { FilterGrid } from "./FilterGrid";

// ---------------------------------------------------------------------------
// Tab system
// ---------------------------------------------------------------------------

interface TabDef {
  id: string;
  label: string;
  icon: typeof Layers;
}

function getTabsForBlockType(blockType: BlockType): TabDef[] {
  const base: TabDef[] = [
    { id: "weights", label: "Weights", icon: Layers },
    { id: "activations", label: "Activations", icon: Activity },
    { id: "gradients", label: "Gradients", icon: BarChart3 },
  ];

  if (blockType === "Attention") {
    base.push({ id: "attention", label: "Attention Map", icon: ScanEye });
  }
  if (blockType === "Conv2D") {
    base.push({ id: "filters", label: "Filters", icon: Grid3X3 });
  }

  return base;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PeepInsideModalProps {
  /** The block being inspected. */
  blockId: string;
  blockType: BlockType;
  /** Screen-space anchor position (where the block's eye icon is). */
  anchorX: number;
  anchorY: number;
  /** For Activation blocks, the specific function (e.g. "relu", "sigmoid"). */
  activationType?: string;
  /** Callback to close the modal. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function PeepInsideModalComponent({
  blockId,
  blockType,
  anchorX,
  anchorY,
  activationType,
  onClose,
}: PeepInsideModalProps) {
  const def = BLOCK_REGISTRY[blockType];
  const color = def?.color ?? "#6366f1";
  const Icon = def ? ICON_MAP[def.icon] : null;
  const { shapes } = useShapes();
  const result = shapes.get(blockId);
  const inLabel = getShapeLabel(result?.inputShape ?? null);
  const outLabel = getShapeLabel(result?.outputShape ?? null);

  const { data, loading, trained, live, refresh } = usePeepInside(
    blockId,
    blockType,
  );
  const { gradients: gradMap } = useGradientFlow();
  const gradientInfo = gradMap.get(blockId) ?? null;

  const tabs = useMemo(() => getTabsForBlockType(blockType), [blockType]);
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "weights");

  // Track previous weight tensor for smooth interpolation between frames.
  const prevWeightsRef = useRef(data?.weights ?? null);
  if (data?.weights && data.weights !== prevWeightsRef.current) {
    prevWeightsRef.current = data.weights;
  }

  // Panel position — anchor to block but keep on screen.
  const panelStyle = useMemo(() => {
    const w = 420;
    const h = 480;
    let x = anchorX + 20;
    let y = anchorY - 40;

    if (typeof window !== "undefined") {
      if (x + w > window.innerWidth - 16) x = anchorX - w - 20;
      if (y + h > window.innerHeight - 16) y = window.innerHeight - h - 16;
      if (y < 16) y = 16;
      if (x < 16) x = 16;
    }

    return { left: x, top: y, width: w };
  }, [anchorX, anchorY]);

  return (
    <AnimatePresence>
      {/* ── Backdrop ── */}
      <motion.div
        key="peep-backdrop"
        className="fixed inset-0 z-[100]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      />

      {/* ── Panel ── */}
      <motion.div
        key="peep-panel"
        className="fixed z-[101] flex flex-col rounded-2xl overflow-hidden border border-neural-border shadow-2xl"
        style={{
          ...panelStyle,
          backgroundColor: "rgba(11, 15, 26, 0.96)",
          backdropFilter: "blur(20px)",
          boxShadow: `0 0 40px ${color}15, 0 20px 60px rgba(0,0,0,0.6)`,
        }}
        initial={{
          opacity: 0,
          scale: 0.85,
          x: anchorX - (panelStyle.left ?? 0),
          y: anchorY - (panelStyle.top ?? 0),
        }}
        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{
          type: "spring",
          stiffness: 350,
          damping: 30,
          mass: 0.8,
        }}
      >
        {/* ══════════ Title bar ══════════ */}
        <div
          className="flex items-center gap-2.5 px-4 py-3 shrink-0"
          style={{
            background: `linear-gradient(135deg, ${color}18 0%, transparent 60%)`,
          }}
        >
          {/* Icon */}
          {Icon && (
            <div
              className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
              style={{ backgroundColor: `${color}20` }}
            >
              <Icon size={15} style={{ color }} />
            </div>
          )}

          {/* Title text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color }}>
                {def?.label ?? blockType}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-neutral-500 font-mono">
                {def?.category}
              </span>
            </div>
            <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
              {inLabel} → {outLabel}
            </div>
          </div>

          {/* Live indicator */}
          {live && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
              <Radio size={10} className="text-green-400 animate-pulse" />
              <span className="text-[9px] text-green-400 font-mono">LIVE</span>
            </div>
          )}

          {/* Step badge */}
          {data && (
            <span className="text-[9px] font-mono text-neutral-600 px-2 py-0.5 rounded bg-white/[0.03]">
              step {data.step}
            </span>
          )}

          {/* Refresh */}
          <button
            onClick={refresh}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.05] transition-colors"
            title="Refresh data"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.05] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* ══════════ Tab bar ══════════ */}
        <div className="flex px-4 gap-1 border-b border-neural-border shrink-0">
          {tabs.map((tab) => {
            const TabIcon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium
                  border-b-2 -mb-px transition-all duration-150
                  ${
                    active
                      ? "border-current text-white"
                      : "border-transparent text-neutral-500 hover:text-neutral-300"
                  }
                `}
                style={active ? { color } : undefined}
              >
                <TabIcon size={12} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ══════════ Content area ══════════ */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[300px]">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw
                  size={24}
                  className="animate-spin text-neutral-500"
                />
                <span className="text-[11px] text-neutral-500">
                  Loading block data...
                </span>
              </div>
            </div>
          )}

          {!loading && !data && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3 text-center">
                <Eye size={28} className="text-neutral-600" />
                <p className="text-[12px] text-neutral-500">No data available</p>
                <p className="text-[10px] text-neutral-600 max-w-[240px]">
                  Train the model to see what&apos;s happening inside this block.
                </p>
              </div>
            </div>
          )}

          {!loading && data && (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                {/* ── Weights tab ── */}
                {activeTab === "weights" && (
                  <div className="space-y-4">
                    {!trained && (
                      <NotTrainedBanner color={color} />
                    )}
                    {data.weights && (
                      <WeightHeatmap
                        tensor={data.weights}
                        prevTensor={prevWeightsRef.current}
                        accentColor={color}
                        label={`Weight matrix (${data.weights.shape.join("×")})`}
                        width={380}
                        height={200}
                      />
                    )}
                    {!data.weights && (
                      <EmptyState message="No weight data for this block type." />
                    )}
                  </div>
                )}

                {/* ── Activations tab ── */}
                {activeTab === "activations" && (
                  <div className="space-y-4">
                    {!trained && (
                      <NotTrainedBanner color={color} />
                    )}
                    {data.activations && (
                      <ActivationHistogram
                        tensor={data.activations}
                        accentColor={color}
                        label={`Activation distribution (${data.activations.data.length} values)`}
                        blockType={blockType}
                        activationType={activationType}
                      />
                    )}
                    {data.activations && (
                      <HeatmapViz
                        tensor={data.activations}
                        colorScheme="sequential"
                        accentColor={color}
                        label="Activation heatmap"
                        width={380}
                        height={60}
                      />
                    )}
                    {!data.activations && (
                      <EmptyState message="No activation data. Run a forward pass first." />
                    )}
                  </div>
                )}

                {/* ── Gradients tab ── */}
                {activeTab === "gradients" && (
                  <div className="space-y-4">
                    {!trained && (
                      <NotTrainedBanner color={color} />
                    )}
                    {(data.gradients && data.gradients.length > 0) || gradientInfo ? (
                      <GradientFlowViz
                        gradientInfo={gradientInfo}
                        rawGradients={data.gradients}
                        accentColor={color}
                        label="Gradient health"
                      />
                    ) : (
                      <EmptyState message="No gradient data. Run a backward pass first." />
                    )}
                  </div>
                )}

                {/* ── Attention Map tab (Attention blocks only) ── */}
                {activeTab === "attention" && (
                  <div className="space-y-4">
                    {!trained && (
                      <NotTrainedBanner color={color} />
                    )}
                    {data.attentionMap && (
                      <AttentionHeatmap
                        tensor={data.attentionMap}
                        accentColor={color}
                        label={`Attention weights (${data.attentionMap.shape.join("×")})`}
                        width={380}
                        height={240}
                      />
                    )}
                    {!data.attentionMap && (
                      <EmptyState message="No attention map data available." />
                    )}
                  </div>
                )}

                {/* ── Filters tab (Conv2D blocks only) ── */}
                {activeTab === "filters" && (
                  <div className="space-y-4">
                    {!trained && (
                      <NotTrainedBanner color={color} />
                    )}
                    {data.filters && (
                      <FilterGrid
                        tensor={data.filters}
                        featureMaps={data.activations}
                        accentColor={color}
                        label="Learned convolutional filters"
                      />
                    )}
                    {!data.filters && (
                      <EmptyState message="No filter data available." />
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* ══════════ Footer ══════════ */}
        <div className="px-4 py-2 border-t border-neural-border flex items-center justify-between shrink-0">
          <span className="text-[9px] text-neutral-600 font-mono">
            {blockId}
          </span>
          {data && (
            <span className="text-[9px] text-neutral-600 font-mono">
              {new Date(data.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function NotTrainedBanner({ color }: { color: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px]"
      style={{
        backgroundColor: `${color}08`,
        borderColor: `${color}20`,
        color: `${color}aa`,
      }}
    >
      <Eye size={12} className="shrink-0 opacity-50" />
      <span>
        Model not yet trained. Showing initial random weights. Train the model
        to see learned representations.
      </span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-[11px] text-neutral-600 text-center max-w-[240px]">
        {message}
      </p>
    </div>
  );
}

export const PeepInsideModal = memo(PeepInsideModalComponent);
