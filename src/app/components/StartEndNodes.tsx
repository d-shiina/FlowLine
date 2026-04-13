import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Plus, Play, Trash2 } from 'lucide-react';
import type { BlockInputBinding } from '../types';

export interface StartNodeData {
  inputs: Record<string, BlockInputBinding>;
  outputs: Record<string, string>;
  scenarioVariables: Record<string, unknown>;
  onAddInput: (name: string, key: string) => void;
  onUpdateInput: (name: string, key: string) => void;
  onRenameInput: (oldName: string, newName: string) => void;
  onDeleteInput: (name: string) => void;
  onAddOutput: (name: string, key: string) => void;
  onUpdateOutput: (name: string, key: string) => void;
  onRenameOutput: (oldName: string, newName: string) => void;
  onDeleteOutput: (name: string) => void;
  [key: string]: unknown;
}

const START_COLOR = '#14b8a6'; // teal — inputs
const END_COLOR = '#a855f7'; // purple — outputs

// ── Start Node (block IO: inputs + outputs) ──

export const StartNode = memo(function StartNode({ data }: NodeProps) {
  const d = data as unknown as StartNodeData;
  const varKeys = Object.keys(d.scenarioVariables).map((k) => `scenario.${k}`);
  const datalistId = `start-vars`;

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
      </div>

      {/* Inputs section */}
      <InputsSection
        inputs={d.inputs}
        datalistId={datalistId}
        onAdd={d.onAddInput}
        onUpdate={d.onUpdateInput}
        onRename={d.onRenameInput}
        onDelete={d.onDeleteInput}
      />

      {/* Outputs section */}
      <OutputsSection
        outputs={d.outputs}
        datalistId={datalistId}
        onAdd={d.onAddOutput}
        onUpdate={d.onUpdateOutput}
        onRename={d.onRenameOutput}
        onDelete={d.onDeleteOutput}
      />

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

// ── Inputs section ───────────────────────────

function InputsSection({
  inputs,
  datalistId,
  onAdd,
  onUpdate,
  onRename,
  onDelete,
}: {
  inputs: Record<string, BlockInputBinding>;
  datalistId: string;
  onAdd: (name: string, key: string) => void;
  onUpdate: (name: string, key: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
}) {
  const [draftName, setDraftName] = useState('');
  const [draftKey, setDraftKey] = useState('');
  const entries = Object.entries(inputs);

  const handleAdd = () => {
    if (!draftName.trim()) return;
    onAdd(draftName.trim(), draftKey.trim() || `scenario.${draftName.trim()}`);
    setDraftName('');
    setDraftKey('');
  };

  return (
    <div className="border-t border-fl-border px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span
          className="font-mono text-[8px] font-bold uppercase tracking-wider"
          style={{ color: START_COLOR }}
        >
          入力
        </span>
        <span className="font-mono text-[8px] text-fl-text-ghost">
          scenario → block
        </span>
      </div>
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
            onUpdate={(newKey) => onUpdate(name, newKey)}
            onRename={(newName) => onRename(name, newName)}
            onDelete={() => onDelete(name)}
          />
        );
      })}
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
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-fl-text-faint hover:bg-[#14b8a622] hover:text-[#14b8a6]"
        >
          <Plus className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}

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

// ── Outputs section ──────────────────────────

function OutputsSection({
  outputs,
  datalistId,
  onAdd,
  onUpdate,
  onRename,
  onDelete,
}: {
  outputs: Record<string, string>;
  datalistId: string;
  onAdd: (name: string, key: string) => void;
  onUpdate: (name: string, key: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
}) {
  const [draftName, setDraftName] = useState('');
  const [draftKey, setDraftKey] = useState('');
  const entries = Object.entries(outputs);

  const handleAdd = () => {
    if (!draftName.trim()) return;
    onAdd(draftName.trim(), draftKey.trim() || `scenario.${draftName.trim()}`);
    setDraftName('');
    setDraftKey('');
  };

  return (
    <div className="border-t border-fl-border px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span
          className="font-mono text-[8px] font-bold uppercase tracking-wider"
          style={{ color: END_COLOR }}
        >
          出力
        </span>
        <span className="font-mono text-[8px] text-fl-text-ghost">
          block → scenario
        </span>
      </div>
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
          onUpdate={(newKey) => onUpdate(name, newKey)}
          onRename={(newName) => onRename(name, newName)}
          onDelete={() => onDelete(name)}
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
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-fl-text-faint hover:bg-[#a855f722] hover:text-[#a855f7]"
        >
          <Plus className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}

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
      <span
        className="inline-block h-[6px] w-[6px] flex-shrink-0 rounded-full animate-pulse"
        style={{
          background: END_COLOR,
          boxShadow: `0 0 4px ${END_COLOR}66`,
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
