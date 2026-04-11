import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ERROR_DIVIDER_H,
  HEADER_W,
  MIN_SLOTS,
  RULER_H,
  SLOT_PX,
  TRACK_H,
} from './layout';
import { useScenario } from './useScenario';
import type { Block, Scenario } from './types';
import { ERROR_HANDLER_ID } from './types';
import { Toolbar, type EditMode } from './components/Toolbar';
import { Ruler } from './components/Ruler';
import { TrackRow } from './components/TrackRow';
import { SyncLine } from './components/SyncLine';
import { AddBlockModal } from './components/AddBlockModal';
import { SyncModal } from './components/SyncModal';
import { SamplesModal } from './components/SamplesModal';
import { GraphEdges } from './components/GraphEdges';
import { SubroutineSidebar } from './components/SubroutineSidebar';
import { Inspector } from './components/Inspector';

/**
 * Root application. Owns scenario state, playback, selection, and modals.
 * The timeline canvas is block-based: 1 slot = 1 logical step, not 1 second.
 * The error handler track is rendered below the add-track row; it cannot
 * receive sync points.
 */
export default function App() {
  const store = useScenario();
  const { scenario } = store;

  // ─── playback ──────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(-1); // slot index, -1 = idle
  const playRef = useRef<number | null>(null);

  const totalSlots = useMemo(() => {
    let max = MIN_SLOTS;
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
  }, [scenario]);

  const togglePlay = () => {
    if (playing) {
      if (playRef.current !== null) window.clearInterval(playRef.current);
      playRef.current = null;
      setPlaying(false);
      setPlayhead(-1);
      return;
    }
    setPlaying(true);
    let t = 0;
    setPlayhead(0);
    playRef.current = window.setInterval(() => {
      t += 0.2;
      const slot = parseFloat(t.toFixed(1));
      setPlayhead(slot);
      if (slot >= totalSlots) {
        if (playRef.current !== null) window.clearInterval(playRef.current);
        playRef.current = null;
        window.setTimeout(() => {
          setPlaying(false);
          setPlayhead(-1);
        }, 400);
      }
    }, 120);
  };
  useEffect(
    () => () => {
      if (playRef.current !== null) window.clearInterval(playRef.current);
    },
    [],
  );

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
    return t?.blocks.find((b) => b.id === selected.blockId) ?? null;
  }, [selected, scenario]);

  const isErrorHandlerSelection = selected?.trackId === ERROR_HANDLER_ID;

  const handleCanvasClick = (trackId: string, slot: number) => {
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

  // ─── samples ───────────────────────────────────────────────────────
  const [samplesOpen, setSamplesOpen] = useState(false);
  const handleLoadSample = useCallback(
    (next: Scenario) => {
      store.replace(next);
      setSelected(null);
    },
    [store],
  );

  // ─── keyboard shortcuts ───────────────────────────────────────────
  // Delete/Backspace: delete selected block
  // Escape: deselect
  // Ctrl/Cmd+S: export JSON
  // Ctrl/Cmd+O: trigger file picker
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
  }, [selected, store, handleExport, handleImport]);

  // ─── render ────────────────────────────────────────────────────────
  const canvasWidth = totalSlots * SLOT_PX + HEADER_W;
  // Sync points and playhead line span regular tracks only — not the
  // error handler, which runs separately on abort.
  const regularTrackHeight = scenario.tracks.length * TRACK_H;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#060c1a] font-mono text-slate-200">
      <Toolbar
        mode={mode}
        onModeChange={setMode}
        playing={playing}
        onTogglePlay={togglePlay}
        onAddTrack={store.addTrack}
        onImport={handleImport}
        onExport={handleExport}
        onSample={() => setSamplesOpen(true)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFile}
        className="hidden"
      />

      <div className="flex flex-shrink-0 gap-5 border-b border-[#0f172a] bg-[#0a1020] px-5 py-1.5">
        <div
          className="text-[9px]"
          style={{ color: mode === 'block' ? '#3B82F6' : '#334155' }}
        >
          {mode === 'block' ? '▶ キャンバスをクリックしてブロック配置' : ''}
        </div>
        <div
          className="text-[9px]"
          style={{ color: mode === 'sync' ? '#f43f5e' : '#334155' }}
        >
          {mode === 'sync' ? '⬡ キャンバスをクリックして同期ポイント配置' : ''}
        </div>
        <div className="ml-auto text-[9px] text-[#1e293b]">
          ブロックドラッグ=スロット移動 / 占有済みなら自動で右シフト / ×=削除
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <SubroutineSidebar
          subroutines={scenario.subroutines}
          onAdd={(name) => {
            store.addSubroutine(name);
          }}
          onRename={store.renameSubroutine}
          onDelete={store.deleteSubroutine}
        />
        <div className="fl-scroll min-h-0 flex-1 overflow-auto">
          <div className="relative" style={{ minWidth: canvasWidth }}>
            {/* Ruler row */}
            <div className="flex">
              <div
                className="flex-shrink-0 border-b border-r border-[#0f172a] bg-[#0a1020]"
                style={{ width: HEADER_W, height: RULER_H, borderRightWidth: 3 }}
              />
              <div className="relative flex-1 overflow-hidden">
                <Ruler totalSlots={totalSlots} playheadSlot={playhead} />
              </div>
            </div>

            {/* Tracks */}
            {scenario.tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                totalSlots={totalSlots}
                playheadSlot={playhead}
                selectedBlockId={selected?.blockId ?? null}
                subroutines={scenario.subroutines}
                onRename={store.renameTrack}
                onDelete={store.deleteTrack}
                onUpdateBlock={store.updateBlock}
                onDeleteBlock={(tid, bid) => {
                  store.deleteBlock(tid, bid);
                  if (selected?.blockId === bid) setSelected(null);
                }}
                onSelectBlock={(tid, bid) =>
                  setSelected({ trackId: tid, blockId: bid })
                }
                onCanvasClick={handleCanvasClick}
              />
            ))}

            {/* Add track row */}
            <button
              type="button"
              onClick={store.addTrack}
              className="flex h-9 w-full cursor-pointer border-b border-dashed border-[#0f172a] text-left"
            >
              <div
                className="flex flex-shrink-0 items-center bg-[#0a1020] px-3"
                style={{ width: HEADER_W, borderRight: '3px solid #0f172a' }}
              >
                <span className="text-[9px] text-[#1e293b]">+ トラック追加</span>
              </div>
              <div className="flex-1 bg-[#060c1a]" />
            </button>

            {/* Error handler separator */}
            <div
              className="flex items-center border-t border-b border-[#f43f5e33] bg-[#0a0608] px-3"
              style={{ height: ERROR_DIVIDER_H }}
            >
              <span className="font-mono text-[9px] tracking-wider text-[#f43f5e99]">
                ⚠ SCENARIO ERROR HANDLER
              </span>
              <span className="ml-3 font-mono text-[8px] text-[#f43f5e55]">
                abort 発火時にのみ実行されるクリーンアップトラック
              </span>
            </div>

            {/* Error handler track */}
            <TrackRow
              track={scenario.errorHandler}
              totalSlots={totalSlots}
              playheadSlot={-1}
              selectedBlockId={selected?.blockId ?? null}
              variant="error"
              subroutines={scenario.subroutines}
              onRename={store.renameTrack}
              onDelete={store.deleteTrack}
              onUpdateBlock={store.updateBlock}
              onDeleteBlock={(tid, bid) => {
                store.deleteBlock(tid, bid);
                if (selected?.blockId === bid) setSelected(null);
              }}
              onSelectBlock={(tid, bid) =>
                setSelected({ trackId: tid, blockId: bid })
              }
              onCanvasClick={handleCanvasClick}
            />

            {/* DAG edges + sync overlay + global playhead (regular tracks only) */}
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
              {playhead >= 0 && (
                <div
                  className="pointer-events-none absolute top-0 h-full w-px"
                  style={{
                    left: playhead * SLOT_PX,
                    background: '#22C55E88',
                    boxShadow: '0 0 6px #22C55E',
                  }}
                />
              )}
            </div>
          </div>
        </div>

        <Inspector
          block={selectedBlock}
          trackId={selected?.trackId ?? null}
          isErrorHandler={isErrorHandlerSelection}
          onChange={store.updateBlock}
          onClose={() => setSelected(null)}
        />
      </div>

      {/* Footer legend */}
      <div className="flex flex-shrink-0 flex-wrap gap-6 border-t border-[#0f172a] bg-[#0a1020] px-5 py-1.5">
        {(
          [
            ['▣', '#3B82F6', '1 ブロック = 1 slot'],
            ['⬡', '#f43f5e', '同期ポイント = DAG 合流'],
            ['?', '#eab308', 'バッジ = 非デフォルト属性'],
            ['⚡', '#22C55E', 'トラックは並列実行'],
          ] as const
        ).map(([icon, color, text]) => (
          <div
            key={text}
            className="flex items-center gap-1.5 text-[9px] text-[#334155]"
          >
            <span style={{ color }}>{icon}</span>
            {text}
          </div>
        ))}
        {playhead >= 0 && (
          <div className="ml-auto text-[9px] text-[#22c55e]">
            ▶ slot #{playhead.toFixed(1)}
          </div>
        )}
      </div>

      {/* Modals */}
      {addModal && (
        <AddBlockModal
          open={!!addModal}
          onOpenChange={(o) => !o && setAddModal(null)}
          trackName={addModal.trackName}
          trackColor={addModal.trackColor}
          slot={addModal.slot}
          subroutines={scenario.subroutines}
          onAdd={(block) => store.addBlock(addModal.trackId, block)}
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
    </div>
  );
}
