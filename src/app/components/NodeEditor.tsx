import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import {
  AlertTriangle,
  Check,
  FilePlus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import type {
  NodeFileEntry,
  NodeLoadError,
  NodeManifestEntry,
} from '../../globals';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after a successful save / reload so the caller can
   * refresh its cached manifest (driving the Inspector NODE
   * dropdown, AddBlockModal, etc.).
   */
  onManifestChanged: (manifest: NodeManifestEntry[]) => void;
  /** Python install state, from useNodeManifest / App. */
  pythonReady: boolean;
}

interface EditorState {
  path: string;
  original: string;
  source: string;
  isNew: boolean;
}

const NEW_NODE_TEMPLATE = `from flowline import node


@node(
    id="custom/my_node",
    label="新規ノード",
    category="custom",
    version="0.1.0",
    ports={
        # "target": {"kind": "in", "type": "string"},
        # "result": {"kind": "out", "type": "string"},
    },
    params={
        # "message": {"type": "string", "default": ""},
    },
    on_error="abort",
)
def run(ports, params, ctx):
    """Minimal custom node. Rewrite to taste."""
    ctx.log("info", "hello from custom node")
    return {}
`;

/**
 * In-app editor for FLOWLINE's Python node source files.
 *
 * Layout:
 *
 *   ┌───────────────────────────────────────┐
 *   │ node list │  [path input] [save/new/reload/delete]  │
 *   │  (tree)   │                                         │
 *   │           │  <textarea monospace source>            │
 *   │           │  [load errors panel]                    │
 *   └───────────────────────────────────────┘
 *
 * The left sidebar lists node files on disk (from listNodeFiles).
 * Clicking one loads its source into the editor. On Save, the
 * source is written and a worker reload is triggered so the new
 * registration takes effect immediately. Load errors from the
 * reload surface in the footer panel so a syntax error is visible
 * inline without tailing a terminal.
 *
 * The monospace textarea is deliberately unstyled — no Monaco
 * bundle, no syntax highlighting — to keep the renderer footprint
 * small. Users who want a full IDE can edit files on disk directly;
 * this editor is for quick tweaks and one-off custom nodes.
 */
