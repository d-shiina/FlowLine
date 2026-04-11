import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ERROR_DIVIDER_H,
  HEADER_W,
  MIN_SLOTS,
  RULER_H,
  SLOT_PX,
  TRACK_H,
} from './layout';
import { useScenario, uid } from './useScenario';
import { useTheme } from './useTheme';
import { useExecution } from './engine';
import { useNodeManifest } from './useNodeManifest';
import { computeTracksLayout } from './trackLayout';
import type { Block, Scenario, Track } from './types';
import { ERROR_HANDLER_ID } from './types';
import { Titlebar } from './components/Titlebar';
import { Toolbar, type EditMode } from './components/Toolbar';
import { FloatingToolbox } from './components/FloatingToolbox';
import { Ruler } from './components/Ruler';
import { TrackRow } from './components/TrackRow';
import { SyncLine } from './components/SyncLine';
import { AddBlockModal } from './components/AddBlockModal';
import { SyncModal } from './components/SyncModal';
import { SamplesModal } from './components/SamplesModal';
import { VariablesModal } from './components/VariablesModal';
import { NodeEditor } from './components/NodeEditor';
import { PythonInstallModal } from './components/PythonInstallModal';
import type { PythonStatus } from '../globals';
import { GraphEdges } from './components/GraphEdges';
import { SubroutineSidebar } from './components/SubroutineSidebar';
import { Inspector } from './components/Inspector';
import { ExecutionLogPanel } from './components/ExecutionLogPanel';

/**
 * Root application. Owns scenario state, playback, selection, and modals.
 * The timeline canvas is block-based: 1 slot = 1 logical step, not 1 second.
 * The error handler track is rendered below the add-track row; it cannot
 * receive sync points.
 */
type EditorMode =
  | { type: 'scenario' }
  | { type: 'subroutine'; id: string };

/**
 * Locate a block anywhere in the scenario and return it together with
 * its owning container id. Used by the link tool to decide which end
 * of a new dep edge should be the dependent so the arrow always
 * points left→right.
 */
function findBlockById(
  scenario: Scenario,
  blockId: string,
): { block: Block; containerId: string } | null {
  for (const t of scenario.tracks) {
    const hit = t.blocks.find((b) => b.id === blockId);
    if (hit) return { block: hit, containerId: t.id };
  }
  const eh = scenario.errorHandler.blocks.find((b) => b.id === blockId);
  if (eh) return { block: eh, containerId: ERROR_HANDLER_ID };
  for (const sub of scenario.subroutines) {
    const hit = sub.blocks.find((b) => b.id === blockId);
    if (hit) return { block: hit, containerId: sub.id };
  }
  return null;
}

