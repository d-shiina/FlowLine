import { useRef, useState } from 'react';
import { X, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import type { Block, BlockInputBinding } from '../types';
import type { BlockStatus } from '../engine';

interface Props {
  block: Block;
  trackColor: string;
  status: BlockStatus;
  selected: boolean;
  slotW: number;
  trackH: number;
  scenarioVariables: Record<string, unknown>;
  onSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onSlotChange: (newSlot: number) => void;
  onUpdateInputs: (inputs: Record<string, BlockInputBinding>) => void;
  onUpdateOutputs: (outputs: Record<string, string>) => void;
}

/**
 * Timeline task block with editable input/output bindings.
 * Collapsed by default; expands when selected to show all I/O slots.
 */
export function TimelineBlock({
  block,
  trackColor,
  status,
  selected,
  slotW,
  trackH,
  scenarioVariables,
  onSelect,
  onOpen,
  onDelete,
  onSlotChange,
  onUpdateInputs,
  onUpdateOutputs,
}: Props) {
  const [hov, setHov] = useState(false);
  const [dragPreviewSlot, setDragPreviewSlot] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const showExpanded = expanded || selected;

  const isRunning = status === 'running';
  const isError = status === 'error';
  const isOk = status === 'ok';
  const isSkipped = status === 'skipped' || status === 'cancelled';

  const accent = trackColor;

  const borderColor = isError
    ? '#f43f5e'
    : isRunning
      ? accent
      : selected
        ? accent
        : isSkipped
          ? 'var(--fl-text-ghost)'
          : hov
            ? `${accent}cc`
            : `${accent}55`;

  const shadow = isError
    ? '0 0 20px #f43f5e44, 0 2px 8px rgba(0,0,0,0.3)'
    : isRunning
      ? `0 0 20px ${accent}66, 0 2px 8px rgba(0,0,0,0.3)`
      : selected
        ? `0 0 0 1px ${accent}88, 0 4px 12px rgba(0,0,0,0.25)`
        : hov
          ? '0 2px 8px rgba(0,0,0,0.2)'
          : '0 1px 3px rgba(0,0,0,0.12)';

  const displaySlot = dragPreviewSlot ?? block.slot;
  const left = displaySlot * slotW + 6;
  const width = slotW - 12;
  const collapsedTop = 8;
  const collapsedHeight = trackH - 16;

  const stepCount = block.steps?.length ?? 0;
  const inputs = block.inputs ?? {};
  const outputs = block.outputs ?? {};
  // For inputs we display a string for each binding (var key, literal text,
  // or a connection label). The IoSection works on Array<[name, string]>.
  const inputEntries: Array<[string, string]> = Object.entries(inputs).map(
    ([name, b]) => [
      name,
      b.kind === 'var'
        ? b.key
        : b.kind === 'literal'
          ? String(b.value ?? '')
          : `← ${b.fromBlockId}.${b.fromPort}`,
    ],
  );
  const outputEntries: Array<[string, string]> = Object.entries(outputs);

  const dragInfoRef = useRef<{
    startX: number;
    originSlot: number;
    moved: boolean;
    currentSlot: number;
  } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Only start drag from the header area
    const target = e.target as HTMLElement;
    if (!target.closest('[data-drag-handle]')) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();

    dragInfoRef.current = {
      startX: e.clientX,
      originSlot: block.slot,
      moved: false,
      currentSlot: block.slot,
    };

    const onMove = (ev: MouseEvent) => {
      const st = dragInfoRef.current;
      if (!st) return;
      const dx = ev.clientX - st.startX;
      if (!st.moved && Math.abs(dx) < 4) return;
      st.moved = true;
      const slotDelta = Math.round(dx / slotW);
      const newSlot = Math.max(0, st.originSlot + slotDelta);
      st.currentSlot = newSlot;
      setDragPreviewSlot(newSlot);
    };

    const swallowClick = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
      window.removeEventListener('click', swallowClick, true);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const st = dragInfoRef.current;
      dragInfoRef.current = null;
      setDragPreviewSlot(null);

      if (st && st.moved) {
        window.addEventListener('click', swallowClick, true);
        if (st.currentSlot !== st.originSlot) {
          onSlotChange(st.currentSlot);
        }
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // When expanded, height grows to fit inputs + outputs
  const expandedHeight =
    48 + // header
    (inputEntries.length + outputEntries.length + 2) * 22 + // rows
    16; // padding
  const effectiveHeight = showExpanded ? expandedHeight : collapsedHeight;
  const effectiveTop = showExpanded ? 4 : collapsedTop;

  return (
    <div
      className="group absolute select-none overflow-hidden rounded-lg transition-all"
      style={{
        left,
        top: effectiveTop,
        width,
        height: effectiveHeight,
        border: `1.5px ${isSkipped ? 'dashed' : 'solid'} ${borderColor}`,
        background: 'var(--fl-panel-2)',
        boxShadow: shadow,
        opacity: isSkipped ? 0.55 : 1,
        zIndex: dragPreviewSlot !== null ? 50 : showExpanded ? 20 : selected || isRunning ? 10 : 1,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      {/* Header (drag handle) */}
      <div
        data-drag-handle
        className="flex cursor-grab items-center gap-1.5 px-2 py-1.5 active:cursor-grabbing"
        style={{
          background: `linear-gradient(180deg, ${accent}22 0%, ${accent}11 100%)`,
          borderBottom: showExpanded ? `1px solid ${accent}33` : 'none',
        }}
      >
        <span
          className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
          style={{ background: accent, boxShadow: `0 0 4px ${accent}` }}
        />
        <span
          className="min-w-0 flex-1 truncate font-mono text-[10px] font-bold"
          style={{ color: accent }}
          title={block.label}
        >
          {block.label}
        </span>

        {stepCount > 0 && (
          <span
            className="flex-shrink-0 rounded px-1 font-mono text-[8px] font-bold"
            style={{ background: `${accent}22`, color: accent }}
          >
            {stepCount}s
          </span>
        )}

        {/* Status indicator */}
        {(isRunning || isOk || isError || isSkipped) && (
          <span
            className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
            style={{
              background: isError
                ? '#f43f5e'
                : isRunning
                  ? '#10b981'
                  : isOk
                    ? `${accent}44`
                    : 'var(--fl-text-ghost)',
              color: isError || isRunning ? '#fff' : 'var(--fl-text)',
            }}
          >
            {isRunning ? '●' : isOk ? '✓' : isError ? '✕' : '–'}
          </span>
        )}

        {/* Expand toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded text-fl-text-ghost hover:text-fl-text"
        >
          {showExpanded ? (
            <ChevronUp className="h-2.5 w-2.5" />
          ) : (
            <ChevronDown className="h-2.5 w-2.5" />
          )}
        </button>

        {/* Delete on hover */}
        <button
          type="button"
          className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full bg-red-500/70 text-[8px] text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="削除"
        >
          <X className="h-2 w-2" />
        </button>
      </div>

      {/* Collapsed view: dots showing I/O presence */}
      {!showExpanded && (
        <div className="flex items-center gap-1 px-2 py-1 font-mono text-[8px] text-fl-text-faint">
          {inputEntries.length > 0 && (
            <>
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: accent }}
              />
              <span>in {inputEntries.length}</span>
            </>
          )}
          {outputEntries.length > 0 && (
            <>
              <span className="mx-1 text-fl-text-ghost">|</span>
              <span>out {outputEntries.length}</span>
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: accent }}
              />
            </>
          )}
          {inputEntries.length === 0 && outputEntries.length === 0 && (
            <span className="text-fl-text-ghost">no I/O</span>
          )}
        </div>
      )}

      {/* Expanded view: editable I/O rows */}
      {showExpanded && (
        <div className="flex flex-col gap-0.5 px-2 py-1.5">
          <IoSection
            label="IN"
            accent={accent}
            entries={inputEntries}
            scenarioVariables={scenarioVariables}
            blockId={block.id}
            side="in"
            onChange={(next) => {
              // Wrap raw strings as { kind: 'var' } bindings.
              const wrapped: Record<string, BlockInputBinding> = {};
              for (const [name, key] of Object.entries(next)) {
                // Preserve existing connection bindings if the key matches the
                // connection display string (starts with "← ").
                const existing = inputs[name];
                if (existing && existing.kind === 'connection' && key.startsWith('← ')) {
                  wrapped[name] = existing;
                } else {
                  wrapped[name] = { kind: 'var', key };
                }
              }
              onUpdateInputs(wrapped);
            }}
          />
          <IoSection
            label="OUT"
            accent={accent}
            entries={outputEntries}
            scenarioVariables={scenarioVariables}
            blockId={block.id}
            side="out"
            onChange={onUpdateOutputs}
          />
        </div>
      )}
    </div>
  );
}

