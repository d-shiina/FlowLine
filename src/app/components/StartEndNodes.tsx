import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Plus, Play, Trash2, StopCircle } from 'lucide-react';
import type { BlockInputBinding } from '../types';

export interface StartNodeData {
  inputs: Record<string, BlockInputBinding>;
  scenarioVariables: Record<string, unknown>;
  onAddInput: (name: string, key: string) => void;
  onUpdateInput: (name: string, key: string) => void;
  onRenameInput: (oldName: string, newName: string) => void;
  onDeleteInput: (name: string) => void;
  [key: string]: unknown;
}

export interface EndNodeData {
  outputs: Record<string, string>;
  scenarioVariables: Record<string, unknown>;
  onAddOutput: (name: string, key: string) => void;
  onUpdateOutput: (name: string, key: string) => void;
  onRenameOutput: (oldName: string, newName: string) => void;
  onDeleteOutput: (name: string) => void;
  [key: string]: unknown;
}

const START_COLOR = '#14b8a6'; // teal
const END_COLOR = '#a855f7';   // purple

// ── Start Node ───────────────────────────────

export const StartNode = memo(function StartNode({ data }: NodeProps) {
  const d = data as unknown as StartNodeData;
  const [draftName, setDraftName] = useState('');
  const [draftKey, setDraftKey] = useState('');
  const varKeys = Object.keys(d.scenarioVariables).map((k) => `scenario.${k}`);
  const datalistId = `start-vars`;
  const entries = Object.entries(d.inputs);

  const handleAdd = () => {
    if (!draftName.trim()) return;
    d.onAddInput(draftName.trim(), draftKey.trim() || `scenario.${draftName.trim()}`);
    setDraftName('');
    setDraftKey('');
  };

  return (
    <div
      className="w-[260px] rounded-lg"
      style={{
        border: `2px solid ${START_COLOR}`,
        background: 'var(--fl-panel-2)',
        boxShadow: `0 0 14px ${START_COLOR}44`,
      }}
    >
      <datalist id={datalistId}>
        {varKeys.map((k) => <option key={k} value={k} />)}
      </datalist>

      {/* Header */}
      <div
        className="drag-handle flex cursor-grab items-center gap-1.5 rounded-t-[5px] px-3 py-2 active:cursor-grabbing"
        style={{ background: `${START_COLOR}22` }}
      >
        <Play className="h-3 w-3 fill-current" style={{ color: START_COLOR }} />
        <span className="font-mono text-[11px] font-bold" style={{ color: START_COLOR }}>
          START
        </span>
        <span className="ml-auto font-mono text-[8px] text-fl-text-ghost">
          入力
        </span>
      </div>

      {/* Inputs list */}
      <div className="px-2 py-1.5">
        {entries.length === 0 && (
          <div className="py-1 text-center font-mono text-[8px] text-fl-text-ghost">
            シナリオ変数を受け取る
          </div>
        )}
        {entries.map(([name, binding]) => {
          const displayKey =
            binding.kind === 'var'
              ? binding.key
              : binding.kind === 'literal'
                ? `(literal: ${String(binding.value)})`
                : `← ${binding.fromBlockId}.${binding.fromPort}`;
          return (
            <InputRow
              key={name}
              name={name}
              varKey={displayKey}
              datalistId={datalistId}
              onUpdate={(newKey) => d.onUpdateInput(name, newKey)}
              onRename={(newName) => d.onRenameInput(name, newName)}
              onDelete={() => d.onDeleteInput(name)}
            />
          );
        })}

        {/* Add new input row */}
        <div className="mt-1 flex items-center gap-1 border-t border-fl-border pt-1">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="名前"
            className="min-w-0 flex-[1] rounded border border-fl-border bg-fl-bg px-1 py-0.5 font-mono text-[9px] outline-none"
          />
          <input
            list={datalistId}
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="scenario.xxx"
            className="min-w-0 flex-[1.5] rounded border border-fl-border bg-fl-bg px-1 py-0.5 font-mono text-[9px] outline-none"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-fl-text-faint hover:bg-[#22c55e22] hover:text-[#22c55e]"
          >
            <Plus className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="__exec__"
        style={{
          top: 18,
          right: -8,
          width: 14,
          height: 14,
          borderRadius: 3,
          background: '#e2e8f0',
          border: '2px solid #475569',
          zIndex: 10,
        }}
        title="exec out"
      />
    </div>
  );
});

function InputRow({
  name,
  varKey,
  datalistId,
  onUpdate,
  onRename,
  onDelete,
}: {
  name: string;
  varKey: string;
  datalistId: string;
  onUpdate: (newKey: string) => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
}) {
  const [localName, setLocalName] = useState(name);
  const [localKey, setLocalKey] = useState(varKey);

  return (
    <div className="group flex items-center gap-1 py-0.5">
      <span
        className="inline-block h-[6px] w-[6px] flex-shrink-0 rounded-full animate-pulse"
        style={{
          background: START_COLOR,
          boxShadow: `0 0 4px ${START_COLOR}66`,
        }}
      />
      <input
        value={localName}
        onChange={(e) => setLocalName(e.target.value)}
        onBlur={() => localName !== name && onRename(localName)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="min-w-0 flex-[1] bg-transparent px-1 font-mono text-[9px] text-fl-text-dim outline-none"
      />
      <input
        list={datalistId}
        value={localKey}
        onChange={(e) => setLocalKey(e.target.value)}
        onBlur={() => localKey !== varKey && onUpdate(localKey)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="min-w-0 flex-[1.5] rounded border border-fl-border bg-fl-bg px-1 py-0.5 font-mono text-[9px] text-fl-text outline-none"
      />
      <button
        type="button"
        onClick={onDelete}
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-fl-text-faint opacity-0 transition hover:text-red-500 group-hover:opacity-100"
      >
        <Trash2 className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

// ── End Node ─────────────────────────────────

export const EndNode = memo(function EndNode({ data }: NodeProps) {
  const d = data as unknown as EndNodeData;
  const [draftName, setDraftName] = useState('');
  const [draftKey, setDraftKey] = useState('');
  const varKeys = Object.keys(d.scenarioVariables).map((k) => `scenario.${k}`);
  const datalistId = `end-vars`;
  const entries = Object.entries(d.outputs);

  const handleAdd = () => {
    if (!draftName.trim()) return;
    d.onAddOutput(draftName.trim(), draftKey.trim() || `scenario.${draftName.trim()}`);
    setDraftName('');
    setDraftKey('');
  };

  return (
    <div
      className="w-[260px] rounded-lg"
      style={{
        border: `2px solid ${END_COLOR}`,
        background: 'var(--fl-panel-2)',
        boxShadow: `0 0 14px ${END_COLOR}44`,
      }}
    >
      <datalist id={datalistId}>
        {varKeys.map((k) => <option key={k} value={k} />)}
      </datalist>

      <Handle
        type="target"
        position={Position.Left}
        id="__exec__"
        style={{
          top: 18,
          left: -8,
          width: 14,
          height: 14,
          borderRadius: 3,
          background: '#e2e8f0',
          border: '2px solid #475569',
          zIndex: 10,
        }}
        title="exec in"
      />

      {/* Header */}
      <div
        className="drag-handle flex cursor-grab items-center gap-1.5 rounded-t-[5px] px-3 py-2 active:cursor-grabbing"
        style={{ background: `${END_COLOR}22` }}
      >
        <StopCircle className="h-3 w-3" style={{ color: END_COLOR }} />
        <span className="font-mono text-[11px] font-bold" style={{ color: END_COLOR }}>
          END
        </span>
        <span className="ml-auto font-mono text-[8px] text-fl-text-ghost">
          出力
        </span>
      </div>

      {/* Outputs list */}
      <div className="px-2 py-1.5">
        {entries.length === 0 && (
          <div className="py-1 text-center font-mono text-[8px] text-fl-text-ghost">
            シナリオ変数に書き戻す
          </div>
        )}
        {entries.map(([name, key]) => (
          <OutputRow
            key={name}
            name={name}
            varKey={key}
            datalistId={datalistId}
            onUpdate={(newKey) => d.onUpdateOutput(name, newKey)}
            onRename={(newName) => d.onRenameOutput(name, newName)}
            onDelete={() => d.onDeleteOutput(name)}
          />
        ))}

        <div className="mt-1 flex items-center gap-1 border-t border-fl-border pt-1">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="名前"
            className="min-w-0 flex-[1] rounded border border-fl-border bg-fl-bg px-1 py-0.5 font-mono text-[9px] outline-none"
          />
          <input
            list={datalistId}
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="scenario.xxx"
            className="min-w-0 flex-[1.5] rounded border border-fl-border bg-fl-bg px-1 py-0.5 font-mono text-[9px] outline-none"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-fl-text-faint hover:bg-[#f43f5e22] hover:text-[#f43f5e]"
          >
            <Plus className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
});

function OutputRow({
  name,
  varKey,
  datalistId,
  onUpdate,
  onRename,
  onDelete,
}: {
  name: string;
  varKey: string;
  datalistId: string;
  onUpdate: (newKey: string) => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
}) {
  const [localName, setLocalName] = useState(name);
  const [localKey, setLocalKey] = useState(varKey);

  return (
    <div className="group flex items-center gap-1 py-0.5">
      <input
        list={datalistId}
        value={localKey}
        onChange={(e) => setLocalKey(e.target.value)}
        onBlur={() => localKey !== varKey && onUpdate(localKey)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="min-w-0 flex-[1.5] rounded border border-fl-border bg-fl-bg px-1 py-0.5 font-mono text-[9px] text-fl-text outline-none"
      />
      <input
        value={localName}
        onChange={(e) => setLocalName(e.target.value)}
        onBlur={() => localName !== name && onRename(localName)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="min-w-0 flex-[1] bg-transparent px-1 text-right font-mono text-[9px] text-fl-text-dim outline-none"
      />
      <span
        className="inline-block h-[6px] w-[6px] flex-shrink-0 rounded-full animate-pulse"
        style={{
          background: END_COLOR,
          boxShadow: `0 0 4px ${END_COLOR}66`,
        }}
      />
      <button
        type="button"
        onClick={onDelete}
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-fl-text-faint opacity-0 transition hover:text-red-500 group-hover:opacity-100"
      >
        <Trash2 className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
