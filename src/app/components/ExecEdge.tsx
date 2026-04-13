import { memo } from 'react';
import { getBezierPath, type EdgeProps } from '@xyflow/react';

/**
 * Custom edge for the Start → step → End exec chain.
 *
 * Visual recipe (Unity Bolt / Unreal Blueprint inspired):
 *   1. Outer "glow" path — thick, very translucent
 *   2. Main stroke — crisp, solid
 *   3. Animated "flow" dash — subtle stripes moving along the wire
 *      so it feels alive even when the scenario is not running
 *   4. Arrow marker at the target end
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

  const main = selected ? '#f8fafc' : '#cbd5e1';
  const glow = selected ? '#f8fafc' : '#94a3b8';
  const arrowId = `exec-arrow-${id}`;

  return (
    <>
      <defs>
        <marker
          id={arrowId}
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 12 6 L 0 12 z" fill={main} />
        </marker>
      </defs>

      {/* Outer glow halo */}
      <path
        d={edgePath}
        fill="none"
        stroke={glow}
        strokeWidth={10}
        strokeOpacity={0.18}
        strokeLinecap="round"
      />

      {/* Main stroke */}
      <path
        d={edgePath}
        fill="none"
        stroke={main}
        strokeWidth={2.5}
        strokeLinecap="round"
        markerEnd={`url(#${arrowId})`}
      />

      {/* Animated flow stripes — slow drift so it feels alive */}
      <path
        d={edgePath}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.35}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="4 14"
        style={{ animation: 'exec-flow 2s linear infinite' }}
      />
    </>
  );
});
