"use client";

// ---------------------------------------------------------------------------
// Conv2DBlock — 2D convolutional layer
// ---------------------------------------------------------------------------

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { BaseBlock } from "./BaseBlock";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

function Conv2DBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  return (
    <BaseBlock
      id={id}
      blockType="Conv2D"
      params={data?.params ?? {}}
      selected={!!selected}
    />
  );
}

export const Conv2DBlock = memo(Conv2DBlockComponent);
