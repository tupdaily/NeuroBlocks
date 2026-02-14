import { BlockPalette } from './components/BlockPalette';
import { PlaygroundCanvas } from './components/PlaygroundCanvas';
import { usePlayground } from './hooks/usePlayground';

export default function App() {
  const {
    blocks,
    connections,
    addBlock,
    addBlockAtDefault,
    moveBlock,
    portPress,
    selectedBlockId,
    pendingConnection,
    clearPlayground,
  } = usePlayground();

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">AI Playground</h1>
        <p className="subtitle">
          {pendingConnection
            ? "Now click another block's port to connect (output → input or input → output)"
            : 'Drag layers into the canvas or click to add • Click output then input to connect'}
        </p>
        <button type="button" className="clearBtn" onClick={clearPlayground}>
          Clear
        </button>
      </header>
      <div className="main">
        <BlockPalette onAddBlock={addBlockAtDefault} />
        <PlaygroundCanvas
          blocks={blocks}
          connections={connections}
          onMoveBlock={moveBlock}
          onPortPress={portPress}
          onDropBlock={addBlock}
          selectedBlockId={selectedBlockId}
          pendingConnection={pendingConnection}
        />
      </div>
    </div>
  );
}
