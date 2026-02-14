import type { BlockDef, Connection } from '../types/playground';
import { BLOCK_WIDTH, BLOCK_HEADER, PORT_SIZE } from './NodeBlock';

interface ConnectionLayerProps {
  connections: Connection[];
  blocks: BlockDef[];
}

function getPortCenter(block: BlockDef, port: 'input' | 'output'): { x: number; y: number } {
  const x = block.x + (port === 'output' ? BLOCK_WIDTH - PORT_SIZE / 2 - 12 : 12 + PORT_SIZE / 2);
  const y = block.y + (port === 'output' ? BLOCK_HEADER / 2 : BLOCK_HEADER + 20 + PORT_SIZE / 2);
  return { x, y };
}

function bezierPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = to.x - from.x;
  const cpx = from.x + Math.max(80, Math.abs(dx) * 0.5);
  const cpy = from.y;
  const cpx2 = to.x - Math.max(80, Math.abs(dx) * 0.5);
  const cpy2 = to.y;
  return `M ${from.x} ${from.y} C ${cpx} ${cpy}, ${cpx2} ${cpy2}, ${to.x} ${to.y}`;
}

export function ConnectionLayer({ connections, blocks }: ConnectionLayerProps) {
  const blockMap = new Map(blocks.map((b) => [b.id, b]));
  const paths: { path: string; key: string }[] = [];

  for (const conn of connections) {
    const fromBlock = blockMap.get(conn.fromBlockId);
    const toBlock = blockMap.get(conn.toBlockId);
    if (!fromBlock || !toBlock) continue;
    const from = getPortCenter(fromBlock, 'output');
    const to = getPortCenter(toBlock, 'input');
    paths.push({ path: bezierPath(from, to), key: conn.id });
  }

  if (paths.length === 0) return null;

  return (
    <svg className="connection-layer" style={{ overflow: 'visible' }}>
      {paths.map(({ path, key }) => (
        <path key={key} d={path} className="connection-path" />
      ))}
    </svg>
  );
}
