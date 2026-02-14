"use client";

// ---------------------------------------------------------------------------
// GradientFlowContext — global gradient-health state for the entire canvas
// ---------------------------------------------------------------------------
//
// Stores per-block gradient health (healthy / vanishing / exploding) and an
// "enabled" toggle so the canvas glow overlay can be turned on/off.
//
// The context is populated from usePeepInside data or (eventually) from
// a global training WebSocket that streams gradient norms for all blocks.
// For now we provide a demo data seeder + manual update API.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GradientHealth = "healthy" | "vanishing" | "exploding" | "unknown";

export interface GradientInfo {
  /** Overall health classification for this block. */
  health: GradientHealth;
  /** Average gradient norm (L2). */
  norm: number;
  /** History of norms over training steps (for the mini line chart). */
  normHistory: number[];
  /** Per-parameter breakdown. */
  params: { name: string; norm: number; health: GradientHealth }[];
}

export function classifyGradient(norm: number): GradientHealth {
  if (norm < 1e-5) return "vanishing";
  if (norm > 10) return "exploding";
  if (norm >= 1e-3 && norm <= 1) return "healthy";
  // Between 1e-5 and 1e-3, or between 1 and 10 → still somewhat ok / warning
  return "healthy";
}

export function classifyGradientDetailed(norm: number): GradientHealth {
  if (norm < 1e-5) return "vanishing";
  if (norm > 10) return "exploding";
  if (norm >= 1e-3 && norm <= 1) return "healthy";
  // Between 1e-5 and 1e-3 — weak but not dead
  if (norm < 1e-3) return "vanishing";
  // Between 1 and 10 — large but not explosive
  return "exploding";
}

/** Map health status to a glow colour. */
export function healthToColor(health: GradientHealth): string {
  switch (health) {
    case "healthy":
      return "#22c55e"; // green
    case "vanishing":
      return "#ef4444"; // red
    case "exploding":
      return "#3b82f6"; // blue
    default:
      return "transparent";
  }
}

/** Map health to bar-chart fill. */
export function healthToBarColor(norm: number): string {
  if (norm < 1e-5) return "#ef4444";    // red — vanishing
  if (norm < 1e-3) return "#f59e0b";    // yellow — small
  if (norm <= 1) return "#22c55e";      // green — healthy
  if (norm <= 10) return "#f59e0b";     // yellow — large
  return "#3b82f6";                      // blue — exploding
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface GradientFlowContextValue {
  /** Whether the gradient flow overlay is visible on the canvas. */
  enabled: boolean;
  /** Toggle the overlay. */
  setEnabled: (v: boolean) => void;
  /** Per-block gradient info map. */
  gradients: Map<string, GradientInfo>;
  /** Update gradient info for a specific block. */
  updateBlock: (blockId: string, info: GradientInfo) => void;
  /** Bulk-update from a training step. */
  updateAll: (data: Map<string, GradientInfo>) => void;
  /** Seed demo data for all given block IDs. */
  seedDemo: (blockIds: string[]) => void;
}

const GradientFlowCtx = createContext<GradientFlowContextValue>({
  enabled: false,
  setEnabled: () => {},
  gradients: new Map(),
  updateBlock: () => {},
  updateAll: () => {},
  seedDemo: () => {},
});

export function GradientFlowProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [gradients, setGradients] = useState<Map<string, GradientInfo>>(
    () => new Map(),
  );

  const updateBlock = useCallback((blockId: string, info: GradientInfo) => {
    setGradients((prev) => {
      const next = new Map(prev);
      next.set(blockId, info);
      return next;
    });
  }, []);

  const updateAll = useCallback((data: Map<string, GradientInfo>) => {
    setGradients(data);
  }, []);

  const seedDemo = useCallback((blockIds: string[]) => {
    const map = new Map<string, GradientInfo>();
    blockIds.forEach((id) => {
      const norm = Math.pow(10, Math.random() * 6 - 5); // 1e-5 to 10
      const health = classifyGradient(norm);
      const histLen = 20;
      const normHistory: number[] = [];
      let cur = norm * 0.3;
      for (let i = 0; i < histLen; i++) {
        cur += (norm - cur) * 0.1 + (Math.random() - 0.5) * norm * 0.2;
        normHistory.push(Math.max(0, cur));
      }
      map.set(id, {
        health,
        norm,
        normHistory,
        params: [
          { name: "weight", norm: norm * (0.8 + Math.random() * 0.4), health: classifyGradient(norm * 0.9) },
          { name: "bias", norm: norm * (0.1 + Math.random() * 0.3), health: classifyGradient(norm * 0.2) },
        ],
      });
    });
    setGradients(map);
  }, []);

  const value = useMemo(
    () => ({ enabled, setEnabled, gradients, updateBlock, updateAll, seedDemo }),
    [enabled, setEnabled, gradients, updateBlock, updateAll, seedDemo],
  );

  return (
    <GradientFlowCtx.Provider value={value}>
      {children}
    </GradientFlowCtx.Provider>
  );
}

export function useGradientFlow() {
  return useContext(GradientFlowCtx);
}
