import { memo } from 'react';
import { getBezierPath, type EdgeProps } from '@xyflow/react';

/**
 * Custom edge for the Start → step → End exec chain.
 *
 * No arrow head — direction is communicated purely by motion:
 * small bright "energy packets" travel along the bezier path
 * from source to target at a steady pace, like Unity Bolt's
 * execution flow indicators.
 *
 * Layers (back to front):
 *   1. Wide translucent halo
 *   2. Crisp main stroke
 *   3. Three staggered glowing particles animated via <animateMotion>
 */
export const ExecEdge = memo(function ExecEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.45,
  });

  const main = selected ? '#f8fafc' : '#94a3b8';
  const halo = selected ? '#f8fafc' : '#64748b';
  const particle = selected ? '#ffffff' : '#e2e8f0';
  const pathId = `exec-path-${id}`;

  return (
    <>
      {/* Outer glow halo */}
      <path
        d={edgePath}
        fill="none"
        stroke={halo}
        strokeWidth={9}
        strokeOpacity={0.16}
        strokeLinecap="round"
      />

      {/* Main stroke — the exec wire itself */}
      <path
        id={pathId}
        d={edgePath}
        fill="none"
        stroke={main}
        strokeWidth={2}
        strokeOpacity={0.85}
        strokeLinecap="round"
      />

      {/* Flowing energy packets — three staggered particles along the path */}
      {[0, 0.66, 1.33].map((delay, i) => (
        <circle key={i} r={3.5} fill={particle} opacity={0.95}>
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.15;0.85;1"
            dur="2s"
            begin={`${delay}s`}
            repeatCount="indefinite"
          />
          <animateMotion
            dur="2s"
            begin={`${delay}s`}
            repeatCount="indefinite"
            rotate="auto"
          >
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      ))}
    </>
  );
});
