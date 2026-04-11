import { Play, Square, Plus, Upload, Download, Hexagon, Box } from 'lucide-react';

export type EditMode = 'block' | 'sync';

interface Props {
  mode: EditMode;
  onModeChange: (m: EditMode) => void;
  playing: boolean;
  onTogglePlay: () => void;
  onAddTrack: () => void;
  onImport: () => void;
  onExport: () => void;
}

export function Toolbar({
  mode,
  onModeChange,
  playing,
  onTogglePlay,
  onAddTrack,
  onImport,
  onExport,
}: Props) {
  return (
    <div className="flex flex-shrink-0 items-center justify-between border-b border-[#0f172a] bg-[#0a1020] px-5 py-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] text-[13px]">
          <Play className="h-3.5 w-3.5 fill-white stroke-white" />
        </div>
        <div>
          <div className="text-[13px] font-bold tracking-wider text-slate-100">
            FLOWLINE
          </div>
          <div className="text-[9px] text-slate-600">
            Block-based Multi-Track RPA Editor
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-[#1e293b] bg-[#0f172a]">
          <button
            type="button"
            onClick={() => onModeChange('block')}
            className="flex items-center gap-1 border-r border-[#1e293b] px-3.5 py-1.5 font-mono text-[10px] font-bold transition-colors"
            style={{
              background: mode === 'block' ? '#3B82F620' : 'transparent',
              color: mode === 'block' ? '#3B82F6' : '#475569',
            }}
          >
            <Box className="h-3 w-3" /> ブロック追加
          </button>
          <button
            type="button"
            onClick={() => onModeChange('sync')}
            className="flex items-center gap-1 px-3.5 py-1.5 font-mono text-[10px] font-bold transition-colors"
            style={{
              background: mode === 'sync' ? '#f43f5e20' : 'transparent',
              color: mode === 'sync' ? '#f43f5e' : '#475569',
            }}
          >
            <Hexagon className="h-3 w-3" /> 同期ポイント
          </button>
        </div>

        <button
          type="button"
          onClick={onAddTrack}
          className="flex items-center gap-1 rounded-lg border-[1.5px] border-[#334155] bg-[#0f172a] px-3.5 py-1.5 font-mono text-[10px] font-bold text-slate-400"
        >
          <Plus className="h-3 w-3" /> トラック
        </button>

        <button
          type="button"
          onClick={onImport}
          className="flex items-center gap-1 rounded-lg border-[1.5px] border-[#334155] bg-[#0f172a] px-3 py-1.5 font-mono text-[10px] font-bold text-slate-400"
          title="JSONを読み込み"
        >
          <Upload className="h-3 w-3" /> 読込
        </button>
        <button
          type="button"
          onClick={onExport}
          className="flex items-center gap-1 rounded-lg border-[1.5px] border-[#334155] bg-[#0f172a] px-3 py-1.5 font-mono text-[10px] font-bold text-slate-400"
          title="JSONを保存"
        >
          <Download className="h-3 w-3" /> 保存
        </button>

        <button
          type="button"
          onClick={onTogglePlay}
          className="flex items-center gap-1 rounded-lg border-[1.5px] px-4 py-1.5 font-mono text-[10px] font-bold transition-colors"
          style={{
            borderColor: playing ? '#EF4444' : '#22C55E',
            background: playing ? '#EF444418' : '#22C55E18',
            color: playing ? '#EF4444' : '#22C55E',
          }}
        >
          {playing ? (
            <>
              <Square className="h-3 w-3" /> 停止
            </>
          ) : (
            <>
              <Play className="h-3 w-3" /> 実行
            </>
          )}
        </button>
      </div>
    </div>
  );
}
