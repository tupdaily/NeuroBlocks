"use client";

// ---------------------------------------------------------------------------
// TextInputBlock — token IDs input for text/sequence models [B, seq_len]
// ---------------------------------------------------------------------------

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { BaseBlock } from "./BaseBlock";
import { useShapes } from "@/neuralcanvas/components/canvas/ShapeContext";
import { getShapeLabel } from "@/neuralcanvas/lib/shapeEngine";
import { CANVAS_UI_SCALE } from "@/neuralcanvas/lib/canvasConstants";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

const s = CANVAS_UI_SCALE;

function TextInputBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  const { shapes } = useShapes();
  const result = shapes.get(id);
  const outLabel = getShapeLabel(result?.outputShape ?? null);
  const batch = Number(data?.params?.batch_size ?? 1);
  const seqLen = Number(data?.params?.seq_len ?? 128);

  return (
    <BaseBlock
      id={id}
      blockType="TextInput"
      params={data?.params ?? {}}
      selected={!!selected}
    >
      <div className="space-y-px mt-0.5 leading-none">
        <div className="flex items-center justify-between gap-1">
          <span className="text-neutral-600 font-mono shrink-0" style={{ fontSize: `${7 * s}px` }}>out</span>
          <span className="font-mono text-amber-400/80 truncate min-w-0" style={{ fontSize: `${7 * s}px` }}>{outLabel}</span>
        </div>
        <p className="text-neutral-500 truncate" style={{ fontSize: `${6 * s}px` }}>
          [B, seq] → {batch}×{seqLen}
        </p>
      </div>
    </BaseBlock>
  );
}

export const TextInputBlock = memo(TextInputBlockComponent);
