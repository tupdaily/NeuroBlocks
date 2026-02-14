"use client";

// ---------------------------------------------------------------------------
// ActivationBlock — non-linear activation function
// ---------------------------------------------------------------------------

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { BaseBlock } from "./BaseBlock";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

function ActivationBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  return (
    <BaseBlock
      id={id}
      blockType="Activation"
      params={data?.params ?? {}}
      selected={!!selected}
    >
      {/* Visual hint of the selected function */}
      <p className="text-[9px] text-neutral-500 font-mono">
        f(x) = {String(data?.params?.activation ?? "relu")}(x)
      </p>
    </BaseBlock>
  );
}

export const ActivationBlock = memo(ActivationBlockComponent);
