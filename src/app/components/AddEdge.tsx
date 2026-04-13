import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { Plus } from 'lucide-react';

export interface AddEdgeData {
  /** Called when the + button on this edge is clicked. */
  onAdd: () => void;
  [key: string]: unknown;
}

/**
 * Custom edge with an inline "+" button at the midpoint.
 * Clicking the button opens the add-step modal with the insertion
 * position set to this edge's position.
 */
export const AddEdge = memo(function AddEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const d = data as unknown as AddEdgeData;
  const edgeStyle = style ?? { stroke: '#cbd5e1', strokeWidth: 3 };
  const accent = (edgeStyle.stroke as string | undefined) ?? '#cbd5e1';

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={edgeStyle} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              d.onAdd();
            }}
            className="flex h-5 w-5 items-center justify-center rounded-full border-2 bg-fl-panel-2 shadow-md transition-all hover:scale-110"
            style={{ borderColor: accent, color: accent }}
            title="ここにステップを追加"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
