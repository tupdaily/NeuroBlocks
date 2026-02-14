"use client";

// ---------------------------------------------------------------------------
// PeepInsideContext — manages which block (if any) has its modal open
// ---------------------------------------------------------------------------

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import type { BlockType } from "@/lib/blockRegistry";

interface PeepTarget {
  blockId: string;
  blockType: BlockType;
  anchorX: number;
  anchorY: number;
  /** For Activation blocks, the specific activation function (e.g. "relu"). */
  activationType?: string;
}

interface PeepInsideContextValue {
  /** The currently open target, or null. */
  target: PeepTarget | null;
  /** Open the peep-inside modal for a block. */
  open: (target: PeepTarget) => void;
  /** Close the modal. */
  close: () => void;
}

const PeepCtx = createContext<PeepInsideContextValue>({
  target: null,
  open: () => {},
  close: () => {},
});

export function PeepInsideProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<PeepTarget | null>(null);

  const open = useCallback((t: PeepTarget) => setTarget(t), []);
  const close = useCallback(() => setTarget(null), []);

  const value = useMemo(() => ({ target, open, close }), [target, open, close]);

  return <PeepCtx.Provider value={value}>{children}</PeepCtx.Provider>;
}

export function usePeepInsideContext() {
  return useContext(PeepCtx);
}
