import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Terminal, Filter } from 'lucide-react';
import type { ExecutionPhase, LogEntry } from '../engine';
import type { Track } from '../types';

interface Props {
  logs: LogEntry[];
  phase: ExecutionPhase;
  phaseLabel: string;
  running: boolean;
  /** All scenario tracks — used to resolve trackId → name / color. */
  tracks: Track[];
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

/**
 * Bottom panel showing the running scenario's live logs.
 *
 * Now includes:
 * - Track name/colour badge on each log line
 * - Timestamp column
 * - Per-track filter toggle
 */
export function ExecutionLogPanel({
  logs,
  phase,
  phaseLabel,
  running,
  tracks,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [filterTrackId, setFilterTrackId] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const trackMap = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    for (const t of tracks) {
      m.set(t.id, { name: t.name, color: t.color });
    }
    return m;
  }, [tracks]);

  // Auto-expand when a run starts.
  const prevRunning = useRef(running);
  useEffect(() => {
    if (running && !prevRunning.current) setExpanded(true);
    prevRunning.current = running;
  }, [running]);

  // Auto-scroll to the newest log line while expanded.
  useEffect(() => {
    if (!expanded) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, expanded]);

  const filteredLogs = useMemo(
    () =>
      filterTrackId
        ? logs.filter((l) => l.trackId === filterTrackId)
        : logs,
    [logs, filterTrackId],
  );

  const lastLog = filteredLogs[filteredLogs.length - 1];

  // Distinct trackIds present in logs for the filter menu.
  const logTrackIds = useMemo(() => {
    const ids = new Set<string>();
    for (const l of logs) {
      if (l.trackId) ids.add(l.trackId);
    }
    return [...ids];
  }, [logs]);

  return (
    <div className="flex flex-shrink-0 flex-col border-t border-fl-border bg-fl-panel">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-3 px-5 py-1.5 text-left transition-colors hover:bg-fl-panel-2"
      >
        <Terminal
          className="h-3 w-3"
          style={{ color: PHASE_COLOR[phase] }}
        />
        <span
          className="font-mono text-[10px] font-bold"
          style={{ color: PHASE_COLOR[phase] }}
        >
          {phaseLabel}
        </span>
        {running && (
          <span
            className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
            style={{ background: PHASE_COLOR[phase] }}
          />
        )}
        <span className="truncate font-mono text-[9px] text-fl-text-faint">
          {lastLog
            ? `${lastLog.level.toUpperCase()} · ${lastLog.message}`
            : '実行ログはまだありません'}
        </span>
        <div className="ml-auto flex items-center gap-2 text-fl-text-faint">
          <span className="font-mono text-[9px]">
            {filterTrackId
              ? `${filteredLogs.length}/${logs.length}`
              : `${logs.length}`}{' '}
            logs
          </span>
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-fl-border bg-fl-bg">
          {/* Filter toolbar */}
          <div className="flex items-center gap-2 border-b border-fl-border px-5 py-1">
            <button
              type="button"
              onClick={() => setShowFilter((v) => !v)}
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
            className="fl-scroll max-h-40 min-h-20 overflow-auto px-5 py-2"
          >
            {filteredLogs.length === 0 ? (
              <div className="font-mono text-[10px] text-fl-text-ghost">
                （空）
              </div>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {filteredLogs.map((log) => {
                  const t = log.trackId ? trackMap.get(log.trackId) : undefined;
                  return (
                    <li
                      key={log.id}
                      className="flex items-baseline gap-2 font-mono text-[10px] leading-relaxed"
                    >
                      {/* Timestamp */}
                      <span className="flex-shrink-0 text-fl-text-ghost">
                        {formatTime(log.time)}
                      </span>

                      {/* Level badge */}
                      <span
                        className="flex-shrink-0 uppercase"
                        style={{
                          color: LEVEL_COLOR[log.level],
                          minWidth: 34,
                        }}
                      >
                        {log.level}
                      </span>

                      {/* Track badge */}
                      {t && (
                        <span
                          className="flex-shrink-0 rounded px-1 py-px text-[8px] font-bold"
                          style={{
                            background: `${t.color}22`,
                            color: t.color,
                          }}
                        >
                          {t.name}
                        </span>
                      )}

                      {/* Message */}
                      <span className="text-fl-text">{log.message}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