export function NodeEditor({
  open,
  onOpenChange,
  onManifestChanged,
  pythonReady,
}: Props) {
  const [files, setFiles] = useState<NodeFileEntry[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [loadErrors, setLoadErrors] = useState<NodeLoadError[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<
    { kind: 'info' | 'ok' | 'error'; text: string } | null
  >(null);

  const refreshFileList = useCallback(async (): Promise<NodeFileEntry[]> => {
    const api = window.flowlineRuntime;
    if (!api) return [];
    const res = await api.listNodeFiles();
    if (res.ok) {
      setFiles(res.files);
      return res.files;
    } else {
      setStatus({ kind: 'error', text: res.error });
      return [];
    }
  }, []);

  const refreshLoadErrors = useCallback(async () => {
    const api = window.flowlineRuntime;
    if (!api) return;
    try {
      const errs = await api.loadErrors();
      setLoadErrors(errs);
    } catch {
      /* best effort */
    }
  }, []);

  // Load the file list and latest load errors when the modal opens.
  useEffect(() => {
    if (!open) return;
    void refreshFileList();
    void refreshLoadErrors();
  }, [open, refreshFileList, refreshLoadErrors]);

  // Group files by top-level folder for a compact sidebar.
  const grouped = useMemo(() => {
    const out = new Map<string, NodeFileEntry[]>();
    for (const f of files) {
      const [cat] = f.path.split('/');
      const bucket = out.get(cat) ?? [];
      bucket.push(f);
      out.set(cat, bucket);
    }
    return Array.from(out.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [files]);

  const handleOpen = async (entry: NodeFileEntry) => {
    const api = window.flowlineRuntime;
    if (!api) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await api.readNodeSource(entry.path);
      if (res.ok) {
        const source = res.source ?? '';
        setEditor({
          path: entry.path,
          original: source,
          source,
          isNew: false,
        });
      } else {
        setStatus({ kind: 'error', text: res.error });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleNew = () => {
    const next = `custom/my_node_${Date.now().toString(36)}.py`;
    setEditor({
      path: next,
      original: '',
      source: NEW_NODE_TEMPLATE,
      isNew: true,
    });
    setStatus({
      kind: 'info',
      text: 'パスと id を書き換えて保存してください',
    });
  };

  const handleSave = async () => {
    if (!editor) return;
    const api = window.flowlineRuntime;
    if (!api) return;
    setBusy(true);
    setStatus({ kind: 'info', text: '保存して再読込中…' });
    try {
      const wrote = await api.writeNodeSource(editor.path, editor.source);
      if (!wrote.ok) {
        setStatus({ kind: 'error', text: wrote.error });
        return;
      }
      // Trigger a worker reload so the new source is live.
      const reload = await api.reloadNodes();
      if (!reload.ok) {
        setStatus({ kind: 'error', text: reload.error });
        return;
      }
      // Refresh the file list in case we just created a file.
      await refreshFileList();
      setLoadErrors(reload.loadErrors);
      onManifestChanged(reload.manifest);
      // Update editor state so the dirty indicator clears.
      setEditor((cur) =>
        cur
          ? { ...cur, original: editor.source, isNew: false }
          : cur,
      );
      // Success status + hint if the saved file produced a load
      // error (syntax error, missing import, etc.) so the user
      // knows why the new node isn't registered.
      const fileError = reload.loadErrors.find(
        (e) => e.path === editor.path,
      );
      if (fileError) {
        setStatus({
          kind: 'error',
          text: `保存しましたが読込に失敗: ${fileError.message}`,
        });
      } else {
        setStatus({ kind: 'ok', text: '保存して再読込しました' });
      }
    } catch (err) {
      setStatus({ kind: 'error', text: (err as Error).message ?? String(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!editor) return;
    const api = window.flowlineRuntime;
    if (!api) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`${editor.path} を削除しますか？`)) return;
    setBusy(true);
    try {
      const res = await api.deleteNodeSource(editor.path);
      if (!res.ok) {
        setStatus({ kind: 'error', text: res.error });
        return;
      }
      const reload = await api.reloadNodes();
      if (reload.ok) {
        setLoadErrors(reload.loadErrors);
        onManifestChanged(reload.manifest);
      }
      await refreshFileList();
      setEditor(null);
      setStatus({ kind: 'ok', text: '削除しました' });
    } finally {
      setBusy(false);
    }
  };

  const handleReload = async () => {
    const api = window.flowlineRuntime;
    if (!api) return;
    setBusy(true);
    setStatus({ kind: 'info', text: '再読込中…' });
    try {
      const reload = await api.reloadNodes();
      if (reload.ok) {
        setLoadErrors(reload.loadErrors);
        onManifestChanged(reload.manifest);
        setStatus({ kind: 'ok', text: '再読込しました' });
      } else {
        setStatus({ kind: 'error', text: reload.error });
      }
    } finally {
      setBusy(false);
    }
  };

  const dirty = editor ? editor.source !== editor.original || editor.isNew : false;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[210] flex h-[80vh] w-[900px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-fl-border-strong bg-fl-modal p-5 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <Dialog.Title className="font-mono text-[13px] font-bold text-fl-text">
                Python ノードエディタ
              </Dialog.Title>
              <Dialog.Description className="font-mono text-[9px] text-fl-text-faint">
                _runtime/nodes/ 配下の Python ファイルを編集・保存し、ワーカーを再読込します
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReload}
                disabled={busy || !pythonReady}
                className="flex items-center gap-1 rounded border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[10px] text-fl-text-dim transition-colors hover:text-fl-text disabled:cursor-not-allowed disabled:opacity-40"
                title="ファイルを書き換えずに再読込"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                再読込
              </button>
              <Dialog.Close className="rounded border border-fl-border-strong bg-transparent px-3 py-1 font-mono text-[10px] text-fl-text-faint">
                閉じる
              </Dialog.Close>
            </div>
          </div>

          {!pythonReady && (
            <div className="mb-3 rounded-lg border border-[#f59e0b] bg-[#f59e0b10] px-3 py-2 font-mono text-[10px] text-[#f59e0b]">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              Python ランタイムが未接続です。ファイル編集はできますが、保存後の自動再読込は無効です。
            </div>
          )}

          <div className="flex min-h-0 flex-1 gap-3">
            {/* ── File list sidebar ─────────────────────────── */}
            <div className="fl-scroll flex w-56 flex-shrink-0 flex-col gap-2 overflow-y-auto rounded-lg border border-fl-border bg-fl-panel-2 p-2">
              <button
                type="button"
                onClick={handleNew}
                className="flex items-center justify-center gap-1 rounded border border-dashed border-[#22c55e] bg-[#22c55e10] px-2 py-1 font-mono text-[10px] font-bold text-[#22c55e] transition-colors hover:bg-[#22c55e20]"
              >
                <FilePlus className="h-2.5 w-2.5" />
                新規ノード
              </button>
              {grouped.length === 0 && (
                <div className="py-6 text-center font-mono text-[10px] text-fl-text-ghost">
                  (ファイル無し)
                </div>
              )}
              {grouped.map(([cat, list]) => (
                <div key={cat} className="flex flex-col gap-0.5">
                  <div className="sticky top-0 bg-fl-panel-2 pt-1 font-mono text-[9px] tracking-wider text-fl-text-faint">
                    {cat}
                  </div>
                  {list.map((f) => {
                    const active = editor?.path === f.path;
                    const hasError = loadErrors.some((e) => e.path === f.path);
                    return (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => handleOpen(f)}
                        className="flex items-center gap-1 truncate rounded px-1.5 py-1 text-left font-mono text-[10px] transition-colors"
                        style={{
                          background: active
                            ? '#3b82f622'
                            : 'transparent',
                          color: active
                            ? '#60a5fa'
                            : hasError
                              ? '#ef4444'
                              : 'var(--fl-text-muted)',
                        }}
                        title={f.path}
                      >
                        {hasError && (
                          <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0 text-[#ef4444]" />
                        )}
                        <span className="truncate">
                          {f.path.slice(cat.length + 1)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* ── Editor pane ──────────────────────────────── */}
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              {editor ? (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      value={editor.path}
                      onChange={(e) =>
                        setEditor({ ...editor, path: e.target.value })
                      }
                      spellCheck={false}
                      className="flex-1 rounded border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[11px] text-fl-text outline-none focus:border-[#3b82f6]"
                      placeholder="custom/my_node.py"
                    />
                    {dirty && (
                      <span className="font-mono text-[9px] text-[#f59e0b]">
                        未保存
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={busy || !dirty}
                      className="flex items-center gap-1 rounded border border-[#3b82f6] bg-[#3b82f622] px-3 py-1 font-mono text-[10px] font-bold text-[#3b82f6] transition-colors hover:bg-[#3b82f633] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Save className="h-2.5 w-2.5" />
                      保存 + 再読込
                    </button>
                    {!editor.isNew && (
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={busy}
                        className="flex items-center gap-1 rounded border border-[#ef444455] px-2 py-1 font-mono text-[10px] text-[#ef4444] transition-colors hover:bg-[#ef444415] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                        削除
                      </button>
                    )}
                  </div>

                  <textarea
                    value={editor.source}
                    onChange={(e) =>
                      setEditor({ ...editor, source: e.target.value })
                    }
                    spellCheck={false}
                    className="fl-scroll min-h-0 flex-1 resize-none rounded-lg border border-fl-border-strong bg-fl-bg p-3 font-mono text-[11px] leading-relaxed text-fl-text outline-none focus:border-[#3b82f6]"
                    placeholder="# Python source..."
                  />
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-fl-border-strong bg-fl-panel-2">
                  <div className="text-center font-mono text-[10px] text-fl-text-ghost">
                    左のリストからノードを選ぶか、
                    <br />
                    「新規ノード」でテンプレートから作成
                  </div>
                </div>
              )}

              {/* Status strip */}
              {status && (
                <div
                  className="flex items-center gap-1 rounded px-2 py-1 font-mono text-[9px]"
                  style={{
                    background:
                      status.kind === 'ok'
                        ? '#22c55e18'
                        : status.kind === 'error'
                          ? '#ef444418'
                          : 'var(--fl-panel-2)',
                    color:
                      status.kind === 'ok'
                        ? '#22c55e'
                        : status.kind === 'error'
                          ? '#ef4444'
                          : 'var(--fl-text-faint)',
                  }}
                >
                  {status.kind === 'ok' && <Check className="h-2.5 w-2.5" />}
                  {status.kind === 'error' && (
                    <AlertTriangle className="h-2.5 w-2.5" />
                  )}
                  {status.text}
                </div>
              )}

              {/* Load errors panel — only shows when the worker
                  reported at least one file that failed to import. */}
              {loadErrors.length > 0 && (
                <div className="fl-scroll max-h-[140px] overflow-y-auto rounded-lg border border-[#ef444455] bg-[#ef44440a] p-2">
                  <div className="mb-1 flex items-center gap-1 font-mono text-[9px] font-bold tracking-wider text-[#ef4444]">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    読込エラー ({loadErrors.length})
                  </div>
                  {loadErrors.map((err) => (
                    <div
                      key={err.path}
                      className="mb-1 rounded bg-fl-bg px-2 py-1"
                    >
                      <div className="font-mono text-[10px] text-fl-text">
                        {err.path}
                      </div>
                      <div className="font-mono text-[9px] text-[#ef4444]">
                        {err.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
