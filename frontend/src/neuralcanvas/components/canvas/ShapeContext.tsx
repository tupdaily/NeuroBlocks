"use client";

// ---------------------------------------------------------------------------
// ShapeContext — propagated tensor shapes available to every canvas component
// ---------------------------------------------------------------------------

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import type { Node, Edge } from "@xyflow/react";
import {
  propagateShapes,
  type ShapeResult,
  type ShapeNode,
  type ShapeEdge,
} from "@/neuralcanvas/lib/shapeEngine";

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

interface ShapeContextValue {
  /** Map from node ID → propagated shape result. */
  shapes: Map<string, ShapeResult>;
  /** Re-run propagation with the current graph. */
  recompute: (nodes: Node[], edges: Edge[]) => void;
}

const ShapeCtx = createContext<ShapeContextValue>({
  shapes: new Map(),
  recompute: () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ShapeProvider({ children }: { children: ReactNode }) {
  const [shapes, setShapes] = useState<Map<string, ShapeResult>>(new Map());

  const recompute = useCallback((nodes: Node[], edges: Edge[]) => {
    // Adapt React Flow nodes/edges to the minimal shape-engine interfaces.
    const shapeNodes: ShapeNode[] = nodes.map((n) => ({
      id: n.id,
      type: n.type ?? "Input",
      data: { params: (n.data?.params as Record<string, number | string>) ?? {} },
    }));
    const shapeEdges: ShapeEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));

    const result = propagateShapes(shapeNodes, shapeEdges);
    setShapes(result);
  }, []);

  const value = useMemo(() => ({ shapes, recompute }), [shapes, recompute]);

  return <ShapeCtx.Provider value={value}>{children}</ShapeCtx.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useShapes() {
  return useContext(ShapeCtx);
}
