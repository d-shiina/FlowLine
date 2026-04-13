import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScenario, uid } from './useScenario';
import { useTheme } from './useTheme';
import { useExecution } from './engine';
import { useNodeManifest } from './useNodeManifest';
import type { Block, Scenario, Track } from './types';
import { ERROR_HANDLER_ID } from './types';
import { Titlebar } from './components/Titlebar';
import { Toolbar, type EditMode } from './components/Toolbar';
import { FloatingToolbox } from './components/FloatingToolbox';
import { ScenarioTabs } from './components/ScenarioTabs';
import { useScenarioTabs } from './useScenarioTabs';
import { Timeline } from './components/Timeline';
import { AddBlockModal } from './components/AddBlockModal';
import { SyncModal } from './components/SyncModal';
import { SamplesModal } from './components/SamplesModal';
// VariablesModal replaced by BottomPanel variables tab
import { NodeEditor } from './components/NodeEditor';
import { PythonInstallModal } from './components/PythonInstallModal';
import type { PythonStatus } from '../globals';
import { SubroutineSidebar } from './components/SubroutineSidebar';
import { Inspector } from './components/Inspector';
import { BottomPanel } from './components/BottomPanel';
import { FlowchartEditor } from './components/FlowchartEditor';

/**
 * Root application. Owns scenario state, playback, selection, and modals.
 * The timeline canvas is block-based: 1 slot = 1 logical step, not 1 second.
 * The error handler track is rendered below the add-track row; it cannot
 * receive sync points.
 */
type EditorMode =
  | { type: 'scenario' }
  | { type: 'subroutine'; id: string };

