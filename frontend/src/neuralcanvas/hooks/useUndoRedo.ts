"use client";

// ---------------------------------------------------------------------------
// useUndoRedo — simple state-history stack for React Flow nodes & edges
// ---------------------------------------------------------------------------

import { useCallback, useRef } from "react";
import type { Node, Edge } from "@xyflow/react";

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY = 50;

/**
 * Provides undo / redo over React Flow graph state.
 *
 * Call `takeSnapshot(nodes, edges)` after every user-initiated mutation.
 * Call `undo()` / `redo()` from keyboard handlers; they return the restored
 * snapshot (or `null` if there is nothing to undo/redo).
 */
export function useUndoRedo() {
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);

  /** Deep-clone a snapshot so mutations don't corrupt history. */
  const clone = (s: Snapshot): Snapshot => ({
    nodes: structuredClone(s.nodes),
    edges: structuredClone(s.edges),
  });

  /** Record the current state before a mutation happens. */
  const takeSnapshot = useCallback((nodes: Node[], edges: Edge[]) => {
    past.current = [
      ...past.current.slice(-MAX_HISTORY),
      clone({ nodes, edges }),
    ];
    // Any new action invalidates the redo stack.
    future.current = [];
  }, []);

  /** Step backward. Returns the previous snapshot or null. */
  const undo = useCallback(
    (currentNodes: Node[], currentEdges: Edge[]): Snapshot | null => {
      const prev = past.current.pop();
      if (!prev) return null;
      // Push current state onto redo stack.
      future.current.push(clone({ nodes: currentNodes, edges: currentEdges }));
      return clone(prev);
    },
    [],
  );

  /** Step forward. Returns the next snapshot or null. */
  const redo = useCallback(
    (currentNodes: Node[], currentEdges: Edge[]): Snapshot | null => {
      const next = future.current.pop();
      if (!next) return null;
      // Push current state onto undo stack.
      past.current.push(clone({ nodes: currentNodes, edges: currentEdges }));
      return clone(next);
    },
    [],
  );

  const canUndo = useCallback(() => past.current.length > 0, []);
  const canRedo = useCallback(() => future.current.length > 0, []);

  return { takeSnapshot, undo, redo, canUndo, canRedo };
}
