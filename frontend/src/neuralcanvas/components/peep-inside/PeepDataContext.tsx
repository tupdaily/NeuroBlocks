"use client";

// ---------------------------------------------------------------------------
// PeepDataContext — stores per-block peep data received after training
// ---------------------------------------------------------------------------
//
// When training completes, the backend sends peep_data (weights, gradients,
// filters, activations) for each block. This context stores that data so
// usePeepInside can display real model internals instead of demo data.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PeepData } from "@/neuralcanvas/hooks/usePeepInside";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PeepDataContextValue {
  /** Per-block peep data from the last completed training run. */
  blockData: Map<string, PeepData>;
  /** Store peep data for all blocks (from training completion). */
  setPeepData: (data: Record<string, PeepData>) => void;
  /** Clear all peep data (e.g. when starting a new training run). */
  clearPeepData: () => void;
}

const PeepDataCtx = createContext<PeepDataContextValue>({
  blockData: new Map(),
  setPeepData: () => {},
  clearPeepData: () => {},
});

export function PeepDataProvider({ children }: { children: ReactNode }) {
  const [blockData, setBlockData] = useState<Map<string, PeepData>>(
    () => new Map(),
  );

  const setPeepData = useCallback((data: Record<string, PeepData>) => {
    const map = new Map<string, PeepData>();
    for (const [blockId, peepData] of Object.entries(data)) {
      map.set(blockId, {
        ...peepData,
        timestamp: Date.now(),
      });
    }
    setBlockData(map);
  }, []);

  const clearPeepData = useCallback(() => {
    setBlockData(new Map());
  }, []);

  const value = useMemo(
    () => ({ blockData, setPeepData, clearPeepData }),
    [blockData, setPeepData, clearPeepData],
  );

  return (
    <PeepDataCtx.Provider value={value}>{children}</PeepDataCtx.Provider>
  );
}

export function usePeepData() {
  return useContext(PeepDataCtx);
}
