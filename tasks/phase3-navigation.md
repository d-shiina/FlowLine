# Phase 3: ナビゲーション接続

## 前提

Phase 1 (データモデル) + Phase 2 (フローチャートエディタ) 完了済み。

## 目的

タイムラインの Block をダブルクリックしてフローチャートに入り、
戻れるようにする。

## 変更するファイル

### 1. `src/app/App.tsx`

#### 状態追加

```tsx
const [editingBlock, setEditingBlock] = useState<{
  trackId: string;
  blockId: string;
} | null>(null);
```

#### ビュー切替

メインエリア (タイムライン描画部分) を `editingBlock` で分岐:

```tsx
{editingBlock ? (
  <FlowchartEditor
    block={/* editingBlock から Block を探す */}
    trackName={/* track.name */}
    trackColor={/* track.color */}
    scenarioName={scenario.name}
    subroutines={scenario.subroutines}
    nodeManifest={nodeManifest}
    scenarioVariables={scenario.variables.scenario}
    onBack={() => setEditingBlock(null)}
    onUpdateBlock={(patch) => {
      store.updateBlock(editingBlock.trackId, editingBlock.blockId, patch);
    }}
    onCreateVariable={store.setVariable}
  />
) : (
  /* 既存のタイムライン描画 */
)}
```

Block の検索:
```tsx
const editingTrack = editingBlock
  ? scenario.tracks.find(t => t.id === editingBlock.trackId)
  : null;
const editingBlockData = editingTrack
  ? editingTrack.blocks.find(b => b.id === editingBlock.blockId)
  : null;
```

#### import 追加

```tsx
import { FlowchartEditor } from './components/FlowchartEditor';
```

#### フローチャート表示中の Inspector 抑制

`editingBlock` が set されている間、タイムライン側の Inspector
(`selectedBlockId` に基づく右サイドパネル) を非表示にする。
フローチャートエディタが内部で独自に Inspector を管理する。

### 2. `src/app/components/BlockView.tsx`

#### Props に onDoubleClick を追加

```tsx
interface Props {
  // ... 既存 ...
  onDoubleClick: (trackId: string, blockId: string) => void;
}
```

#### ダブルクリックハンドラ

現在の `onClick` ハンドラの隣に追加:

```tsx
onDoubleClick={(e) => {
  e.stopPropagation();
  onDoubleClick(trackId, block.id);
}}
```

#### TrackRow 経由で Props を受け渡す

`TrackRow.tsx` の Props にも `onDoubleClickBlock` を追加し、
BlockView に渡す:

```tsx
// TrackRow Props
onDoubleClickBlock: (trackId: string, blockId: string) => void;

// BlockView 呼び出し箇所
<BlockView
  // ... 既存 props ...
  onDoubleClick={onDoubleClickBlock}
/>
```

#### App.tsx からの呼び出し

```tsx
<TrackRow
  // ... 既存 props ...
  onDoubleClickBlock={(trackId, blockId) =>
    setEditingBlock({ trackId, blockId })
  }
/>
```

### 3. コンテナフレームのダブルクリック

TrackRow のコンテナフレーム (`containerFrames.map(...)` 内) にも
ダブルクリックを追加する。現在 `onMouseDown` で select + drag を
処理しているので、`onDoubleClick` を追加:

```tsx
onDoubleClick={(e) => {
  e.stopPropagation();
  onDoubleClickBlock(track.id, f.block.id);
}}
```

### 4. Esc キーで戻る

App.tsx に keydown リスナーを追加:

```tsx
useEffect(() => {
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && editingBlock) {
      setEditingBlock(null);
    }
  };
  window.addEventListener('keydown', handleKey);
  return () => window.removeEventListener('keydown', handleKey);
}, [editingBlock]);
```

### 5. 編集中のブロックが消えた場合のフォールバック

undo / delete でブロックが消えたとき、自動で戻る:

```tsx
useEffect(() => {
  if (!editingBlock) return;
  const track = scenario.tracks.find(t => t.id === editingBlock.trackId);
  const block = track?.blocks.find(b => b.id === editingBlock.blockId);
  if (!block) setEditingBlock(null);
}, [editingBlock, scenario.tracks]);
```

## この Phase が完了した状態

- タイムラインの任意のブロックをダブルクリック → フローチャートビューに遷移
- パンくずリスト or Esc でタイムラインに戻れる
- フローチャートビューで Step の追加・削除ができる
- `npx tsc --noEmit` がパスする

## 注意

- フローチャートエディタ内の Inspector はこの Phase ではまだ空でいい
  (ステップ選択 → Inspector 連携は Phase 4 以降)
- 既存のタイムライン動作は一切変えない
- `editingBlock` 中はタイムラインの選択状態 (`selectedBlockId`) をクリアしてよい
