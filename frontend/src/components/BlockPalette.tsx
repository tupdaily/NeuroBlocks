import { LAYER_PALETTE } from '../types/playground';
import type { LayerKind } from '../types/playground';

const DRAG_TYPE = 'application/x-ai-playground-layer';

interface BlockPaletteProps {
  onAddBlock: (kind: LayerKind) => void;
}

export function BlockPalette({ onAddBlock }: BlockPaletteProps) {
  const handleDragStart = (e: React.DragEvent, kind: LayerKind) => {
    e.dataTransfer.setData(DRAG_TYPE, kind);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.dropEffect = 'copy';
  };

  return (
    <aside className="palette">
      <div className="palette-title">LAYERS</div>
      <p className="palette-hint">Drag into canvas or click to add</p>
      <div className="palette-scroll">
        {LAYER_PALETTE.map((item) => (
          <div
            key={item.kind}
            className="palette-block"
            draggable
            onDragStart={(e) => handleDragStart(e, item.kind)}
            onClick={() => onAddBlock(item.kind)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onAddBlock(item.kind);
              }
            }}
          >
            <span className="palette-block-icon">{item.icon}</span>
            <span className="palette-block-label">{item.label}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
