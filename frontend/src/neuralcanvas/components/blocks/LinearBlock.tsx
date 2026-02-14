"use client";

// ---------------------------------------------------------------------------
// LinearBlock — fully-connected dense layer
// ---------------------------------------------------------------------------

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { BaseBlock } from "./BaseBlock";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

function LinearBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  return (
    <BaseBlock
      id={id}
      blockType="Linear"
      params={data?.params ?? {}}
      selected={!!selected}
    />
  );
}

export const LinearBlock = memo(LinearBlockComponent);
