import { useMemo } from 'react';
import {
  FileText,
  FolderOpen,
  BookOpen,
  Plus,
  Clock,
  X,
  ExternalLink,
} from 'lucide-react';
import type { RecentEntry } from '../useRecentScenarios';

interface Props {
  recent: RecentEntry[];
  onNewScenario: () => void;
  onOpenFile: () => void;
  onOpenSamples: () => void;
  onOpenRecent: (entry: RecentEntry) => void;
  /** Called with the key (path || name) of the recent entry to remove. */
  onRemoveRecent: (key: string) => void;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'たった今';
  if (m < 60) return `${m} 分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 時間前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 日前`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w} 週間前`;
  const mo = Math.floor(d / 30);
  return `${mo} ヶ月前`;
}

export function WelcomePage({
  recent,
  onNewScenario,
  onOpenFile,
  onOpenSamples,
  onOpenRecent,
  onRemoveRecent,
}: Props) {
  const sortedRecent = useMemo(
    () => [...recent].sort((a, b) => b.openedAt - a.openedAt),
    [recent],
  );

  return (
    <div className="fl-scroll h-full w-full overflow-y-auto bg-fl-bg">
      <div className="mx-auto max-w-[880px] px-8 py-12">
        {/* Hero */}
        <div className="mb-10">
          <div className="mb-2 font-mono text-[12px] tracking-[0.3em] text-fl-text-ghost">
            FLOWLINE
          </div>
          <h1 className="mb-2 font-mono text-[28px] font-bold tracking-tight text-fl-text">
            ようこそ
          </h1>
          <p className="font-mono text-[11px] text-fl-text-faint">
            タイムライン × フローチャートで組み立てる、次世代の RPA エディタ
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8">
          {/* Left column: Quick actions */}
          <div>
            <div className="mb-3 font-mono text-[9px] font-bold uppercase tracking-wider text-fl-text-ghost">
              はじめる
            </div>
            <div className="flex flex-col gap-1">
              <ActionRow
                icon={<FileText className="h-4 w-4" />}
                label="新しいシナリオ"
                hint="空のシナリオから作成"
                onClick={onNewScenario}
                accent="#3b82f6"
              />
              <ActionRow
                icon={<FolderOpen className="h-4 w-4" />}
                label="ファイルから開く…"
                hint=".fls / .json をインポート"
                onClick={onOpenFile}
                accent="#22c55e"
              />
              <ActionRow
                icon={<BookOpen className="h-4 w-4" />}
                label="サンプルを読込"
                hint="テンプレートから始める"
                onClick={onOpenSamples}
                accent="#f59e0b"
              />
            </div>

            {/* Docs / help */}
            <div className="mt-8 mb-3 font-mono text-[9px] font-bold uppercase tracking-wider text-fl-text-ghost">
              ヘルプ
            </div>
            <div className="flex flex-col gap-1">
              <HelpLink label="ドキュメント" />
              <HelpLink label="キーボードショートカット" />
              <HelpLink label="GitHub" />
            </div>
          </div>

          {/* Right column: Recent scenarios */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-fl-text-ghost">
                最近のシナリオ
              </div>
              {sortedRecent.length > 0 && (
                <span className="font-mono text-[8px] text-fl-text-ghost">
                  {sortedRecent.length} 件
                </span>
              )}
            </div>

            {sortedRecent.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-fl-border-strong bg-fl-panel-2 py-12 font-mono text-[10px] text-fl-text-ghost">
                <Clock className="h-6 w-6 opacity-40" />
                <span>まだ開いたシナリオがありません</span>
                <span className="text-[8px]">
                  シナリオを開くとここに履歴が残ります
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {sortedRecent.map((entry) => (
                  <RecentRow
                    key={(entry.path || entry.name) + entry.openedAt}
                    entry={entry}
                    onOpen={() => onOpenRecent(entry)}
                    onRemove={() =>
                      onRemoveRecent(entry.path || entry.name)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer tip */}
        <div className="mt-12 border-t border-fl-border pt-6 font-mono text-[9px] text-fl-text-ghost">
          💡 ヒント: タブの{' '}
          <span className="inline-flex items-center gap-0.5 rounded bg-fl-panel-2 px-1 text-fl-text-dim">
            <Plus className="h-2 w-2" />
          </span>{' '}
          ボタンからいつでも新しいシナリオを開けます
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────

function ActionRow({
  icon,
  label,
  hint,
  onClick,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-md border border-transparent bg-fl-panel-2 px-3 py-2.5 text-left transition-colors hover:border-fl-border-strong"
      style={
        {
          '--accent': accent,
        } as React.CSSProperties
      }
    >
      <span
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-colors"
        style={{
          background: `${accent}18`,
          color: accent,
        }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <div className="font-mono text-[11px] font-bold text-fl-text transition-colors group-hover:text-[color:var(--accent)]">
          {label}
        </div>
        <div className="font-mono text-[9px] text-fl-text-ghost">{hint}</div>
      </span>
    </button>
  );
}

function HelpLink({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="group flex items-center gap-2 rounded px-3 py-1.5 text-left font-mono text-[10px] text-fl-text-faint transition-colors hover:bg-fl-panel-2 hover:text-fl-text"
    >
      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
      <span>{label}</span>
    </button>
  );
}

function RecentRow({
  entry,
  onOpen,
  onRemove,
}: {
  entry: RecentEntry;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="group flex items-center gap-3 rounded-md border border-transparent bg-fl-panel-2 px-3 py-2 transition-colors hover:border-fl-border-strong"
    >
      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-fl-text-faint" />
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <div className="truncate font-mono text-[11px] font-bold text-fl-text group-hover:text-[#3b82f6]">
          {entry.name || '(無題)'}
        </div>
        <div className="flex gap-2 truncate font-mono text-[8px] text-fl-text-ghost">
          <span>{formatRelative(entry.openedAt)}</span>
          {entry.trackCount !== undefined && (
            <>
              <span>·</span>
              <span>{entry.trackCount} トラック</span>
            </>
          )}
          {entry.path && (
            <>
              <span>·</span>
              <span className="truncate">{entry.path}</span>
            </>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-fl-text-ghost opacity-0 transition hover:bg-fl-border hover:text-fl-text group-hover:opacity-100"
        title="履歴から削除"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