export default function App() {
  const store = useScenario();
  const { scenario } = store;
  const { theme, toggle: toggleTheme } = useTheme();

  // ─── editor mode (scenario vs subroutine) ──────────────────────────
  const [editorMode, setEditorMode] = useState<EditorMode>({
    type: 'scenario',
  });
  const activeSubroutine =
    editorMode.type === 'subroutine'
      ? scenario.subroutines.find((s) => s.id === editorMode.id) ?? null
      : null;

  // If the open subroutine disappears (deleted or undone), fall back to
  // the scenario view automatically.
  useEffect(() => {
    if (
      editorMode.type === 'subroutine' &&
      !scenario.subroutines.some((s) => s.id === editorMode.id)
    ) {
      setEditorMode({ type: 'scenario' });
    }
  }, [editorMode, scenario.subroutines]);

  // Synthesize a Track wrapper so the TrackRow / BlockView / GraphEdges
  // components can treat the subroutine's flat block list as a track.
  const subroutineTrack: Track | null = activeSubroutine
    ? {
        id: activeSubroutine.id,
        name: activeSubroutine.name,
        color: '#94a3b8',
        blocks: activeSubroutine.blocks,
      }
    : null;

  // ─── execution engine ──────────────────────────────────────────────
  const execution = useExecution();
  const playing = execution.running;
  const blockStatus = execution.state.status;
  const currentSlotByTrack = execution.state.currentSlot;

  // For each block, compute the range of slots it can legally occupy
  // without inverting any dep arrow. `min` is one past the rightmost
  // block it depends on; `max` is one before the leftmost block that
  // depends on it. Bounds are global (deps can cross tracks), so we
  // look at every block regardless of container. Subroutines are
  // self-contained graphs, so they're computed separately.
  //
  // The drag handler reads this via BlockView's `slotBounds` prop and
  // clamps the target slot so L→R order is always preserved — the
  // "backward arrow" case that used to be rendered as a dashed user-
  // error line simply can't be constructed through dragging anymore.
  const blockSlotBounds = useMemo(() => {
    const acc: Record<string, { min: number; max: number }> = {};

    // Compute bounds for one isolated dep graph (an array of block
    // arrays that share a single dep namespace). Main graph = regular
    // tracks + error handler. Each subroutine is its own graph.
    const computeFor = (containers: Block[][]) => {
      const slotOf = new Map<string, number>();
      const dependentsOf = new Map<string, string[]>();
      for (const blocks of containers) {
        for (const b of blocks) slotOf.set(b.id, b.slot);
      }
      for (const blocks of containers) {
        for (const b of blocks) {
          for (const d of b.deps) {
            const arr = dependentsOf.get(d);
            if (arr) arr.push(b.id);
            else dependentsOf.set(d, [b.id]);
          }
        }
      }
      for (const blocks of containers) {
        for (const b of blocks) {
          let min = 0;
          for (const d of b.deps) {
            const ds = slotOf.get(d);
            if (ds !== undefined) min = Math.max(min, ds + 1);
          }
          let max = Number.POSITIVE_INFINITY;
          for (const did of dependentsOf.get(b.id) ?? []) {
            const ds = slotOf.get(did);
            if (ds !== undefined) max = Math.min(max, ds - 1);
          }
          acc[b.id] = { min, max };
        }
      }
    };

    computeFor([
      ...scenario.tracks.map((t) => t.blocks),
      scenario.errorHandler.blocks,
    ]);
    for (const sub of scenario.subroutines) computeFor([sub.blocks]);

    return acc;
  }, [scenario]);

  const totalSlots = useMemo(() => {
    let max = MIN_SLOTS;
    if (editorMode.type === 'subroutine' && activeSubroutine) {
      for (const b of activeSubroutine.blocks) {
        max = Math.max(max, b.slot + 2);
      }
      return max;
    }
    for (const t of scenario.tracks) {
      for (const b of t.blocks) {
        max = Math.max(max, b.slot + 2);
      }
    }
    for (const b of scenario.errorHandler.blocks) {
      max = Math.max(max, b.slot + 2);
    }
    for (const sp of scenario.syncPoints) max = Math.max(max, sp.slot + 2);
    return max;
  }, [scenario, editorMode, activeSubroutine]);

  const togglePlay = useCallback(() => {
    if (execution.running) {
      execution.abort();
      return;
    }
    // Starting a fresh run — clear stale statuses/logs from the previous
    // run so the UI doesn't show leftover colors.
    execution.clear();
    execution.start(scenario);
  }, [execution, scenario]);

  // ─── mode + modals ─────────────────────────────────────────────────
  const [mode, setModeState] = useState<EditMode>('block');
  const [linkSource, setLinkSource] = useState<{
    trackId: string;
    blockId: string;
  } | null>(null);
  const setMode = useCallback((m: EditMode) => {
    setModeState(m);
    setLinkSource(null);
  }, []);
  const [addModal, setAddModal] = useState<{
    trackId: string;
    trackName: string;
    trackColor: string;
    slot: number;
    /** Set when the click landed inside a loop/branch frame. */
    parentBlockId?: string;
  } | null>(null);
  const [syncModal, setSyncModal] = useState<{ slot: number } | null>(null);

  // ─── selection ─────────────────────────────────────────────────────
  const [selected, setSelected] = useState<{
    trackId: string;
    blockId: string;
  } | null>(null);

  const selectedBlock: Block | null = useMemo(() => {
    if (!selected) return null;
    if (selected.trackId === ERROR_HANDLER_ID) {
      return (
        scenario.errorHandler.blocks.find((b) => b.id === selected.blockId) ??
        null
      );
    }
    const t = scenario.tracks.find((x) => x.id === selected.trackId);
    if (t) return t.blocks.find((b) => b.id === selected.blockId) ?? null;
    const sub = scenario.subroutines.find((s) => s.id === selected.trackId);
    if (sub) return sub.blocks.find((b) => b.id === selected.blockId) ?? null;
    return null;
  }, [selected, scenario]);

  const isErrorHandlerSelection = selected?.trackId === ERROR_HANDLER_ID;

  // List the loop / branch blocks that live on the same container as
  // the current selection so Inspector's "内包先" dropdown can offer
  // them as nesting targets. Nested containers ARE allowed, but we
  // walk the parent chain to exclude containers that would create
  // a cycle (the selected block's descendants). Self is always
  // excluded.
  const availableContainers = useMemo(() => {
    if (!selected) return [];
    const findContainer = (): Block[] | null => {
      if (selected.trackId === ERROR_HANDLER_ID) {
        return scenario.errorHandler.blocks;
      }
      const t = scenario.tracks.find((x) => x.id === selected.trackId);
      if (t) return t.blocks;
      const sub = scenario.subroutines.find((s) => s.id === selected.trackId);
      return sub ? sub.blocks : null;
    };
    const blocks = findContainer();
    if (!blocks) return [];

    // Descendants of the selected block — we can't nest into one of
    // our own descendants without forming a cycle in the parent
    // chain. BFS over parentBlockId links inside the same container.
    const descendants = new Set<string>();
    const queue = [selected.blockId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const b of blocks) {
        if (b.parentBlockId === id && !descendants.has(b.id)) {
          descendants.add(b.id);
          queue.push(b.id);
        }
      }
    }

    return blocks
      .filter(
        (b) =>
          b.id !== selected.blockId &&
          !descendants.has(b.id) &&
          (b.type === 'loop' ||
            b.type === 'branch' ||
            b.type === 'switch'),
      )
      .map((b) => {
        const cases: string[] =
          b.type === 'branch'
            ? ['then', 'else']
            : b.type === 'switch'
              ? Array.isArray(
                  (b.params as Record<string, unknown> | undefined)?.cases,
                )
                ? (
                    (b.params as { cases: unknown[] }).cases.map((c) =>
                      String(c),
                    )
                  )
                : []
              : [];
        return { id: b.id, label: b.label, type: b.type, cases };
      });
  }, [selected, scenario]);

  /**
   * Resolve a dep id back to a human-readable label ("label #slot") by
   * walking every block container. Used by the Inspector deps list.
   */
  const resolveDepLabel = useCallback(
    (depId: string): string => {
      const search = (blocks: Block[]) =>
        blocks.find((b) => b.id === depId);
      for (const t of scenario.tracks) {
        const hit = search(t.blocks);
        if (hit) return `${hit.label} #${hit.slot}`;
      }
      const ehHit = search(scenario.errorHandler.blocks);
      if (ehHit) return `${ehHit.label} #${ehHit.slot}`;
      for (const sub of scenario.subroutines) {
        const hit = search(sub.blocks);
        if (hit) return `${hit.label} #${hit.slot}`;
      }
      return depId;
    },
    [scenario],
  );

  const handleCanvasClick = (
    trackId: string,
    slot: number,
    parent?: { blockId: string; branch?: 'then' | 'else' },
  ) => {
    // In link mode, clicking empty canvas cancels the pending link source.
    if (mode === 'link') {
      setLinkSource(null);
      return;
    }
    // The error handler track ignores sync mode — sync points don't apply.
    if (trackId === ERROR_HANDLER_ID) {
      setAddModal({
        trackId,
        trackName: 'エラー処理',
        trackColor: '#f43f5e',
        slot,
        parentBlockId: parent?.blockId,
      });
      return;
    }
    // Subroutine editor ignores sync mode too — sync points are scenario-level.
    if (editorMode.type === 'subroutine' && subroutineTrack) {
      setAddModal({
        trackId,
        trackName: subroutineTrack.name,
        trackColor: subroutineTrack.color,
        slot,
        parentBlockId: parent?.blockId,
      });
      return;
    }
    if (mode === 'sync') {
      setSyncModal({ slot });
    } else {
      const t = scenario.tracks.find((x) => x.id === trackId);
      if (!t) return;
      setAddModal({
        trackId,
        trackName: t.name,
        trackColor: t.color,
        slot,
        parentBlockId: parent?.blockId,
      });
    }
  };

  /**
   * Click handler for blocks. In normal/sync mode this just selects the
   * block. In link mode the first click sets the link source and the
   * second click creates a dep edge (second block depends on first).
   */
  const handleBlockClick = useCallback(
    (trackId: string, blockId: string) => {
      if (mode === 'link') {
        if (!linkSource) {
          setLinkSource({ trackId, blockId });
          return;
        }
        if (linkSource.blockId === blockId) {
          setLinkSource(null); // clicking the source again cancels
          return;
        }
        // Decide which block is the dep and which is the dependent by
        // slot, so the arrow is always drawn left→right regardless of
        // which end the user clicked first. Same-slot clicks are
        // rejected because the direction would be ambiguous.
        const a = findBlockById(scenario, linkSource.blockId);
        const b = findBlockById(scenario, blockId);
        if (a && b) {
          if (a.block.slot < b.block.slot) {
            store.addDep(trackId, blockId, linkSource.blockId);
          } else if (a.block.slot > b.block.slot) {
            store.addDep(
              linkSource.trackId,
              linkSource.blockId,
              blockId,
            );
          }
          // slot === slot: ignore, ambiguous direction.
        }
        setLinkSource(null);
        setSelected({ trackId, blockId });
        return;
      }
      setSelected({ trackId, blockId });
    },
    [mode, linkSource, store, scenario],
  );

  // ─── JSON import / export ──────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(scenario, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenario.name || 'flowline-scenario'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [scenario]);

  const handleImport = useCallback(() => fileInputRef.current?.click(), []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Scenario;
      if (!parsed.version || !Array.isArray(parsed.tracks)) {
        throw new Error('invalid scenario');
      }
      store.replace(parsed);
      setSelected(null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('failed to import scenario', err);
      alert('シナリオの読み込みに失敗しました');
    } finally {
      e.target.value = '';
    }
  };

  // ─── python runtime status ────────────────────────────────────────
  // On first mount, ask the main process whether the isolated Python
  // runtime is present. If it isn't, pop the install modal automatically
  // so first-run users are guided through the download. The status is
  // also passed to the Toolbar chip so users can re-open the modal at
  // any time (e.g. to verify the install directory).
  const [pythonStatus, setPythonStatus] = useState<PythonStatus | null>(null);
  const [pythonModalOpen, setPythonModalOpen] = useState(false);

  const refreshPythonStatus = useCallback(async () => {
    const api = window.flowlineRuntime;
    if (!api) return null;
    const s = await api.status();
    setPythonStatus(s);
    return s;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await refreshPythonStatus();
      if (!cancelled && s && !s.pythonPath) {
        setPythonModalOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshPythonStatus]);

  const pythonChipState: 'ready' | 'missing' | 'unknown' = pythonStatus
    ? pythonStatus.pythonPath
      ? 'ready'
      : 'missing'
    : 'unknown';

  // Node manifest from the Python worker. Drives the Inspector's
  // node picker / ports editor / params editor. Empty array when
  // the worker isn't up, which makes those panels fall back to
  // "(未設定 / Mock で実行)" — the UI stays fully usable.
  const { manifest: nodeManifest, setManifest: setNodeManifest } =
    useNodeManifest();

  // ─── samples + variables + node editor ────────────────────────────
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [nodeEditorOpen, setNodeEditorOpen] = useState(false);
  const handleLoadSample = useCallback(
    (next: Scenario) => {
      store.replace(next);
      setSelected(null);
    },
    [store],
  );

  // ─── copy / paste clipboard ────────────────────────────────────────
  const clipboardRef = useRef<Block | null>(null);

  const pasteFromClipboard = useCallback(() => {
    const src = clipboardRef.current;
    if (!src) return;
    // Destination: same container as selection, one slot after selected
    // block. If nothing selected, drop on the active container — the
    // open subroutine in subroutine mode, or the first track otherwise.
    let targetId: string | undefined;
    let targetSlot = 0;
    if (selected && selectedBlock) {
      targetId = selected.trackId;
      targetSlot = selectedBlock.slot + 1;
    } else if (editorMode.type === 'subroutine') {
      targetId = editorMode.id;
      targetSlot = 0;
    } else if (scenario.tracks.length > 0) {
      targetId = scenario.tracks[0].id;
      targetSlot = 0;
    }
    if (!targetId) return;
    const newBlock: Block = {
      ...src,
      id: uid('b'),
      slot: targetSlot,
      // Drop deps — pasted blocks may land in a different container where
      // the original deps don't make sense; user can re-link explicitly.
      deps: [],
    };
    store.addBlock(targetId, newBlock);
    setSelected({ trackId: targetId, blockId: newBlock.id });
  }, [selected, selectedBlock, scenario.tracks, editorMode, store]);

  // ─── keyboard shortcuts ───────────────────────────────────────────
  // Delete/Backspace  → delete selected block
  // Escape            → deselect
  // Ctrl/Cmd + S      → export JSON
  // Ctrl/Cmd + O      → import JSON
  // Ctrl/Cmd + Z      → undo
  // Ctrl/Cmd + Shift+Z or Ctrl+Y → redo
  // Ctrl/Cmd + C      → copy selected block to clipboard
  // Ctrl/Cmd + V      → paste after selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') {
        setSelected(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        store.deleteBlock(selected.trackId, selected.blockId);
        setSelected(null);
        return;
      }
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        store.undo();
        return;
      }
      if (
        ctrl &&
        ((e.shiftKey && e.key.toLowerCase() === 'z') ||
          e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        store.redo();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'c' && selectedBlock) {
        e.preventDefault();
        clipboardRef.current = JSON.parse(
          JSON.stringify(selectedBlock),
        ) as Block;
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'v' && clipboardRef.current) {
        e.preventDefault();
        pasteFromClipboard();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleExport();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleImport();
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    selected,
    selectedBlock,
    store,
    handleExport,
    handleImport,
    pasteFromClipboard,
  ]);

  // ─── render ────────────────────────────────────────────────────────
  const canvasWidth = totalSlots * SLOT_PX + HEADER_W;
  // Sync overlay spans regular tracks only — not the error handler,
  // which runs separately on abort. Track heights are dynamic now
  // (switches/branches grow their row), so we sum the per-track
  // computed heights instead of the old TRACK_H constant.
  const regularTrackHeight = useMemo(
    () => computeTracksLayout(scenario.tracks).totalHeight,
    [scenario.tracks],
  );

  const phaseLabel =
    execution.state.phase === 'running'
      ? '実行中'
      : execution.state.phase === 'error-handler'
        ? 'エラー処理中'
        : execution.state.phase === 'done'
          ? '完了'
          : execution.state.phase === 'aborted'
            ? '中止'
            : 'アイドル';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-fl-bg font-mono text-fl-text">
      <Titlebar />
      <Toolbar
        playing={playing}
        onTogglePlay={togglePlay}
        onImport={handleImport}
        onExport={handleExport}
        onSample={() => setSamplesOpen(true)}
        onOpenVariables={() => setVariablesOpen(true)}
        variableCount={Object.keys(scenario.variables.scenario).length}
        onOpenNodeEditor={() => setNodeEditorOpen(true)}
        nodeCount={nodeManifest.length}
        scenarioName={scenario.name}
        onRenameScenario={store.renameScenario}
        theme={theme}
        onToggleTheme={toggleTheme}
        pythonState={pythonChipState}
        onOpenPythonInstall={() => setPythonModalOpen(true)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFile}
        className="hidden"
      />

      <div className="flex flex-shrink-0 gap-5 border-b border-fl-border bg-fl-panel px-5 py-1.5">
        {mode === 'block' && (
          <div className="text-[9px] text-[#3b82f6]">
            ▶ キャンバスをクリックしてブロック配置
          </div>
        )}
        {mode === 'link' && (
          <div className="text-[9px] text-[#60a5fa]">
            {linkSource
              ? '⟶ 2つ目のブロックをクリックで依存元 → 依存先のリンクを作成'
              : '⟶ 依存元のブロックを選択してください'}
          </div>
        )}
        {mode === 'sync' && (
          <div className="text-[9px] text-[#f43f5e]">
            ⬡ キャンバスをクリックして同期ポイント配置
          </div>
        )}
        <div className="ml-auto text-[9px] text-fl-text-ghost">
          ブロックドラッグ=スロット移動 / Ctrl+Z=元に戻す / Del=削除
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <SubroutineSidebar
          subroutines={scenario.subroutines}
          activeSubroutineId={
            editorMode.type === 'subroutine' ? editorMode.id : null
          }
          onAdd={(name) => {
            store.addSubroutine(name);
          }}
          onRename={store.renameSubroutine}
          onDelete={(id) => {
            // If we're currently editing this subroutine, close the editor
            // before deleting so selection/linkSource don't dangle.
            if (
              editorMode.type === 'subroutine' &&
              editorMode.id === id
            ) {
              setEditorMode({ type: 'scenario' });
              setSelected(null);
              setLinkSource(null);
            }
            store.deleteSubroutine(id);
          }}
          onOpen={(id) => {
            setEditorMode({ type: 'subroutine', id });
            setSelected(null);
            setLinkSource(null);
          }}
        />
        <div className="relative min-h-0 flex-1">
          <div className="fl-scroll absolute inset-0 overflow-auto">
          {editorMode.type === 'subroutine' && subroutineTrack && (
            <div className="flex items-center gap-2 border-b border-fl-border bg-fl-panel px-4 py-2">
              <button
                type="button"
                onClick={() => {
                  setEditorMode({ type: 'scenario' });
                  setSelected(null);
                  setLinkSource(null);
                }}
                className="font-mono text-[10px] text-fl-text-dim transition-colors hover:text-fl-text"
              >
                シナリオ
              </button>
              <span className="font-mono text-[10px] text-fl-text-ghost">/</span>
              <div className="font-mono text-[11px] font-bold text-[#60a5fa]">
                ⎔ {subroutineTrack.name}
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditorMode({ type: 'scenario' });
                  setSelected(null);
                  setLinkSource(null);
                }}
                className="ml-auto flex items-center gap-1 rounded-md border border-fl-border-strong bg-fl-panel-2 px-2 py-0.5 font-mono text-[9px] text-fl-text-dim transition-colors hover:border-fl-text-dim hover:text-fl-text"
                title="シナリオビューに戻る"
              >
                × 閉じる
              </button>
            </div>
          )}

          <div className="relative" style={{ minWidth: canvasWidth }}>
            {/* Ruler row */}
            <div className="flex">
              <div
                className="flex-shrink-0 border-b border-r border-fl-border bg-fl-panel"
                style={{ width: HEADER_W, height: RULER_H, borderRightWidth: 3 }}
              />
              <div className="relative flex-1 overflow-hidden">
                <Ruler totalSlots={totalSlots} playheadSlot={-1} />
              </div>
            </div>

            {editorMode.type === 'scenario' ? (
              <>
                {/* Tracks */}
                {scenario.tracks.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    totalSlots={totalSlots}
                    blockStatus={blockStatus}
                    slotBounds={blockSlotBounds}
                    currentSlot={currentSlotByTrack[track.id]}
                    selectedBlockId={selected?.blockId ?? null}
                    linkSourceBlockId={linkSource?.blockId ?? null}
                    blocksDraggable={mode === 'block'}
                    subroutines={scenario.subroutines}
                    onRename={store.renameTrack}
                    onDelete={store.deleteTrack}
                    onUpdateBlock={store.updateBlock}
                    onDeleteBlock={(tid, bid) => {
                      store.deleteBlock(tid, bid);
                      if (selected?.blockId === bid) setSelected(null);
                    }}
                    onSelectBlock={handleBlockClick}
                    onCanvasClick={handleCanvasClick}
                    onMoveContainerTree={store.moveBlockTree}
                  />
                ))}

                {/* Add track row */}
                <button
                  type="button"
                  onClick={store.addTrack}
                  className="flex h-9 w-full cursor-pointer border-b border-dashed border-fl-border text-left"
                >
                  <div
                    className="flex flex-shrink-0 items-center bg-fl-panel px-3"
                    style={{
                      width: HEADER_W,
                      borderRight: '3px solid var(--fl-border)',
                    }}
                  >
                    <span className="text-[9px] text-fl-text-ghost">
                      + トラック追加
                    </span>
                  </div>
                  <div className="flex-1 bg-fl-bg" />
                </button>

                {/* Error handler separator */}
                <div
                  className="flex items-center border-t border-b border-[#f43f5e33] bg-fl-error-panel px-3"
                  style={{ height: ERROR_DIVIDER_H }}
                >
                  <span className="font-mono text-[9px] tracking-wider text-[#f43f5e]">
                    ⚠ SCENARIO ERROR HANDLER
                  </span>
                  <span className="ml-3 font-mono text-[8px] text-[#f43f5e99]">
                    abort 発火時にのみ実行されるクリーンアップトラック
                  </span>
                </div>

                {/* Error handler track */}
                <TrackRow
                  track={scenario.errorHandler}
                  totalSlots={totalSlots}
                  blockStatus={blockStatus}
                  slotBounds={blockSlotBounds}
                  currentSlot={currentSlotByTrack[ERROR_HANDLER_ID]}
                  selectedBlockId={selected?.blockId ?? null}
                  linkSourceBlockId={linkSource?.blockId ?? null}
                  blocksDraggable={mode === 'block'}
                  variant="error"
                  subroutines={scenario.subroutines}
                  onRename={store.renameTrack}
                  onDelete={store.deleteTrack}
                  onUpdateBlock={store.updateBlock}
                  onDeleteBlock={(tid, bid) => {
                    store.deleteBlock(tid, bid);
                    if (selected?.blockId === bid) setSelected(null);
                  }}
                  onSelectBlock={handleBlockClick}
                  onCanvasClick={handleCanvasClick}
                  onMoveContainerTree={store.moveBlockTree}
                />

                {/* DAG edges + sync overlay + global playhead */}
                <div
                  className="pointer-events-none absolute"
                  style={{
                    top: RULER_H,
                    left: HEADER_W,
                    width: totalSlots * SLOT_PX,
                    height: regularTrackHeight,
                    zIndex: 9,
                  }}
                >
                  <GraphEdges
                    tracks={scenario.tracks}
                    totalSlots={totalSlots}
                    selectedBlockId={
                      selected && selected.trackId !== ERROR_HANDLER_ID
                        ? selected.blockId
                        : null
                    }
                  />
                  {scenario.syncPoints.map((sp) => (
                    <div key={sp.id} className="pointer-events-auto">
                      <SyncLine
                        sp={sp}
                        totalHeight={regularTrackHeight}
                        onDelete={store.deleteSync}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              subroutineTrack && (
                <>
                  <TrackRow
                    track={subroutineTrack}
                    totalSlots={totalSlots}
                    blockStatus={blockStatus}
                    slotBounds={blockSlotBounds}
                    currentSlot={currentSlotByTrack[subroutineTrack.id]}
                    selectedBlockId={selected?.blockId ?? null}
                    linkSourceBlockId={linkSource?.blockId ?? null}
                    blocksDraggable={mode === 'block'}
                    subroutines={scenario.subroutines}
                    onRename={(id, name) => store.renameSubroutine(id, name)}
                    onDelete={() => {
                      /* subroutine sidebar handles delete */
                    }}
                    onUpdateBlock={store.updateBlock}
                    onDeleteBlock={(tid, bid) => {
                      store.deleteBlock(tid, bid);
                      if (selected?.blockId === bid) setSelected(null);
                    }}
                    onSelectBlock={handleBlockClick}
                    onCanvasClick={handleCanvasClick}
                    onMoveContainerTree={store.moveBlockTree}
                  />

                  {/* DAG edges for the subroutine's single track */}
                  <div
                    className="pointer-events-none absolute"
                    style={{
                      top: RULER_H,
                      left: HEADER_W,
                      width: totalSlots * SLOT_PX,
                      height: TRACK_H,
                      zIndex: 9,
                    }}
                  >
                    <GraphEdges
                      tracks={[subroutineTrack]}
                      totalSlots={totalSlots}
                      selectedBlockId={
                        selected && selected.trackId === subroutineTrack.id
                          ? selected.blockId
                          : null
                      }
                    />
                  </div>
                </>
              )
            )}
          </div>
          </div>
          <FloatingToolbox
            mode={mode}
            onModeChange={setMode}
            canUndo={store.canUndo}
            canRedo={store.canRedo}
            onUndo={store.undo}
            onRedo={store.redo}
          />
        </div>

        <Inspector
          block={selectedBlock}
          trackId={selected?.trackId ?? null}
          isErrorHandler={isErrorHandlerSelection}
          linkMode={mode === 'link'}
          resolveDepLabel={resolveDepLabel}
          nodeManifest={nodeManifest}
          scenarioVariables={scenario.variables.scenario}
          availableContainers={availableContainers}
          onCreateVariable={store.setVariable}
          onChange={store.updateBlock}
          onRemoveDep={store.removeDep}
          onClose={() => setSelected(null)}
        />
      </div>

      {/* Execution log panel (collapses to a thin status bar when idle) */}
      <ExecutionLogPanel
        logs={execution.state.logs}
        phase={execution.state.phase}
        phaseLabel={phaseLabel}
        running={execution.running}
      />

      {/* Modals */}
      {addModal && (
        <AddBlockModal
          open={!!addModal}
          onOpenChange={(o) => !o && setAddModal(null)}
          trackName={addModal.trackName}
          trackColor={addModal.trackColor}
          slot={addModal.slot}
          subroutines={scenario.subroutines}
          onAdd={(block) => {
            // Preserve the pre-click container hit so blocks added
            // inside a loop/branch frame land already nested.
            const nested: Block = addModal.parentBlockId
              ? { ...block, parentBlockId: addModal.parentBlockId }
              : block;
            store.addBlock(addModal.trackId, nested);
          }}
        />
      )}
      {syncModal && (
        <SyncModal
          open={!!syncModal}
          onOpenChange={(o) => !o && setSyncModal(null)}
          slot={syncModal.slot}
          tracks={scenario.tracks}
          onAdd={store.addSync}
        />
      )}
      <SamplesModal
        open={samplesOpen}
        onOpenChange={setSamplesOpen}
        onLoad={handleLoadSample}
      />
      <VariablesModal
        open={variablesOpen}
        onOpenChange={setVariablesOpen}
        variables={scenario.variables.scenario}
        runtimeSnapshot={execution.state.variables}
        onSet={store.setVariable}
        onRename={store.renameVariable}
        onDelete={store.deleteVariable}
      />
      <NodeEditor
        open={nodeEditorOpen}
        onOpenChange={setNodeEditorOpen}
        onManifestChanged={setNodeManifest}
        pythonReady={pythonChipState === 'ready'}
      />
      <PythonInstallModal
        open={pythonModalOpen}
        onOpenChange={setPythonModalOpen}
        status={pythonStatus}
        onInstalled={() => {
          void refreshPythonStatus();
        }}
      />
    </div>
  );
}
