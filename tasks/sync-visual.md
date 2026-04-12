# タスク: 同期ポイントの視覚改善

## 変更するファイル (2つだけ)

1. `src/app/components/SyncLine.tsx`
2. `src/app/App.tsx`

## 背景

同期ポイントは slot ベースのバリア — `slot < sp.slot` の**全トラック・全ブロック**が
完了するまで待機する。将来ブレイクポイント (特定トラックの赤丸●) を追加するので、
同期ポイントは「バリア / ゲート」の見た目で明確に差別化する。

## 現状

`SyncLine.tsx` は同期ポイントを**実線の縦線 (2px)** + 上部ダイヤモンドで描画している。
見た目がシンプルすぎてブレイクポイントとの区別がつかない。

## ゴール

同期ポイントを**破線バリア + トラック境界バー**で描画し、
「全トラックを横断するゲート」であることを視覚的に伝える。

### 完成イメージ

```
          ‖  SYNC #4
  ── ── ──╫── ── ──   トラック1
          ‖
  ── ── ──╫── ── ──   トラック2
          ‖
  ── ── ──╫── ── ──   トラック3
```

- 縦線: **破線** (`border-left: 2px dashed #f43f5e88`)
- トラック境界: 各トラックの上端 Y に水平バー (幅 16px, 高さ 2px, `#f43f5e`)
- ラベル: 上部に `{sp.label} #{sp.slot}`
- ホバー時: 破線と水平バーの色が濃くなる (`#f43f5e`)

## 手順

### Step 1: App.tsx — SyncLine にトラック高さ情報を渡す

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
  trackHeights={tracksLayout.perTrack.map(t => t.trackHeight)}
  trackTops={tracksLayout.trackTops}
  totalHeight={regularTrackHeight}
  onDelete={store.deleteSync}
/>
```

### Step 2: SyncLine.tsx — 破線バリア + 水平バーに書き換え

Props を変更:

```tsx
interface Props {
  sp: SyncPoint;
  trackHeights: number[];  // 各トラックの高さ (px)
  trackTops: number[];     // 各トラックの上端 Y (px)
  totalHeight: number;     // 全体高 (px)
  onDelete: (id: string) => void;
}
```

描画ロジック:

1. コンテナ div: `position: absolute`, `left: sp.slot * SLOT_PX`, `height: totalHeight`
2. 縦の破線:
   - `border-left: 2px dashed` で描画
   - 通常: `#f43f5e66` / ホバー: `#f43f5e`
   - `transition: border-color 0.15s`
3. 各トラック境界に水平バー:
   - `trackTops[i]` の Y 位置に配置 (i = 0 を含む全トラック)
   - 幅 16px (左右に 8px ずつはみ出す: `left: -7px`)
   - 高さ 2px
   - 通常: `#f43f5e88` / ホバー: `#f43f5e`
   - `border-radius: 1px`
4. 最下部にも水平バー (`totalHeight` の位置)
5. ラベル: 上部ダイヤモンドは削除。代わりに `‖` アイコン + `{sp.label} #{sp.slot}` を上部に表示
6. ツールチップ: `同期ポイント: {sp.label} #{sp.slot}\nslot {sp.slot} より前の全ブロック完了を待機`

### 参考: 現在の SyncLine.tsx (48行, 全て書き換え対象)

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

- SyncLine は `pointer-events-none` のオーバーレイ内。コンテナ div に `pointer-events-auto` を設定
- `SLOT_PX` は `import { SLOT_PX } from '../layout'` から
- `computeTracksLayout` は `import { computeTracksLayout } from '../trackLayout'` から (App.tsx で既に import 済み)
- トラック高は動的 (switch の N レーン対応) なので `trackHeights[i]` / `trackTops[i]` を使うこと
- 上部ダイヤモンドは削除 — ブレイクポイント (将来) が赤丸●を使うので、形を差別化する
