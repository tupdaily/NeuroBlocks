import { useEffect, useRef, useState } from 'react';
import { NodeBlock, BLOCK_WIDTH } from './NodeBlock';
import { ConnectionLayer } from './ConnectionLayer';
import type { BlockDef, Connection } from '../types/playground';
import type { LayerKind } from '../types/playground';

const CANVAS_PADDING = 800;
const DRAG_TYPE = 'application/x-ai-playground-layer';

interface PlaygroundCanvasProps {
  blocks: BlockDef[];
  connections: Connection[];
  onMoveBlock: (id: string, dx: number, dy: number) => void;
  onPortPress: (blockId: string, port: 'input' | 'output') => void;
  onDropBlock: (kind: LayerKind, x: number, y: number) => void;
  selectedBlockId: string | null;
  pendingConnection: { blockId: string; port: 'input' | 'output' } | null;
}


export function PlaygroundCanvas({
  blocks,
  connections,
  onMoveBlock,
  onPortPress,
  onDropBlock,
  selectedBlockId,
  pendingConnection,
}: PlaygroundCanvasProps) {
  const canvasWidth = typeof window !== 'undefined' ? window.innerWidth + CANVAS_PADDING * 2 : 2400;
  const canvasHeight = typeof window !== 'undefined' ? window.innerHeight + CANVAS_PADDING * 2 : 1600;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollLeft = CANVAS_PADDING;
      el.scrollTop = CANVAS_PADDING;
    }
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    setIsDragOver(false);
    const kind = e.dataTransfer.getData(DRAG_TYPE) as LayerKind | '';
    if (!kind) return;
    e.preventDefault();
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const rect = scrollEl.getBoundingClientRect();
    const x = scrollEl.scrollLeft + (e.clientX - rect.left) - BLOCK_WIDTH / 2;
    const y = scrollEl.scrollTop + (e.clientY - rect.top) - 20;
    onDropBlock(kind as LayerKind, Math.max(0, x), Math.max(0, y));
  };

  return (
    <div
      ref={scrollRef}
      className={`canvas-scroll ${isDragOver ? 'canvas-scroll-dragover' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="canvas"
        style={{ width: canvasWidth, height: canvasHeight }}
      >
        <div className="canvas-connections">
          <ConnectionLayer connections={connections} blocks={blocks} />
        </div>
        <div className="canvas-blocks">
          {blocks.map((block) => (
            <NodeBlock
              key={block.id}
              block={block}
              onDrag={onMoveBlock}
              onPortPress={onPortPress}
              isSelected={selectedBlockId === block.id}
              pendingConnection={pendingConnection}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
