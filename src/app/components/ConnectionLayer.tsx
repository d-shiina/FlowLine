import { useEffect, useRef, useState } from 'react';
import type { Scenario } from '../types';

export interface DragLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Connection {
  id: string;
  fromBlockId: string;
  fromPort: string;
  toBlockId: string;
  toPort: string;
  color: string;
}

interface Props {
  scenario: Scenario;
  /** Container to query for [data-port-id] elements. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Width / height of the SVG canvas (matches the scrollable inner area). */
  width: number;
  height: number;
  /** Live drag line during connection creation. */
  dragLine: DragLine | null;
  /** Called when a connection's delete handle is clicked. */
  onDeleteConnection: (fromBlockId: string, fromPort: string, toBlockId: string, toPort: string) => void;
}

/**
 * SVG overlay that draws bezier curves between connected block ports.
 * Port positions are looked up from DOM elements with [data-port-id]
 * attributes so we don't duplicate layout logic.
 */
export function ConnectionLayer({
  scenario,
  containerRef,
  width,
  height,
  dragLine,
  onDeleteConnection,
}: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const rafRef = useRef<number | null>(null);

  // Recompute connection positions from DOM ports.
  const recompute = () => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;

    const ports = container.querySelectorAll<HTMLElement>('[data-port-id]');
    const portMap = new Map<string, { x: number; y: number; side: string }>();
    for (const el of ports) {
      const id = el.dataset.portId!;
      const side = el.dataset.portSide!;
      const rect = el.getBoundingClientRect();
      // Position relative to the container's top-left, accounting for scroll.
      portMap.set(id, {
        x: rect.left - containerRect.left + scrollLeft + rect.width / 2,
        y: rect.top - containerRect.top + scrollTop + rect.height / 2,
        side,
      });
    }

    // Walk all blocks and find inputs with kind='connection'.
    const conns: Connection[] = [];
    const allBlocks = [
      ...scenario.tracks.flatMap((t) => t.blocks.map((b) => ({ b, color: t.color }))),
      ...scenario.errorHandler.blocks.map((b) => ({ b, color: '#f43f5e' })),
    ];
    for (const { b: targetBlock, color } of allBlocks) {
      if (!targetBlock.inputs) continue;
      for (const [toPort, binding] of Object.entries(targetBlock.inputs)) {
        if (binding.kind !== 'connection') continue;
        const fromId = `${binding.fromBlockId}::out::${binding.fromPort}`;
        const toId = `${targetBlock.id}::in::${toPort}`;
        const fromPos = portMap.get(fromId);
        const toPos = portMap.get(toId);
        if (!fromPos || !toPos) continue;
        conns.push({
          id: `${binding.fromBlockId}.${binding.fromPort}->${targetBlock.id}.${toPort}`,
          fromBlockId: binding.fromBlockId,
          fromPort: binding.fromPort,
          toBlockId: targetBlock.id,
          toPort: toPort,
          color,
        });
        // Store positions on the connection
        (conns[conns.length - 1] as any).x1 = fromPos.x;
        (conns[conns.length - 1] as any).y1 = fromPos.y;
        (conns[conns.length - 1] as any).x2 = toPos.x;
        (conns[conns.length - 1] as any).y2 = toPos.y;
      }
    }
    setConnections(conns);
  };

  // Schedule recompute on next frame.
  const scheduleRecompute = () => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      recompute();
    });
  };

  // Recompute whenever the scenario changes or after layout.
  useEffect(() => {
    scheduleRecompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  // Recompute on container scroll / resize.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => scheduleRecompute();
    const ro = new ResizeObserver(scheduleRecompute);
    container.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(container);
    // Initial
    scheduleRecompute();
    return () => {
      container.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current]);

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={width}
      height={height}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <marker
          id="conn-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
        </marker>
      </defs>

      {/* Existing connections */}
      {connections.map((c) => {
        const cAny = c as Connection & { x1: number; y1: number; x2: number; y2: number };
        return (
          <ConnectionPath
            key={c.id}
            x1={cAny.x1}
            y1={cAny.y1}
            x2={cAny.x2}
            y2={cAny.y2}
            color="#6366f1"
            onDelete={() => onDeleteConnection(c.fromBlockId, c.fromPort, c.toBlockId, c.toPort)}
          />
        );
      })}

      {/* Drag line (live preview during connection creation) */}
      {dragLine && (
        <ConnectionPath
          x1={dragLine.x1}
          y1={dragLine.y1}
          x2={dragLine.x2}
          y2={dragLine.y2}
          color="#6366f1"
          dashed
        />
      )}
    </svg>
  );
}

function ConnectionPath({
  x1,
  y1,
  x2,
  y2,
  color,
  dashed,
  onDelete,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  dashed?: boolean;
  onDelete?: () => void;
}) {
  // Smooth bezier: control points offset horizontally based on distance.
  const dx = Math.abs(x2 - x1);
  const offset = Math.max(40, Math.min(dx * 0.5, 200));
  const path = `M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}`;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  return (
    <g style={{ pointerEvents: 'auto' }}>
      {/* Wide invisible path for easier hit testing */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: onDelete ? 'pointer' : 'default' }}
        onClick={() => onDelete?.()}
      />
      {/* Visible path */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dashed ? '4 3' : undefined}
        markerEnd="url(#conn-arrow)"
        style={{ pointerEvents: 'none' }}
      />
      {/* Delete handle (only on existing connections) */}
      {onDelete && (
        <g
          transform={`translate(${midX}, ${midY})`}
          className="opacity-0 hover:opacity-100"
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <circle r={7} fill="#1a1e27" stroke="#ef4444" strokeWidth={1.5} />
          <line x1={-3} y1={-3} x2={3} y2={3} stroke="#ef4444" strokeWidth={1.5} />
          <line x1={-3} y1={3} x2={3} y2={-3} stroke="#ef4444" strokeWidth={1.5} />
        </g>
      )}
    </g>
  );
}
