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

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: '#3b82f6', strokeWidth: 2 }}
      />
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
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#3b82f6] bg-fl-panel-2 text-[#3b82f6] shadow-md transition-all hover:scale-110 hover:bg-[#3b82f6] hover:text-white"
            title="ここにステップを追加"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
