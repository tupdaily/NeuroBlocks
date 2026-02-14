"use client";

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { BaseBlock } from "./BaseBlock";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

function AddBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  return (
    <BaseBlock
      id={id}
      blockType="Add"
      params={data?.params ?? {}}
      selected={!!selected}
    />
  );
}

export const AddBlock = memo(AddBlockComponent);
