"use client";

// ---------------------------------------------------------------------------
// NormBlock — LayerNorm & BatchNorm (shared component)
// ---------------------------------------------------------------------------

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { BaseBlock } from "./BaseBlock";
import type { BlockType } from "@/neuralcanvas/lib/blockRegistry";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

// LayerNorm
function LayerNormBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  return (
    <BaseBlock
      id={id}
      blockType={"LayerNorm" as BlockType}
      params={data?.params ?? {}}
      selected={!!selected}
    />
  );
}

export const LayerNormBlock = memo(LayerNormBlockComponent);

// BatchNorm
function BatchNormBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  return (
    <BaseBlock
      id={id}
      blockType={"BatchNorm" as BlockType}
      params={data?.params ?? {}}
      selected={!!selected}
    />
  );
}

export const BatchNormBlock = memo(BatchNormBlockComponent);
