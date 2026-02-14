"use client";

// ---------------------------------------------------------------------------
// SoftmaxBlock — normalise logits to probabilities
// ---------------------------------------------------------------------------

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { BaseBlock } from "./BaseBlock";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

function SoftmaxBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  return (
    <BaseBlock
      id={id}
      blockType="Softmax"
      params={data?.params ?? {}}
      selected={!!selected}
    >
      <p className="text-[8px] text-neutral-600 font-mono">
        exp(xᵢ) / Σ exp(xⱼ)
      </p>
    </BaseBlock>
  );
}

export const SoftmaxBlock = memo(SoftmaxBlockComponent);
