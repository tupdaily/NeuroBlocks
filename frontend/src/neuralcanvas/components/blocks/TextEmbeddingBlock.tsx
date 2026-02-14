"use client";

// ---------------------------------------------------------------------------
// TextEmbeddingBlock — token embeddings; shapes align with Text Input and Positional Embedding
// ---------------------------------------------------------------------------

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { BaseBlock } from "./BaseBlock";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

function TextEmbeddingBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  const vocab = Number(data?.params?.vocab_size ?? 10000);
  const dim = Number(data?.params?.embedding_dim ?? 128);
  const totalParams = vocab * dim;

  return (
    <BaseBlock
      id={id}
      blockType="TextEmbedding"
      params={data?.params ?? {}}
      selected={!!selected}
    >
      <p className="text-[8px] text-neutral-600 font-mono">
        vocab: {vocab.toLocaleString()} × dim: {dim} = {totalParams.toLocaleString()} params
      </p>
    </BaseBlock>
  );
}

export const TextEmbeddingBlock = memo(TextEmbeddingBlockComponent);
