"use client";

// ---------------------------------------------------------------------------
// InputBlock — model input (output shape from graph; dataset chosen in Training panel)
// ---------------------------------------------------------------------------

import { memo } from "react";
import type { NodeProps } from "reactflow";
import { BaseBlock } from "./BaseBlock";
import { useShapes } from "@/components/canvas/ShapeContext";
import { getShapeLabel } from "@/lib/shapeEngine";

interface BlockData {
  params: Record<string, number | string>;
}

function InputBlockComponent({ id, data, selected }: NodeProps<BlockData>) {
  const { shapes } = useShapes();
  const result = shapes.get(id);
  const outLabel = getShapeLabel(result?.outputShape ?? null);

  return (
    <BaseBlock
      id={id}
      blockType="Input"
      params={data?.params ?? {}}
      selected={!!selected}
    >
      <div className="space-y-1 mt-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[8px] text-neutral-600 font-mono">output</span>
          <span className="text-[9px] font-mono text-amber-400/80">{outLabel}</span>
        </div>
        <p className="text-[8px] text-neutral-500 leading-relaxed">
          Dataset set in Training panel
        </p>
      </div>
    </BaseBlock>
  );
}

export const InputBlock = memo(InputBlockComponent);
