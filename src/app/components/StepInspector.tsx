import { useMemo } from 'react';
import type { Block, OnError, Step, Subroutine } from '../types';
import { STEP_META } from '../types';
import type { NodeManifestEntry } from '../../globals';
import { Select } from './ui/Select';
import { Checkbox } from './ui/Checkbox';
import { Autocomplete } from './ui/Autocomplete';
import type { AutocompleteOption } from './ui/Autocomplete';
import { JsonLogicField } from './JsonLogicField';
import { PortBindingsSection } from './inspector/PortBindingsSection';
import { SwitchCasesSection } from './inspector/SwitchCasesSection';

interface Props {
  step: Step | null;
  block: Block;
  nodeManifest: NodeManifestEntry[];
  scenarioVariables: Record<string, unknown>;
  subroutines: Subroutine[];
  onUpdateStep: (stepId: string, patch: Partial<Step>) => void;
}

type OnErrorKey = 'abort' | 'skip' | 'ignore' | 'retry';
type RetryThenKey = 'abort' | 'skip';

function toKey(v: OnError | undefined): OnErrorKey {
  if (v === undefined) return 'abort';
  if (typeof v === 'object') return 'retry';
  return v;
}

function fromKey(k: OnErrorKey, current: OnError | undefined): OnError {
  if (k === 'retry') {
    const n =
      typeof current === 'object' && 'retry' in current ? current.retry : 3;
    return { retry: n, then: 'skip' };
  }
  return k;
}

/** Divider + padding wrapper for each section. */
function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-fl-border px-4 py-3">
      {children}
    </div>
  );
}

/** Uppercase section label. */
function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-fl-text-faint">
      {children}
    </div>
  );
}