// ── I/O Section ──────────────────────────────

function IoSection({
  label,
  accent,
  entries,
  scenarioVariables,
  blockId,
  side,
  onChange,
}: {
  label: string;
  accent: string;
  entries: Array<[string, string]>;
  scenarioVariables: Record<string, unknown>;
  blockId: string;
  side: 'in' | 'out';
  onChange: (next: Record<string, string>) => void;
}) {
  const [draftName, setDraftName] = useState('');
  const [draftKey, setDraftKey] = useState('');
  const datalistId = `io-${label}-${accent}`;
  const varKeys = Object.keys(scenarioVariables).map((k) => `scenario.${k}`);

  const handleAdd = () => {
    if (!draftName.trim()) return;
    const next = { ...Object.fromEntries(entries) };
    next[draftName.trim()] = draftKey.trim() || `scenario.${draftName.trim()}`;
    onChange(next);
    setDraftName('');
    setDraftKey('');
  };

  const handleUpdate = (name: string, key: string) => {
    const next = { ...Object.fromEntries(entries), [name]: key };
    onChange(next);
  };

  const handleRemove = (name: string) => {
    const next = { ...Object.fromEntries(entries) };
    delete next[name];
    onChange(next);
  };

  return (
    <div>
      <datalist id={datalistId}>
        {varKeys.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <div
        className="mb-0.5 font-mono text-[7px] font-bold tracking-wider"
        style={{ color: `${accent}cc` }}
      >
        {label}
      </div>
      {entries.map(([name, key]) => (
        <div key={name} className="flex items-center gap-1 py-0.5">
          <span
            className="inline-block h-2 w-2 flex-shrink-0 cursor-crosshair rounded-full transition-transform hover:scale-150"
            data-port-id={`${blockId}::${side}::${name}`}
            data-port-side={side}
            data-port-block={blockId}
            data-port-name={name}
            style={{
              background: accent,
              boxShadow: `0 0 4px ${accent}88`,
            }}
            title={`${side === 'in' ? '入力' : '出力'}: ${name}`}
          />
          <input
            defaultValue={name}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== name) {
                const next = { ...Object.fromEntries(entries) };
                delete next[name];
                next[v] = key;
                onChange(next);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-[28%] min-w-0 bg-transparent font-mono text-[8px] text-fl-text-muted outline-none"
          />
          <span className="text-fl-text-ghost">=</span>
          <input
            list={datalistId}
            defaultValue={key}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== key) handleUpdate(name, v);
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 rounded bg-fl-bg px-1 font-mono text-[8px] text-fl-text outline-none"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove(name);
            }}
            className="flex h-3 w-3 flex-shrink-0 items-center justify-center text-fl-text-ghost hover:text-red-500"
          >
            <X className="h-2 w-2" />
          </button>
        </div>
      ))}
      {/* Add new row */}
      <div className="flex items-center gap-1 py-0.5">
        <span className="inline-block h-1 w-1 flex-shrink-0 rounded-full border border-fl-text-ghost" />
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="名前"
          className="w-[28%] min-w-0 bg-transparent font-mono text-[8px] text-fl-text-faint outline-none placeholder:text-fl-text-ghost"
        />
        <span className="text-fl-text-ghost">=</span>
        <input
          list={datalistId}
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="scenario.xxx"
          className="min-w-0 flex-1 rounded bg-fl-bg px-1 font-mono text-[8px] text-fl-text outline-none"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAdd();
          }}
          className="flex h-3 w-3 flex-shrink-0 items-center justify-center text-fl-text-ghost hover:text-fl-text"
        >
          <Plus className="h-2 w-2" />
        </button>
      </div>
    </div>
  );
}
