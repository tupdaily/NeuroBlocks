"use client";

// ---------------------------------------------------------------------------
// PositionalEncodingBlock — adds sinusoidal positional encodings (Vaswani et al.)
// ---------------------------------------------------------------------------

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { BaseBlock } from "./BaseBlock";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

function PositionalEncodingBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  const dModel = Number(data?.params?.d_model ?? 128);
  const maxLen = Number(data?.params?.max_len ?? 512);

  return (
    <BaseBlock
      id={id}
      blockType="PositionalEncoding"
      params={data?.params ?? {}}
      selected={!!selected}
    >
      <p className="text-[8px] text-neutral-600 font-mono">
        d_model: {dModel} · max_len: {maxLen}
      </p>
    </BaseBlock>
  );
}

export const PositionalEncodingBlock = memo(PositionalEncodingBlockComponent);
