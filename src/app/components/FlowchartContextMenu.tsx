import { ContextMenu } from '@base-ui/react/context-menu';

interface Props {
  children: React.ReactNode;
  /** IDs of currently selected steps. */
  selectedIds: string[];
  /** Whether any selected step is in the main flow. */
  hasFlowSteps: boolean;
  /** Whether any selected step is in the free area. */
  hasFreeSteps: boolean;
  /** Whether exactly one group is selected. */
  isGroupSelected: boolean;
  onGroup: () => void;
  onUngroup: () => void;
  onMoveToFree: () => void;
  onMoveToFlow: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRunStep?: () => void;
  onRunFromHere?: () => void;
  onRunBlock?: () => void;
  /** Whether execution is currently running. */
  running?: boolean;
}

const itemClass =
  'flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 font-mono text-[11px] text-fl-text-muted outline-none data-[highlighted]:bg-[#3b82f620] data-[highlighted]:text-fl-text';
const separatorClass = 'my-1 h-px bg-fl-border';

export function FlowchartContextMenu({
  children,
  selectedIds,
  hasFlowSteps,
  hasFreeSteps,
  isGroupSelected,
  onGroup,
  onUngroup,
  onMoveToFree,
  onMoveToFlow,
  onDuplicate,
  onDelete,
  onRunStep,
  onRunFromHere,
  onRunBlock,
  running,
}: Props) {
  const hasSelection = selectedIds.length > 0;
  const singleSelected = selectedIds.length === 1;
  const multiSelected = selectedIds.length > 1;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger className="contents">{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner sideOffset={4} className="z-[300] outline-none">
          <ContextMenu.Popup className="min-w-[180px] rounded-lg border border-fl-border-strong bg-fl-modal py-1 shadow-2xl outline-none">
            {/* Execution actions */}
            {singleSelected && !running && onRunStep && (
              <ContextMenu.Item className={itemClass} onSelect={onRunStep}>
                <span className="w-4 text-center text-[10px]" style={{ color: '#22c55e' }}>▶</span>
                このステップを実行
              </ContextMenu.Item>
            )}
            {singleSelected && !running && onRunFromHere && hasFlowSteps && (
              <ContextMenu.Item className={itemClass} onSelect={onRunFromHere}>
                <span className="w-4 text-center text-[10px]" style={{ color: '#22c55e' }}>▶▶</span>
                ここから実行
              </ContextMenu.Item>
            )}
            {!running && onRunBlock && (
              <ContextMenu.Item className={itemClass} onSelect={onRunBlock}>
                <span className="w-4 text-center text-[10px]" style={{ color: '#22c55e' }}>⏵</span>
                ブロック全体を実行
              </ContextMenu.Item>
            )}
            {(onRunStep || onRunFromHere || onRunBlock) && !running && (
              <div className={separatorClass} />
            )}

            {multiSelected && (
              <ContextMenu.Item className={itemClass} onSelect={onGroup}>
                <span className="w-4 text-center text-[10px]">▤</span>
                グループ化
              </ContextMenu.Item>
            )}

            {isGroupSelected && (
              <ContextMenu.Item className={itemClass} onSelect={onUngroup}>
                <span className="w-4 text-center text-[10px]">⊟</span>
                グループ解除
              </ContextMenu.Item>
            )}

            {(multiSelected || isGroupSelected) && (
              <div className={separatorClass} />
            )}

            {hasSelection && hasFlowSteps && (
              <ContextMenu.Item className={itemClass} onSelect={onMoveToFree}>
                <span className="w-4 text-center text-[10px]">↗</span>
                フリーエリアへ移動
              </ContextMenu.Item>
            )}

            {hasSelection && hasFreeSteps && (
              <ContextMenu.Item className={itemClass} onSelect={onMoveToFlow}>
                <span className="w-4 text-center text-[10px]">↙</span>
                メインフローへ戻す
              </ContextMenu.Item>
            )}

            {hasSelection && (
              <>
                <div className={separatorClass} />
                <ContextMenu.Item className={itemClass} onSelect={onDuplicate}>
                  <span className="w-4 text-center text-[10px]">⧉</span>
                  複製
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={itemClass + ' data-[highlighted]:text-red-400'}
                  onSelect={onDelete}
                >
                  <span className="w-4 text-center text-[10px]">✕</span>
                  削除
                </ContextMenu.Item>
              </>
            )}

            {!hasSelection && (
              <div className="px-3 py-2 font-mono text-[10px] text-fl-text-ghost">
                ステップを選択してください
              </div>
            )}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
