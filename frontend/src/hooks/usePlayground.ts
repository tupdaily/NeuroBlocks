import { useCallback, useState } from 'react';
import type { LayerKind, PlaygroundState } from '../types/playground';
import { LAYER_PALETTE } from '../types/playground';

const initialState: PlaygroundState = {
  blocks: [],
  connections: [],
  nextBlockId: 1,
  nextConnectionId: 1,
};

export function usePlayground() {
  const [state, setState] = useState<PlaygroundState>(initialState);
  const [pendingConnection, setPendingConnection] = useState<{
    blockId: string;
    port: 'input' | 'output';
  } | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const addBlock = useCallback((kind: LayerKind, x: number, y: number) => {
    const label = LAYER_PALETTE.find((p) => p.kind === kind)?.label ?? kind;
    setState((s) => ({
      ...s,
      blocks: [
        ...s.blocks,
        {
          id: `block-${s.nextBlockId}`,
          kind,
          label,
          x,
          y,
        },
      ],
      nextBlockId: s.nextBlockId + 1,
    }));
  }, []);

  const addBlockAtDefault = useCallback((kind: LayerKind) => {
    setState((s) => {
      const n = s.blocks.length;
      const x = 120 + (n % 4) * 180;
      const y = 100 + Math.floor(n / 4) * 80;
      const label = LAYER_PALETTE.find((p) => p.kind === kind)?.label ?? kind;
      return {
        ...s,
        blocks: [
          ...s.blocks,
          {
            id: `block-${s.nextBlockId}`,
            kind,
            label,
            x,
            y,
          },
        ],
        nextBlockId: s.nextBlockId + 1,
      };
    });
  }, []);

  const moveBlock = useCallback((id: string, dx: number, dy: number) => {
    setState((s) => ({
      ...s,
      blocks: s.blocks.map((b) =>
        b.id === id ? { ...b, x: b.x + dx, y: b.y + dy } : b
      ),
    }));
  }, []);

  const removeBlock = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      blocks: s.blocks.filter((b) => b.id !== id),
      connections: s.connections.filter(
        (c) => c.fromBlockId !== id && c.toBlockId !== id
      ),
    }));
    if (selectedBlockId === id) setSelectedBlockId(null);
  }, [selectedBlockId]);

  const portPress = useCallback(
    (blockId: string, port: 'input' | 'output') => {
      if (!pendingConnection) {
        setPendingConnection({ blockId, port });
        setSelectedBlockId(blockId);
        return;
      }
      const { blockId: otherId, port: otherPort } = pendingConnection;
      if (otherId === blockId) {
        setPendingConnection(null);
        return;
      }
      if (otherPort === 'output' && port === 'input') {
        setState((s) => ({
          ...s,
          connections: [
            ...s.connections,
            {
              id: `conn-${s.nextConnectionId}`,
              fromBlockId: otherId,
              toBlockId: blockId,
              fromPort: 'output',
              toPort: 'input',
            },
          ],
          nextConnectionId: s.nextConnectionId + 1,
        }));
      } else if (otherPort === 'input' && port === 'output') {
        setState((s) => ({
          ...s,
          connections: [
            ...s.connections,
            {
              id: `conn-${s.nextConnectionId}`,
              fromBlockId: blockId,
              toBlockId: otherId,
              fromPort: 'output',
              toPort: 'input',
            },
          ],
          nextConnectionId: s.nextConnectionId + 1,
        }));
      }
      setPendingConnection(null);
      setSelectedBlockId(blockId);
    },
    [pendingConnection]
  );

  const clearPlayground = useCallback(() => {
    setState(initialState);
    setPendingConnection(null);
    setSelectedBlockId(null);
  }, []);

  return {
    blocks: state.blocks,
    connections: state.connections,
    addBlock,
    addBlockAtDefault,
    moveBlock,
    removeBlock,
    portPress,
    pendingConnection,
    selectedBlockId,
    setSelectedBlockId,
    clearPlayground,
  };
}
