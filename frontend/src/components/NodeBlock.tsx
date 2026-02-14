import { useCallback, useRef, useState } from 'react';
import type { BlockDef, LayerKind } from '../types/playground';
import { LAYER_PALETTE } from '../types/playground';

export const PORT_SIZE = 24;
export const BLOCK_WIDTH = 140;
export const BLOCK_HEADER = 36;

function getBlockStyle(kind: LayerKind): { headerBg: string; borderColor: string; bodyBg: string } {
  const map: Record<LayerKind, { headerBg: string; borderColor: string; bodyBg: string }> = {
    input: { headerBg: '#2d4a6f', borderColor: '#3d6a9f', bodyBg: '#253a52' },
    output: { headerBg: '#4a6f2d', borderColor: '#6a9f3d', bodyBg: '#3a5225' },
    linear: { headerBg: '#5c3d8a', borderColor: '#7c5daa', bodyBg: '#4a2d6a' },
    conv2d: { headerBg: '#8a5c3d', borderColor: '#aa7c5d', bodyBg: '#6a4a2d' },
    layer_norm: { headerBg: '#3d6a8a', borderColor: '#5d8aaa', bodyBg: '#2d4a6a' },
    batch_norm: { headerBg: '#6a3d8a', borderColor: '#8a5daa', bodyBg: '#4a2d6a' },
    relu: { headerBg: '#8a6a2d', borderColor: '#aa8a4d', bodyBg: '#6a4a1d' },
    gelu: { headerBg: '#2d6a6a', borderColor: '#4d8a8a', bodyBg: '#1d4a4a' },
    dropout: { headerBg: '#6a4a2d', borderColor: '#8a6a4d', bodyBg: '#4a321d' },
    max_pool: { headerBg: '#4a4a6a', borderColor: '#6a6a8a', bodyBg: '#32324a' },
    adaptive_avg_pool: { headerBg: '#4a5a6a', borderColor: '#6a7a8a', bodyBg: '#323a4a' },
    flatten: { headerBg: '#5a4a6a', borderColor: '#7a6a8a', bodyBg: '#3a324a' },
  };
  return map[kind] ?? { headerBg: '#3d3d52', borderColor: '#5d5d72', bodyBg: '#2d2d3a' };
}

interface NodeBlockProps {
  block: BlockDef;
  onDrag: (id: string, dx: number, dy: number) => void;
  onPortPress: (blockId: string, port: 'input' | 'output') => void;
  isSelected?: boolean;
  pendingConnection?: { blockId: string; port: 'input' | 'output' } | null;
}

export function NodeBlock({ block, onDrag, onPortPress, isSelected, pendingConnection }: NodeBlockProps) {
  const paletteItem = LAYER_PALETTE.find((p) => p.kind === block.kind);
  const { headerBg, borderColor, bodyBg } = getBlockStyle(block.kind);
  const hasInput = block.kind !== 'input';
  const hasOutput = block.kind !== 'output';
  const [isDragging, setIsDragging] = useState(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.block-port')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    lastPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastPosRef.current.x;
      const dy = e.clientY - lastPosRef.current.y;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      onDrag(block.id, dx, dy);
    },
    [isDragging, block.id, onDrag]
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  }, []);

  return (
    <div
      className="node-block"
      style={{
        left: block.x,
        top: block.y,
        backgroundColor: bodyBg,
        borderColor: isSelected ? '#a0c8ff' : borderColor,
        borderWidth: isSelected ? 2 : 1.5,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <div
        className="node-block-header"
        style={{ backgroundColor: headerBg, borderBottomColor: borderColor }}
      >
        <span className="node-block-icon">{paletteItem?.icon ?? '?'}</span>
        <span className="node-block-label">{block.label}</span>
        {hasOutput && (
          <button
            type="button"
            className={`block-port block-port-output ${pendingConnection?.blockId === block.id && pendingConnection?.port === 'output' ? 'block-port-pending' : ''}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onPortPress(block.id, 'output');
            }}
            onClick={(e) => e.stopPropagation()}
            title="Output – click then click an input port to connect"
          />
        )}
      </div>
      <div className="node-block-body">
        {hasInput && (
          <button
            type="button"
            className={`block-port block-port-input ${pendingConnection?.blockId === block.id && pendingConnection?.port === 'input' ? 'block-port-pending' : ''}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onPortPress(block.id, 'input');
            }}
            onClick={(e) => e.stopPropagation()}
            title="Input – click to connect from another block's output"
          />
        )}
      </div>
    </div>
  );
}
