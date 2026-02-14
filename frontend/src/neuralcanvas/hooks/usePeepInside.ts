"use client";

// ---------------------------------------------------------------------------
// usePeepInside — WebSocket-backed hook for fetching block internals
// ---------------------------------------------------------------------------
//
// When opened, sends a WS message requesting the current state for a block.
// During training, the backend pushes updates every N steps.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { BlockType } from "@/neuralcanvas/lib/blockRegistry";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A flat 2-D array of numbers (row-major). */
export interface TensorSlice {
  data: number[];
  shape: number[];
}

/** Per-block inspection payload returned by the backend. */
export interface PeepData {
  blockId: string;
  blockType: BlockType;
  /** Current training step (0 when not yet trained). */
  step: number;
  /** Weight matrix snapshot (first 2-D slice). */
  weights: TensorSlice | null;
  /** Activation values from last forward pass. */
  activations: TensorSlice | null;
  /** Gradient norms per parameter. */
  gradients: { name: string; norm: number }[] | null;
  /** Attention probability matrix [heads, seq, seq] — only for Attention blocks. */
  attentionMap: TensorSlice | null;
  /** Conv filter thumbnails [out_channels, H, W] — only for Conv2D blocks. */
  filters: TensorSlice | null;
  /** Timestamp of this snapshot. */
  timestamp: number;
}

/** The shape of the hook's return value. */
export interface UsePeepInsideReturn {
  /** The most recent data, or null while loading / before training. */
  data: PeepData | null;
  /** Whether we are currently waiting for the first response. */
  loading: boolean;
  /** Whether the model has been trained (step > 0). */
  trained: boolean;
  /** Whether we are receiving live updates during training. */
  live: boolean;
  /** Latest error, if any. */
  error: string | null;
  /** Manually request a refresh. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Placeholder / demo data generator
// ---------------------------------------------------------------------------
// Until the real backend WebSocket endpoint is built, this generates
// realistic-looking fake data so the UI can be fully developed and tested.

function generateDemoData(blockId: string, blockType: BlockType): PeepData {
  const rng = () => Math.random() * 2 - 1; // [-1, 1]
  const rngPos = () => Math.random();

  const step = 0; // Not trained yet — UI shows "awaiting training" state.

  // Weights: 16x16 heatmap sample.
  const wSize = 16;
  const weights: TensorSlice = {
    data: Array.from({ length: wSize * wSize }, rng),
    shape: [wSize, wSize],
  };

  // Activations: 1x32 vector.
  const aSize = 32;
  const activations: TensorSlice = {
    data: Array.from({ length: aSize }, rng),
    shape: [1, aSize],
  };

  // Gradients.
  const gradients = [
    { name: "weight", norm: rngPos() * 0.5 },
    { name: "bias", norm: rngPos() * 0.1 },
  ];

  // Attention map (only for Attention): 4 heads, 8x8.
  const attentionMap: TensorSlice | null =
    blockType === "Attention"
      ? {
          data: Array.from({ length: 4 * 8 * 8 }, rngPos),
          shape: [4, 8, 8],
        }
      : null;

  // Filters (only for Conv2D): 8 filters, 3x3.
  const filters: TensorSlice | null =
    blockType === "Conv2D"
      ? {
          data: Array.from({ length: 8 * 3 * 3 }, rng),
          shape: [8, 3, 3],
        }
      : null;

  return {
    blockId,
    blockType,
    step,
    weights,
    activations,
    gradients,
    attentionMap,
    filters,
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const BACKEND_WS =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "ws://localhost:8000/ws/peep")
    : "";

export function usePeepInside(
  blockId: string | null,
  blockType: BlockType | null,
): UsePeepInsideReturn {
  const [data, setData] = useState<PeepData | null>(null);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // ── Connect / disconnect based on blockId ──
  useEffect(() => {
    if (!blockId || !blockType) {
      setData(null);
      setLoading(false);
      setLive(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Try WebSocket connection to real backend.
    let cancelled = false;

    try {
      const ws = new WebSocket(BACKEND_WS);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "subscribe", blockId, blockType }));
      };

      ws.onmessage = (evt) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse(evt.data) as PeepData;
          setData(payload);
          setLoading(false);
          setLive(payload.step > 0);
        } catch {
          // Malformed message — ignore.
        }
      };

      ws.onerror = () => {
        if (cancelled) return;
        // Fallback to demo data when backend is unavailable.
        setData(generateDemoData(blockId, blockType));
        setLoading(false);
        setLive(false);
        setError(null); // Don't show error — demo mode is fine.
      };

      ws.onclose = () => {
        if (cancelled) return;
        setLive(false);
        // If we never got data, generate demo data.
        setData((prev) => prev ?? generateDemoData(blockId, blockType));
        setLoading(false);
      };
    } catch {
      // WebSocket constructor can throw in some SSR scenarios.
      setData(generateDemoData(blockId, blockType));
      setLoading(false);
    }

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [blockId, blockType]);

  // ── Manual refresh ──
  const refresh = useCallback(() => {
    if (!blockId || !blockType) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "refresh", blockId }));
    } else {
      // Regenerate demo data.
      setData(generateDemoData(blockId, blockType));
    }
  }, [blockId, blockType]);

  const trained = (data?.step ?? 0) > 0;

  return { data, loading, trained, live, error, refresh };
}
