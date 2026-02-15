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

const ACTIVATION_FORMULAS: Record<string, string> = {
  relu: "max(0, x)",
  gelu: "x·Φ(x)",
  sigmoid: "σ(x)",
  tanh: "tanh(x)",
  softmax: "softmax(x)",
};

function ActivationBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  const act = String(data?.params?.activation ?? "relu").toLowerCase();
  const formula = ACTIVATION_FORMULAS[act] ?? `${act}(x)`;
  return (
    <BaseBlock
      id={id}
      blockType="Activation"
      params={data?.params ?? {}}
      selected={!!selected}
    >
      <p className="text-[6px] text-neutral-500 font-mono whitespace-nowrap overflow-hidden text-ellipsis tabular-nums">
        {formula}
      </p>
    </BaseBlock>
  );
}

export const ActivationBlock = memo(ActivationBlockComponent);