export default function App() {
  const store = useScenario();
  const { scenario } = store;
  const tabsStore = useScenarioTabs(scenario);
  const { theme, toggle: toggleTheme } = useTheme();

  // Keep the active tab's snapshot in sync with the live scenario.
  useEffect(() => {
    tabsStore.syncActive(scenario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  const handleSwitchTab = useCallback(
    (targetId: string) => {
      const next = tabsStore.switchTab(targetId, scenario);
      if (next) store.replace(next);
    },
    [tabsStore, scenario, store],
  );

  const handleNewTab = useCallback(() => {
    const next = tabsStore.openTab();
    store.replace(next);
  }, [tabsStore, store]);

  const handleCloseTab = useCallback(
    (targetId: string) => {
      const next = tabsStore.closeTab(targetId, scenario);
      if (next) store.replace(next);
    },
    [tabsStore, scenario, store],
  );

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

  // Synthesize a Track wrapper so the TrackRow / BlockView components
  // can treat the subroutine's flat block list as a track.
  const subroutineTrack: Track | null = activeSubroutine
    ? {
        id: activeSubroutine.id,
        name: activeSubroutine.name,
        color: '#94a3b8',
        blocks: activeSubroutine.blocks,
      }
    : null;

  // ─── flowchart editor navigation ──────────────────────────────────
  const [editingBlock, setEditingBlock] = useState<{
    trackId: string;
    blockId: string;
  } | null>(null);

  // Resolve the block and its track for the flowchart editor.
  const editingTrack = editingBlock
    ? scenario.tracks.find((t) => t.id === editingBlock.trackId) ?? null
    : null;
  const editingBlockData = editingTrack
    ? (editingTrack.blocks.find((b) => b.id === editingBlock?.blockId) ?? null)
    : null;

  // Auto-fallback: if the block disappears (undo / delete), close the editor.
  useEffect(() => {
    if (!editingBlock) return;
    const track = scenario.tracks.find((t) => t.id === editingBlock.trackId);
    const block = track?.blocks.find((b) => b.id === editingBlock.blockId);
    if (!block) setEditingBlock(null);
  }, [editingBlock, scenario.tracks]);

  // ─── execution engine ──────────────────────────────────────────────
  const execution = useExecution();
  const playing = execution.running;
  const blockStatus = execution.state.status;

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
  const [mode, setMode] = useState<EditMode>('block');
  const [addModal, setAddModal] = useState<{
    trackId: string;
    trackName: string;
    trackColor: string;
    slot: number;
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleCanvasClick = (trackId: string, slot: number) => {
    // The error handler track ignores sync mode — sync points don't apply.
    if (trackId === ERROR_HANDLER_ID) {
      setAddModal({
        trackId,
        trackName: 'エラー処理',
        trackColor: '#f43f5e',
        slot,
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
      });
    }
  };

  /** Click handler for blocks — selects the clicked block. */
  const handleBlockClick = useCallback(
    (trackId: string, blockId: string) => {
      setSelected({ trackId, blockId });
    },
    [],
  );

  // Node manifest from the Python worker. Drives node picker, ports,
  // params, and the export node-embedding logic.
  const { manifest: nodeManifest, setManifest: setNodeManifest } =
    useNodeManifest();

  // ─── .fls / JSON import / export ───────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(async () => {
    const scenarioApi = window.flowlineScenario;
    if (scenarioApi) {
      // Native .fls export via Electron main process.
      try {
        const usedNodeIds = new Set<string>();
        const collectFromBlocks = (blocks: Block[]) => {
          for (const b of blocks) {
            for (const s of b.steps) {
              if (s.nodeId) usedNodeIds.add(s.nodeId);
            }
          }
        };
        for (const t of scenario.tracks) collectFromBlocks(t.blocks);
        collectFromBlocks(scenario.errorHandler.blocks);
        for (const sub of scenario.subroutines) collectFromBlocks(sub.blocks);

        const result = await scenarioApi.exportFile(
          JSON.stringify(scenario),
          [...usedNodeIds],
          nodeManifest,
        );
        if (result.ok) return;
        // Fall through to JSON fallback on error.
      } catch {
        // Fall through to JSON fallback.
      }
    }

    // Fallback: JSON export (works in any environment).
    const blob = new Blob([JSON.stringify(scenario, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenario.name || 'flowline-scenario'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [scenario, nodeManifest]);

  const handleImport = useCallback(async () => {
    const scenarioApi = window.flowlineScenario;
    if (scenarioApi) {
      try {
        // Native .fls import via Electron main process.
        const result = await scenarioApi.importFile();
        if (!result.ok) {
          // User cancelled or error — fall through if error.
          if (!result.error) return;
          // Fall through to browser file picker on error.
        } else if (result.scenario) {
          // Reload manifest if nodes were installed/updated.
          if (
            result.installedNodes.length > 0 ||
            result.updatedNodes.length > 0
          ) {
            const runtime = window.flowlineRuntime;
            if (runtime) {
              try {
                const reload = await runtime.reloadNodes();
                if (reload.ok) setNodeManifest(reload.manifest);
              } catch {
                // Will pick up on next worker restart.
              }
            }
          }

          store.replace(result.scenario as Scenario);
          setSelected(null);
          return;
        }
      } catch {
        // Fall through to browser file picker.
      }
    }

    // Fallback: browser file picker.
    fileInputRef.current?.click();
  }, [store, setNodeManifest]);

  // Legacy browser file handler (used when flowlineScenario API is unavailable).
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Scenario;
      if (!parsed.version || !Array.isArray(parsed.tracks)) {
        throw new Error('invalid scenario');
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { embeddedNodes: _unused, ...clean } = parsed;
      store.replace(clean as Scenario);
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

  // ─── samples + variables + node editor ────────────────────────────
  const [samplesOpen, setSamplesOpen] = useState(false);
  // Variables are now in the BottomPanel, no modal needed
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
        if (editingBlock) {
          setEditingBlock(null);
        } else {
          setSelected(null);
        }
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
    editingBlock,
    store,
    handleExport,
    handleImport,
    pasteFromClipboard,
  ]);

  // ─── render ────────────────────────────────────────────────────────
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
      <ScenarioTabs
        tabs={tabsStore.tabs}
        activeId={tabsStore.activeId}
        onSwitch={handleSwitchTab}
        onClose={handleCloseTab}
        onNewTab={handleNewTab}
      />
      <Toolbar
        playing={playing}
        onTogglePlay={togglePlay}
        onImport={handleImport}
        onExport={handleExport}
        onSample={() => setSamplesOpen(true)}
        onOpenNodeEditor={() => setNodeEditorOpen(true)}
        nodeCount={nodeManifest.length}
        theme={theme}
        onToggleTheme={toggleTheme}
        pythonState={pythonChipState}
        onOpenPythonInstall={() => setPythonModalOpen(true)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".fls,.json"
        onChange={handleFile}
        className="hidden"
      />

      {/* Flowchart editor — replaces the entire main area */}
      {editingBlock && editingBlockData && editingTrack && (
        <div className="flex min-h-0 flex-1">
          <FlowchartEditor
            block={editingBlockData}
            trackName={editingTrack.name}
            trackColor={editingTrack.color}
            scenarioName={scenario.name}
            subroutines={scenario.subroutines}
            nodeManifest={nodeManifest}
            scenarioVariables={scenario.variables.scenario}
            executionStatus={blockStatus}
            running={playing}
            onBack={() => setEditingBlock(null)}
            onUpdateBlock={(patch) => {
              store.updateBlock(
                editingBlock.trackId,
                editingBlock.blockId,
                patch,
              );
            }}
            onCreateVariable={store.setVariable}
            onRunStep={(stepId) => {
              execution.clear();
              execution.start(scenario, { singleStepId: stepId });
            }}
            onRunFromStep={(stepId) => {
              execution.clear();
              execution.start(scenario, {
                singleBlockId: editingBlock.blockId,
                startStepId: stepId,
              });
            }}
            onRunBlock={() => {
              execution.clear();
              execution.start(scenario, {
                singleBlockId: editingBlock.blockId,
              });
            }}
          />
        </div>
      )}

      <div className={`flex min-h-0 flex-1 ${editingBlock ? 'hidden' : ''}`}>
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
            // before deleting so selection doesn't dangle.
            if (
              editorMode.type === 'subroutine' &&
              editorMode.id === id
            ) {
              setEditorMode({ type: 'scenario' });
              setSelected(null);
            }
            store.deleteSubroutine(id);
          }}
          onOpen={(id) => {
            setEditorMode({ type: 'subroutine', id });
            setSelected(null);
          }}
        />
        <div className="relative min-h-0 flex-1">
          {editorMode.type === 'scenario' ? (
            <Timeline
              scenario={scenario}
              blockStatus={blockStatus}
              selectedBlockId={selected?.blockId ?? null}
              running={playing}
              currentSlotByTrack={execution.state.currentSlot}
              onSelectBlock={(tid, bid) => handleBlockClick(tid, bid)}
              onOpenBlock={(tid, bid) =>
                setEditingBlock({ trackId: tid, blockId: bid })
              }
              onUpdateBlock={store.updateBlock}
              onDeleteBlock={(tid, bid) => {
                store.deleteBlock(tid, bid);
                if (selected?.blockId === bid) setSelected(null);
              }}
              onCanvasClick={(trackId, slot) => {
                if (trackId === ERROR_HANDLER_ID) {
                  setAddModal({
                    trackId,
                    trackName: 'エラー処理',
                    trackColor: '#f43f5e',
                    slot,
                  });
                  return;
                }
                if (mode === 'sync') {
                  setSyncModal({ slot });
                  return;
                }
                const t = scenario.tracks.find((x) => x.id === trackId);
                if (!t) return;
                setAddModal({
                  trackId,
                  trackName: t.name,
                  trackColor: t.color,
                  slot,
                });
              }}
              onAddTrack={store.addTrack}
              onRenameTrack={store.renameTrack}
              onDeleteTrack={store.deleteTrack}
              onDeleteSyncPoint={store.deleteSync}
            />
          ) : (
          <div className="fl-scroll absolute inset-0 overflow-auto">
          {editorMode.type === 'subroutine' && subroutineTrack && (
            <div className="flex items-center gap-2 border-b border-fl-border bg-fl-panel px-4 py-2">
              <button
                type="button"
                onClick={() => {
                  setEditorMode({ type: 'scenario' });
                  setSelected(null);
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
                    }}
                className="ml-auto flex items-center gap-1 rounded-md border border-fl-border-strong bg-fl-panel-2 px-2 py-0.5 font-mono text-[9px] text-fl-text-dim transition-colors hover:border-fl-text-dim hover:text-fl-text"
                title="シナリオビューに戻る"
              >
                × 閉じる
              </button>
            </div>
          )}

          {subroutineTrack && (
            <div className="px-4 py-4 font-mono text-[10px] text-fl-text-faint">
              サブルーチン: {subroutineTrack.name} (暫定表示)
            </div>
          )}
          </div>
          )}
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
          onChange={store.updateBlock}
          onClose={() => setSelected(null)}
        />
      </div>

      {/* Bottom panel: logs + variables tabs */}
      <BottomPanel
        logs={execution.state.logs}
        phase={execution.state.phase}
        phaseLabel={phaseLabel}
        running={execution.running}
        tracks={scenario.tracks}
        variables={scenario.variables.scenario}
        runtimeSnapshot={execution.state.variables}
        onSetVariable={store.setVariable}
        onRenameVariable={store.renameVariable}
        onDeleteVariable={store.deleteVariable}
      />

      {/* Modals */}
      {addModal && (
        <AddBlockModal
          open={!!addModal}
          onOpenChange={(o) => !o && setAddModal(null)}
          trackName={addModal.trackName}
          trackColor={addModal.trackColor}
          slot={addModal.slot}
          onAdd={(block) => {
            store.addBlock(addModal.trackId, block);
          }}
        />
      )}
      {syncModal && (
        <SyncModal
          open={!!syncModal}
          onOpenChange={(o) => !o && setSyncModal(null)}
          slot={syncModal.slot}
          onAdd={store.addSync}
        />
      )}
      <SamplesModal
        open={samplesOpen}
        onOpenChange={setSamplesOpen}
        onLoad={handleLoadSample}
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
