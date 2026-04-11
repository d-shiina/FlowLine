import { useEffect, useMemo, useRef, useState } from 'react';
import { HEADER_W, MIN_SLOTS, RULER_H, SLOT_PX, TRACK_H } from './layout';
import { useScenario } from './useScenario';
import type { Block, Scenario } from './types';
import { Toolbar, type EditMode } from './components/Toolbar';
import { Ruler } from './components/Ruler';
import { TrackRow } from './components/TrackRow';
import { SyncLine } from './components/SyncLine';
import { AddBlockModal } from './components/AddBlockModal';
import { SyncModal } from './components/SyncModal';
import { Inspector } from './components/Inspector';

/**
 * Root application. Owns scenario state, playback, selection, and modals.
 * The timeline canvas is block-based: 1 slot = 1 logical step, not 1 second.
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
        max = Math.max(max, b.slot + b.span + 2);
      }
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
    const t = scenario.tracks.find((x) => x.id === selected.trackId);
    return t?.blocks.find((b) => b.id === selected.blockId) ?? null;
  }, [selected, scenario]);

  const handleCanvasClick = (trackId: string, slot: number) => {
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

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(scenario, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenario.name || 'flowline-scenario'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => fileInputRef.current?.click();

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

  // ─── render ────────────────────────────────────────────────────────
  const canvasWidth = totalSlots * SLOT_PX + HEADER_W;
  const totalTrackHeight = scenario.tracks.length * TRACK_H;

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
          ブロック右端ドラッグ=リサイズ / 本体ドラッグ=スロット移動 / ⬡=クリックで削除
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
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
                onRename={store.renameTrack}
                onDelete={store.deleteTrack}
                onUpdateBlock={store.updateBlock}
                onDeleteBlock={(tid, bid) => {
                  store.deleteBlock(tid, bid);
                  if (selected?.blockId === bid) setSelected(null);
                }}
                onSelectBlock={(tid, bid) => setSelected({ trackId: tid, blockId: bid })}
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

            {/* Sync overlay + global playhead */}
            <div
              className="pointer-events-none absolute"
              style={{
                top: RULER_H,
                left: HEADER_W,
                width: totalSlots * SLOT_PX,
                height: totalTrackHeight,
                zIndex: 9,
              }}
            >
              {scenario.syncPoints.map((sp) => (
                <div key={sp.id} className="pointer-events-auto">
                  <SyncLine
                    sp={sp}
                    totalHeight={totalTrackHeight}
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
          onChange={store.updateBlock}
          onClose={() => setSelected(null)}
        />
      </div>

      {/* Footer legend */}
      <div className="flex flex-shrink-0 flex-wrap gap-6 border-t border-[#0f172a] bg-[#0a1020] px-5 py-1.5">
        {(
          [
            ['─', '#3B82F6', 'ブロック幅 = span (slots)'],
            ['⬡', '#f43f5e', '同期ポイント = DAG合流'],
            ['↔', '#475569', '右端ドラッグでリサイズ'],
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
    </div>
  );
}
