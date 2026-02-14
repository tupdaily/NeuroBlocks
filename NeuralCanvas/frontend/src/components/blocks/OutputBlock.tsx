"use client";

// ---------------------------------------------------------------------------
// OutputBlock — sink for model output (logits, loss, etc.)
// ---------------------------------------------------------------------------

import { memo } from "react";
import type { NodeProps } from "reactflow";
import { BaseBlock } from "./BaseBlock";
import { useShapes } from "@/components/canvas/ShapeContext";
import { getShapeLabel } from "@/lib/shapeEngine";

interface BlockData {
  params: Record<string, number | string>;
}

function OutputBlockComponent({ id, data, selected }: NodeProps<BlockData>) {
  const { shapes } = useShapes();
  const result = shapes.get(id);
  const inLabel = getShapeLabel(result?.inputShape ?? null);

  return (
    <BaseBlock
      id={id}
      blockType="Output"
      params={data?.params ?? {}}
      selected={!!selected}
    >
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[8px] text-neutral-600 font-mono">input</span>
        <span className="text-[9px] font-mono text-emerald-400/80">{inLabel}</span>
      </div>
    </BaseBlock>
  );
}

export const OutputBlock = memo(OutputBlockComponent);
