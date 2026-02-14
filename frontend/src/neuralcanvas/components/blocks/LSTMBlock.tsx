"use client";

// ---------------------------------------------------------------------------
// LSTMBlock — Long Short-Term Memory recurrent layer
// ---------------------------------------------------------------------------

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { BaseBlock } from "./BaseBlock";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

function LSTMBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  return (
    <BaseBlock
      id={id}
      blockType="LSTM"
      params={data?.params ?? {}}
      selected={!!selected}
    />
  );
}

export const LSTMBlock = memo(LSTMBlockComponent);
