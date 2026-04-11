import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import type { ExecutionPhase, LogEntry } from '../engine';

interface Props {
  logs: LogEntry[];
  phase: ExecutionPhase;
  phaseLabel: string;
  running: boolean;
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

/**
 * Bottom panel showing the running scenario's live logs. Collapsed by
 * default as a thin status bar; expands to a scrollable log tail when
 * the user clicks the chevron or when execution starts.
 */
export function ExecutionLogPanel({
  logs,
  phase,
  phaseLabel,
  running,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-expand when a run starts; auto-collapse when it ends if the
  // user hadn't manually expanded beforehand. We deliberately track
  // only the `running` edge so user-triggered collapse sticks.
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

  const lastLog = logs[logs.length - 1];

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
          <span className="font-mono text-[9px]">{logs.length} logs</span>
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          )}
        </div>
      </button>

      {expanded && (
        <div
          ref={scrollRef}
          className="fl-scroll max-h-40 min-h-20 overflow-auto border-t border-fl-border bg-fl-bg px-5 py-2"
        >
          {logs.length === 0 ? (
            <div className="font-mono text-[10px] text-fl-text-ghost">
              （空）
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex gap-2 font-mono text-[10px] leading-relaxed"
                >
                  <span
                    className="flex-shrink-0 uppercase"
                    style={{ color: LEVEL_COLOR[log.level], minWidth: 38 }}
                  >
                    {log.level}
                  </span>
                  <span className="text-fl-text">{log.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
