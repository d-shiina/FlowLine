import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Terminal,
  Filter,
  Variable,
  Plus,
  Trash2,
} from 'lucide-react';
import type { ExecutionPhase, LogEntry } from '../engine';
import type { Track } from '../types';
import { describeType, formatLiteral, parseLiteral } from '../valueLiteral';

// ── Shared types ─────────────────────────────

type TabId = 'log' | 'variables';

interface Props {
  logs: LogEntry[];
  phase: ExecutionPhase;
  phaseLabel: string;
  running: boolean;
  tracks: Track[];
  // Variables
  variables: Record<string, unknown>;
  runtimeSnapshot?: Record<string, unknown>;
  onSetVariable: (key: string, value: unknown) => void;
  onRenameVariable: (oldKey: string, newKey: string) => void;
  onDeleteVariable: (key: string) => void;
}

const PHASE_COLOR: Record<ExecutionPhase, string> = {
  idle: 'var(--fl-text-faint)',
  running: '#22c55e',
  'error-handler': '#f59e0b',
  done: '#22c55e',
  aborted: '#ef4444',
};

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  info: 'var(--fl-text-dim)',
  warn: '#eab308',
  error: '#ef4444',
};

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

// ── Main component ───────────────────────────

export function BottomPanel({
  logs,
  phase,
  phaseLabel,
  running,
  tracks,
  variables,
  runtimeSnapshot,
  onSetVariable,
  onRenameVariable,
  onDeleteVariable,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('log');
  const [filterTrackId, setFilterTrackId] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const trackMap = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    for (const t of tracks) m.set(t.id, { name: t.name, color: t.color });
    return m;
  }, [tracks]);

  // Auto-expand when a run starts.
  const prevRunning = useRef(running);
  useEffect(() => {
    if (running && !prevRunning.current) {
      setExpanded(true);
      setActiveTab('log');
    }
    prevRunning.current = running;
  }, [running]);

  // Auto-scroll log to bottom.
  useEffect(() => {
    if (!expanded || activeTab !== 'log') return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, expanded, activeTab]);

  const filteredLogs = useMemo(
    () =>
      filterTrackId
        ? logs.filter((l) => l.trackId === filterTrackId)
        : logs,
    [logs, filterTrackId],
  );

  const lastLog = filteredLogs[filteredLogs.length - 1];

  const logTrackIds = useMemo(() => {
    const ids = new Set<string>();
    for (const l of logs) if (l.trackId) ids.add(l.trackId);
    return [...ids];
  }, [logs]);

  const varCount = Object.keys(variables).length;

  // ── Collapsed bar ──────────────────────────

  const tabButtonClass = (id: TabId) =>
    `flex items-center gap-1 px-2 py-1 font-mono text-[9px] font-bold tracking-wider transition-colors rounded-t ${
      activeTab === id
        ? 'text-fl-text bg-fl-bg border-b-0'
        : 'text-fl-text-faint hover:text-fl-text-dim'
    }`;

  return (
    <div className="flex flex-shrink-0 flex-col border-t border-fl-border bg-fl-panel">
      {/* Status bar + tabs */}
      <div className="flex items-center">
        {/* Tabs */}
        <div className="flex items-center gap-0.5 pl-2">
          <button
            type="button"
            className={tabButtonClass('log')}
            onClick={() => {
              setActiveTab('log');
              setExpanded(true);
            }}
          >
            <Terminal className="h-2.5 w-2.5" style={{ color: PHASE_COLOR[phase] }} />
            ログ
            {running && (
              <span
                className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: PHASE_COLOR[phase] }}
              />
            )}
          </button>
          <button
            type="button"
            className={tabButtonClass('variables')}
            onClick={() => {
              setActiveTab('variables');
              setExpanded(true);
            }}
          >
            <Variable className="h-2.5 w-2.5" />
            変数
            <span className="rounded-full bg-fl-panel-2 px-1 font-mono text-[8px] text-fl-text-ghost">
              {varCount}
            </span>
          </button>
        </div>

        {/* Status summary */}
        <div className="flex flex-1 items-center gap-2 px-3">
          <span
            className="font-mono text-[9px] font-bold"
            style={{ color: PHASE_COLOR[phase] }}
          >
            {phaseLabel}
          </span>
          <span className="truncate font-mono text-[8px] text-fl-text-faint">
            {activeTab === 'log' && lastLog
              ? `${lastLog.level.toUpperCase()} · ${lastLog.message}`
              : ''}
          </span>
        </div>

        {/* Expand/collapse toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 px-3 py-1.5 text-fl-text-faint transition-colors hover:text-fl-text"
        >
          <span className="font-mono text-[8px]">
            {activeTab === 'log'
              ? `${filterTrackId ? `${filteredLogs.length}/` : ''}${logs.length}`
              : `${varCount}`}
          </span>
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* Panel body */}
      {expanded && (
        <div className="border-t border-fl-border bg-fl-bg">
          {activeTab === 'log' ? (
            <LogTabContent
              logs={filteredLogs}
              allLogs={logs}
              trackMap={trackMap}
              logTrackIds={logTrackIds}
              filterTrackId={filterTrackId}
              setFilterTrackId={setFilterTrackId}
              showFilter={showFilter}
              setShowFilter={setShowFilter}
              scrollRef={scrollRef}
            />
          ) : (
            <VariablesTabContent
              variables={variables}
              runtimeSnapshot={runtimeSnapshot}
              onSet={onSetVariable}
              onRename={onRenameVariable}
              onDelete={onDeleteVariable}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Log tab ──────────────────────────────────

function LogTabContent({
  logs,
  allLogs,
  trackMap,
  logTrackIds,
  filterTrackId,
  setFilterTrackId,
  showFilter,
  setShowFilter,
  scrollRef,
}: {
  logs: LogEntry[];
  allLogs: LogEntry[];
  trackMap: Map<string, { name: string; color: string }>;
  logTrackIds: string[];
  filterTrackId: string | null;
  setFilterTrackId: (id: string | null) => void;
  showFilter: boolean;
  setShowFilter: (v: boolean) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <>
      {/* Filter toolbar */}
      <div className="flex items-center gap-2 border-b border-fl-border px-5 py-1">
        <button
          type="button"
          onClick={() => setShowFilter(!showFilter)}
          className="flex items-center gap-1 font-mono text-[9px] text-fl-text-faint transition-colors hover:text-fl-text"
        >
          <Filter className="h-2.5 w-2.5" />
          フィルター
        </button>
        {showFilter && (
          <>
            <button
              type="button"
              onClick={() => setFilterTrackId(null)}
              className="rounded px-1.5 py-px font-mono text-[9px] transition-colors"
              style={{
                background: filterTrackId === null ? '#3b82f620' : 'transparent',
                color: filterTrackId === null ? '#3b82f6' : 'var(--fl-text-faint)',
              }}
            >
              ALL
            </button>
            {logTrackIds.map((tid) => {
              const t = trackMap.get(tid);
              const active = filterTrackId === tid;
              return (
                <button
                  key={tid}
                  type="button"
                  onClick={() => setFilterTrackId(active ? null : tid)}
                  className="flex items-center gap-1 rounded px-1.5 py-px font-mono text-[9px] transition-colors"
                  style={{
                    background: active ? `${t?.color ?? '#999'}20` : 'transparent',
                    color: active ? t?.color : 'var(--fl-text-faint)',
                  }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: t?.color ?? '#999' }}
                  />
                  {t?.name ?? tid}
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Log lines */}
      <div
        ref={scrollRef}
        className="fl-scroll max-h-48 min-h-20 overflow-auto px-5 py-2"
      >
        {logs.length === 0 ? (
          <div className="font-mono text-[10px] text-fl-text-ghost">（空）</div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {logs.map((log) => {
              const t = log.trackId ? trackMap.get(log.trackId) : undefined;
              return (
                <li
                  key={log.id}
                  className="flex items-baseline gap-2 font-mono text-[10px] leading-relaxed"
                >
                  <span className="flex-shrink-0 text-fl-text-ghost">
                    {formatTime(log.time)}
                  </span>
                  <span
                    className="flex-shrink-0 uppercase"
                    style={{ color: LEVEL_COLOR[log.level], minWidth: 34 }}
                  >
                    {log.level}
                  </span>
                  {t && (
                    <span
                      className="flex-shrink-0 rounded px-1 py-px text-[8px] font-bold"
                      style={{ background: `${t.color}22`, color: t.color }}
                    >
                      {t.name}
                    </span>
                  )}
                  <span className="text-fl-text">{log.message}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

// ── Variables tab ────────────────────────────

function VariablesTabContent({
  variables,
  runtimeSnapshot,
  onSet,
  onRename,
  onDelete,
}: {
  variables: Record<string, unknown>;
  runtimeSnapshot?: Record<string, unknown>;
  onSet: (key: string, value: unknown) => void;
  onRename: (oldKey: string, newKey: string) => void;
  onDelete: (key: string) => void;
}) {
  const entries = useMemo(
    () => Object.entries(variables).sort(([a], [b]) => a.localeCompare(b)),
    [variables],
  );

  const runtimeOnlyEntries = useMemo(() => {
    if (!runtimeSnapshot) return [];
    const scenarioKeys = new Set(
      Object.keys(variables).map((k) => `scenario.${k}`),
    );
    return Object.entries(runtimeSnapshot)
      .filter(([k]) => !scenarioKeys.has(k))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [runtimeSnapshot, variables]);

  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  const handleAdd = () => {
    const key = draftKey.trim();
    if (!key) {
      setDraftError('キー名を入力');
      return;
    }
    if (key in variables) {
      setDraftError('既に存在');
      return;
    }
    onSet(key, parseLiteral(draftValue));
    setDraftKey('');
    setDraftValue('');
    setDraftError(null);
  };

  return (
    <div className="fl-scroll max-h-48 min-h-20 overflow-auto">
      {/* Header row */}
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-fl-border bg-fl-bg px-4 py-1 font-mono text-[8px] font-bold uppercase tracking-wider text-fl-text-ghost">
        <span className="w-[26px]">SCOPE</span>
        <span className="flex-[1.2]">NAME</span>
        <span className="flex-[2]">VALUE</span>
        <span className="w-[38px] text-right">TYPE</span>
        {runtimeSnapshot && Object.keys(runtimeSnapshot).length > 0 && (
          <span className="w-[70px] text-right">RUNTIME</span>
        )}
        <span className="w-[20px]" />
      </div>

      {/* Scenario variable rows */}
      {entries.map(([key, value]) => (
        <VarRow
          key={key}
          scope="scenario"
          name={key}
          value={value}
          runtimeValue={runtimeSnapshot?.[`scenario.${key}`]}
          onRename={(next) => onRename(key, next)}
          onValueChange={(next) => onSet(key, next)}
          onDelete={() => onDelete(key)}
        />
      ))}

      {/* Runtime-only variables (track scope, etc.) */}
      {runtimeOnlyEntries.map(([key, value]) => (
        <VarRow
          key={key}
          scope={key.startsWith('track.') ? 'track' : 'other'}
          name={key}
          value={value}
          readOnly
        />
      ))}

      {/* Empty state */}
      {entries.length === 0 && runtimeOnlyEntries.length === 0 && (
        <div className="py-4 text-center font-mono text-[10px] text-fl-text-ghost">
          変数がまだ定義されていません
        </div>
      )}

      {/* Add new variable row */}
      <div className="flex items-center gap-1 border-t border-fl-border px-4 py-1.5">
        <span className="w-[26px] font-mono text-[8px] text-fl-text-ghost">+</span>
        <input
          value={draftKey}
          onChange={(e) => {
            setDraftKey(e.target.value);
            setDraftError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="キー名"
          className="min-w-0 flex-[1.2] bg-transparent px-1 py-0.5 font-mono text-[10px] text-fl-text outline-none placeholder:text-fl-text-ghost"
        />
        <input
          value={draftValue}
          onChange={(e) => {
            setDraftValue(e.target.value);
            setDraftError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder='値 (hello / 42 / true)'
          className="min-w-0 flex-[2] rounded border border-fl-border bg-fl-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none placeholder:text-fl-text-ghost focus:border-fl-text-dim"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="flex flex-shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#3b82f6] transition-colors hover:bg-[#3b82f620]"
        >
          <Plus className="h-2.5 w-2.5" /> 追加
        </button>
        {draftError && (
          <span className="font-mono text-[8px] text-[#ef4444]">{draftError}</span>
        )}
      </div>
    </div>
  );
}

// ── Variable row ─────────────────────────────

const SCOPE_BADGE: Record<string, { color: string; label: string }> = {
  scenario: { color: '#3b82f6', label: 'S' },
  track: { color: '#8b5cf6', label: 'T' },
  other: { color: '#94a3b8', label: '?' },
};

interface VarRowProps {
  scope: 'scenario' | 'track' | 'other';
  name: string;
  value: unknown;
  runtimeValue?: unknown;
  readOnly?: boolean;
  onRename?: (next: string) => void;
  onValueChange?: (next: unknown) => void;
  onDelete?: () => void;
}

function VarRow({
  scope,
  name,
  value,
  runtimeValue,
  readOnly,
  onRename,
  onValueChange,
  onDelete,
}: VarRowProps) {
  const [localKey, setLocalKey] = useState(name);
  const [localVal, setLocalVal] = useState(() => formatLiteral(value));

  // Resync on external changes
  const identity = `${name}::${formatLiteral(value)}`;
  const prevIdentity = useRef<string | null>(null);
  useEffect(() => {
    if (prevIdentity.current !== identity) {
      prevIdentity.current = identity;
      setLocalKey(name);
      setLocalVal(formatLiteral(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  const commitKey = () => {
    const trimmed = localKey.trim();
    if (!trimmed || trimmed === name) {
      setLocalKey(name);
      return;
    }
    onRename?.(trimmed);
  };

  const commitValue = () => {
    onValueChange?.(parseLiteral(localVal));
  };

  const previewType = describeType(readOnly ? value : parseLiteral(localVal));
  const badge = SCOPE_BADGE[scope];
  const hasRuntimeDiff =
    runtimeValue !== undefined &&
    formatLiteral(runtimeValue) !== formatLiteral(value);

  return (
    <div className="group flex items-center gap-1 border-b border-fl-border px-4 py-1 hover:bg-fl-panel-2">
      {/* Scope badge */}
      <span
        className="flex h-4 w-[26px] flex-shrink-0 items-center justify-center rounded font-mono text-[7px] font-bold"
        style={{ background: `${badge.color}20`, color: badge.color }}
        title={scope}
      >
        {badge.label}
      </span>

      {/* Name */}
      {readOnly ? (
        <span
          className="min-w-0 flex-[1.2] truncate font-mono text-[10px] text-fl-text-dim"
          title={name}
        >
          {name}
        </span>
      ) : (
        <input
          value={localKey}
          onChange={(e) => setLocalKey(e.target.value)}
          onBlur={commitKey}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setLocalKey(name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="min-w-0 flex-[1.2] bg-transparent px-1 font-mono text-[10px] text-fl-text outline-none"
        />
      )}

      {/* Value */}
      {readOnly ? (
        <span
          className="min-w-0 flex-[2] truncate font-mono text-[10px] text-fl-text"
          title={formatLiteral(value)}
        >
          {formatLiteral(value) || '""'}
        </span>
      ) : (
        <input
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={commitValue}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="min-w-0 flex-[2] rounded border border-fl-border bg-fl-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none focus:border-fl-text-dim"
        />
      )}

      {/* Type */}
      <span
        className="w-[38px] flex-shrink-0 text-right font-mono text-[8px] text-fl-text-ghost"
      >
        {previewType}
      </span>

      {/* Runtime value diff */}
      {hasRuntimeDiff && (
        <span
          className="w-[70px] flex-shrink-0 truncate text-right font-mono text-[8px] text-[#22c55e]"
          title={`実行中: ${formatLiteral(runtimeValue)}`}
        >
          → {formatLiteral(runtimeValue)}
        </span>
      )}
      {!hasRuntimeDiff && runtimeValue !== undefined && (
        <span className="w-[70px] flex-shrink-0" />
      )}

      {/* Delete */}
      {readOnly ? (
        <span className="w-[20px]" />
      ) : (
        <button
          type="button"
          onClick={onDelete}
          className="w-[20px] flex-shrink-0 text-fl-text-faint opacity-0 transition-all group-hover:opacity-100 hover:text-red-500"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
