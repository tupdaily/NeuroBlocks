export type LayerKind =
  | 'input'
  | 'linear'
  | 'conv2d'
  | 'layer_norm'
  | 'batch_norm'
  | 'relu'
  | 'gelu'
  | 'dropout'
  | 'max_pool'
  | 'adaptive_avg_pool'
  | 'flatten'
  | 'output';

export interface BlockDef {
  id: string;
  kind: LayerKind;
  label: string;
  x: number;
  y: number;
  params?: Record<string, number | string>;
}

export interface Connection {
  id: string;
  fromBlockId: string;
  toBlockId: string;
  fromPort: 'output';
  toPort: 'input';
}

export interface PlaygroundState {
  blocks: BlockDef[];
  connections: Connection[];
  nextBlockId: number;
  nextConnectionId: number;
}

export const LAYER_PALETTE: { kind: LayerKind; label: string; icon: string }[] = [
  { kind: 'input', label: 'Input', icon: '📥' },
  { kind: 'linear', label: 'Linear', icon: '▬' },
  { kind: 'conv2d', label: 'Conv2d', icon: '⊞' },
  { kind: 'layer_norm', label: 'LayerNorm', icon: '∥' },
  { kind: 'batch_norm', label: 'BatchNorm', icon: '⊟' },
  { kind: 'relu', label: 'ReLU', icon: '⚡' },
  { kind: 'gelu', label: 'GELU', icon: '◇' },
  { kind: 'dropout', label: 'Dropout', icon: '⋯' },
  { kind: 'max_pool', label: 'MaxPool', icon: '▾' },
  { kind: 'adaptive_avg_pool', label: 'AdaptiveAvgPool', icon: '▤' },
  { kind: 'flatten', label: 'Flatten', icon: '≡' },
  { kind: 'output', label: 'Output', icon: '📤' },
];