/** Panel shown when no step is selected — displays a block summary. */
function BlockSummaryPanel({ block }: { block: Block }) {
  const usedNodes = useMemo(() => {
    const ids = block.steps
      .map((s) => s.nodeId)
      .filter((id): id is string => !!id);
    return [...new Set(ids)];
  }, [block.steps]);

  return (
    <aside className="fl-scroll flex h-full w-[360px] flex-shrink-0 flex-col gap-3 overflow-y-auto border-l border-fl-border bg-fl-panel p-4">
      <div className="font-mono text-[10px] font-bold tracking-wider text-fl-text-muted">
        ▶ BLOCK
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-fl-text-faint">LABEL</span>
        <div className="rounded-md border border-fl-border bg-fl-panel-2 px-2 py-1 font-mono text-[11px] text-fl-text">
          {block.label}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-fl-text-faint">STEPS</span>
        <span className="font-mono text-[11px] text-fl-text-muted">
          {block.steps.length} ステップ
        </span>
      </div>

      {usedNodes.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] text-fl-text-faint">NODES</span>
          <div className="flex flex-col gap-0.5">
            {usedNodes.map((n) => (
              <span key={n} className="font-mono text-[10px] text-fl-text-dim">
                {n}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto font-mono text-[9px] text-fl-text-ghost">
        ステップをクリックして編集
      </div>
    </aside>
  );
}

const ON_ERROR_OPTIONS: Array<{ value: OnErrorKey; label: string }> = [
  { value: 'abort', label: '中断 (abort)' },
  { value: 'skip', label: '次へ (skip)' },
  { value: 'ignore', label: '無視 (ignore)' },
  { value: 'retry', label: 'リトライ (retry)' },
];

const RETRY_THEN_OPTIONS: Array<{ value: RetryThenKey; label: string }> = [
  { value: 'abort', label: 'abort' },
  { value: 'skip', label: 'skip' },
];

/**
 * Right-side panel in the flowchart editor.
 * Shows a block summary when no step is selected; otherwise renders
 * step-type-specific configuration sections.
 */
export function StepInspector({
  step,
  block,
  nodeManifest,
  scenarioVariables,
  subroutines,
  onUpdateStep,
}: Props) {
  // All hooks must appear before any early return.
  const nodeOptions: AutocompleteOption[] = useMemo(
    () =>
      nodeManifest.map((n) => ({
        value: n.id,
        label: n.label || n.id,
        group: n.category,
        description: n.id !== (n.label || n.id) ? n.id : undefined,
      })),
    [nodeManifest],
  );

  if (!step) {
    return <BlockSummaryPanel block={block} />;
  }

  const meta = STEP_META[step.type];
  const selectedNode = step.nodeId
    ? nodeManifest.find((n) => n.id === step.nodeId)
    : undefined;
  const onErrorKey = toKey(step.onError);
  const hasTimeout = step.timeout !== undefined;
  const isControlFlow =
    step.type === 'loop' || step.type === 'branch' || step.type === 'switch';

  return (
    <aside className="fl-scroll flex h-full w-[360px] flex-shrink-0 flex-col overflow-y-auto border-l border-fl-border bg-fl-panel">
      {/* Header: type badge + step label */}
      <div className="flex flex-shrink-0 items-center gap-2 px-4 py-3">
        <span
          className="flex-shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider"
          style={{ background: `${meta.color}22`, color: meta.color }}
        >
          {meta.icon} {meta.label.toUpperCase()}
        </span>
        <span
          className="truncate font-mono text-[11px] text-fl-text-muted"
          title={step.label}
        >
          {step.label}
        </span>
      </div>

      {/* Node picker — action / wait only */}
      {(step.type === 'action' || step.type === 'wait') && (
        <Section>
          <SLabel>NODE</SLabel>
          <Autocomplete
            value={step.nodeId ?? ''}
            onValueChange={(nodeId) =>
              onUpdateStep(step.id, { nodeId: nodeId || undefined })
            }
            options={nodeOptions}
            placeholder="ノードを検索..."
            allowClear
          />
          {selectedNode && (
            <div className="font-mono text-[9px] text-fl-text-ghost">
              v{selectedNode.version} · {selectedNode.id}
            </div>
          )}
        </Section>
      )}

      {/* Port bindings — only when a node with ports is selected */}
      {selectedNode && Object.keys(selectedNode.ports).length > 0 && (
        <Section>
          <PortBindingsSection
            stepId={step.id}
            ports={selectedNode.ports}
            bindings={step.bindings}
            scenarioVariables={scenarioVariables}
            onUpdateBindings={(bindings) => onUpdateStep(step.id, { bindings })}
          />
        </Section>
      )}

      {/* Condition editor — loop / branch */}
      {(step.type === 'loop' || step.type === 'branch') && (
        <Section>
          <SLabel>CONDITION</SLabel>
          <JsonLogicField
            value={step.params?.condition}
            onChange={(condition) =>
              onUpdateStep(step.id, {
                params: { ...step.params, condition },
              })
            }
            scenarioVariables={scenarioVariables}
          />
        </Section>
      )}

      {/* Switch case manager */}
      {step.type === 'switch' && (
        <Section>
          <SwitchCasesSection
            cases={
              Array.isArray(step.params?.cases)
                ? (step.params.cases as string[])
                : ['case_0', 'default']
            }
            onChange={(cases) =>
              onUpdateStep(step.id, { params: { ...step.params, cases } })
            }
          />
        </Section>
      )}

      {/* Subroutine picker */}
      {step.type === 'subroutine' && (
        <Section>
          <SLabel>SUBROUTINE</SLabel>
          <Select<string>
            value={step.subroutineId ?? ''}
            onValueChange={(id) => onUpdateStep(step.id, { subroutineId: id })}
            options={subroutines.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="サブルーチンを選択"
          />
        </Section>
      )}

      {/* Label */}
      <Section>
        <SLabel>LABEL</SLabel>
        <input
          value={step.label}
          onChange={(e) => onUpdateStep(step.id, { label: e.target.value })}
          className="rounded-md border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[11px] text-fl-text outline-none"
        />
      </Section>

      {/* Error handling (not shown for pure control-flow containers) */}
      {!isControlFlow && (
        <Section>
          <SLabel>ERROR</SLabel>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] text-fl-text-faint">
              TIMEOUT (秒)
            </span>
            <div className="flex items-center gap-1 font-mono text-[9px] text-fl-text-dim">
              <Checkbox
                checked={hasTimeout}
                onCheckedChange={(v) =>
                  onUpdateStep(step.id, { timeout: v ? 30 : undefined })
                }
                accent="#06b6d4"
              />
              個別設定
            </div>
          </div>
          <input
            type="number"
            min={1}
            disabled={!hasTimeout}
            value={step.timeout ?? ''}
            placeholder="engine default"
            onChange={(e) =>
              onUpdateStep(step.id, {
                timeout: e.target.value
                  ? Math.max(1, Number(e.target.value))
                  : undefined,
              })
            }
            className="rounded-md border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[11px] text-fl-text outline-none disabled:opacity-40"
          />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[9px] text-fl-text-faint">
              ON ERROR
            </span>
            <Select<OnErrorKey>
              value={onErrorKey}
              onValueChange={(k) =>
                onUpdateStep(step.id, { onError: fromKey(k, step.onError) })
              }
              options={ON_ERROR_OPTIONS}
            />
            {onErrorKey === 'retry' && typeof step.onError === 'object' && (
              <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-fl-text-dim">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={step.onError.retry}
                  onChange={(e) =>
                    onUpdateStep(step.id, {
                      onError: {
                        retry: Math.max(1, Number(e.target.value)),
                        then: (step.onError as { then: RetryThenKey }).then,
                      },
                    })
                  }
                  className="w-12 rounded border border-fl-border-strong bg-fl-panel-2 px-1 py-0.5 text-center font-mono text-[10px] text-fl-text outline-none"
                />
                回 →
                <div className="flex-1">
                  <Select<RetryThenKey>
                    value={(step.onError as { then: RetryThenKey }).then}
                    onValueChange={(then) =>
                      onUpdateStep(step.id, {
                        onError: {
                          retry: (step.onError as { retry: number }).retry,
                          then,
                        },
                      })
                    }
                    options={RETRY_THEN_OPTIONS}
                  />
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Footer */}
      <div className="mt-auto px-4 py-2 font-mono text-[9px] text-fl-text-ghost">
        id: {step.id}
      </div>
    </aside>
  );
}
