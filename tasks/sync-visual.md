# タスク: 同期ポイントの視覚改善

## 変更するファイル (2つだけ)

1. `src/app/components/SyncLine.tsx`
2. `src/app/App.tsx`

## 現状

`SyncLine.tsx` は同期ポイントを 1 本の縦線 + 上部ダイヤモンドで描画している。
全トラックを突き抜ける単色の線で、どのトラックが待機対象か区別できない。

## ゴール

トラックごとに個別のダイヤモンドマーカーを描き、
そのトラックに待機対象ブロックがあるかどうかで塗り分ける。

## 手順

### Step 1: App.tsx — SyncLine に追加 props を渡す

`App.tsx:456` 付近の `regularTrackHeight` の useMemo を変更し、
`computeTracksLayout` の結果をまるごと保持する:

```tsx
// Before
const regularTrackHeight = useMemo(
  () => computeTracksLayout(scenario.tracks).totalHeight,
  [scenario.tracks],
);

// After
const tracksLayout = useMemo(
  () => computeTracksLayout(scenario.tracks),
  [scenario.tracks],
);
const regularTrackHeight = tracksLayout.totalHeight;
```

`App.tsx:682` 付近の SyncLine 呼び出しを変更:

```tsx
// Before
<SyncLine sp={sp} totalHeight={regularTrackHeight} onDelete={store.deleteSync} />

// After
<SyncLine
  sp={sp}
  tracks={scenario.tracks}
  trackHeights={tracksLayout.perTrack.map(t => t.trackHeight)}
  trackTops={tracksLayout.trackTops}
  onDelete={store.deleteSync}
/>
```

### Step 2: SyncLine.tsx — トラック別マーカーに書き換え

Props を変更:

```tsx
interface Props {
  sp: SyncPoint;
  tracks: Track[];         // scenario.tracks
  trackHeights: number[];  // 各トラックの高さ (px)
  trackTops: number[];     // 各トラックの上端 Y (px)
  onDelete: (id: string) => void;
}
```

描画ロジック:

1. `totalHeight = trackTops の最後 + trackHeights の最後` で全体高を算出
2. 各トラックについて、`track.blocks.some(b => b.slot < sp.slot)` で待機対象か判定
3. 各トラックの中央 Y (`trackTops[i] + trackHeights[i] / 2`) にダイヤモンドを描画:
   - **待機対象**: 塗りつぶし `bg-[#f43f5e]`
   - **通過**: 枠線のみ `border border-[#f43f5e] bg-transparent opacity-30`
4. マーカー間を細い縦線 (width: 1px, `#f43f5e44`) でつなぐ
5. ダイヤモンドサイズは 10x10px, `rotate-45 rounded-sm`

ツールチップ:
```
同期: {sp.label} #{sp.slot}
待機: {待機対象トラック名をカンマ区切り}
```

### 参考: 現在の SyncLine.tsx (48行)

```tsx
import { useState } from 'react';
import type { SyncPoint } from '../types';
import { SLOT_PX } from '../layout';

interface Props {
  sp: SyncPoint;
  totalHeight: number;
  onDelete: (id: string) => void;
}

export function SyncLine({ sp, totalHeight, onDelete }: Props) {
  const [hov, setHov] = useState(false);
  const x = sp.slot * SLOT_PX;
  return (
    <div
      className="absolute top-0 cursor-pointer"
      style={{
        left: x,
        width: 2,
        height: totalHeight,
        background: hov ? '#f43f5e' : '#f43f5e88',
        transition: 'background 0.15s',
        zIndex: 10,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onDelete(sp.id)}
      title={`同期ポイント: #${sp.slot} — クリックで削除`}
    >
      <div
        className="absolute -top-2 left-1/2 -translate-x-1/2 rotate-45 rounded-sm bg-[#f43f5e]"
        style={{ width: 12, height: 12 }}
      />
      <div
        className="absolute whitespace-nowrap font-mono text-[9px] font-bold tracking-wider text-[#f43f5e]"
        style={{ top: 14, left: 6 }}
      >
        {sp.label} #{sp.slot}
      </div>
    </div>
  );
}
```

## 注意

- SyncLine は `pointer-events-none` のオーバーレイ内にある。各マーカーに `pointer-events-auto` を設定
- `Track` 型は `import type { Track, SyncPoint } from '../types'` から
- `SLOT_PX` は `import { SLOT_PX } from '../layout'` から
- `computeTracksLayout` は `import { computeTracksLayout } from '../trackLayout'` から (App.tsx で既に import 済み)
- トラック高は動的 (switch の N レーン対応) なので `trackHeights[i]` を使うこと
