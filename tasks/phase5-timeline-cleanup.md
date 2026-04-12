# Phase 5: タイムライン簡素化 + 旧モデル削除

## 前提

Phase 1〜4 完了済み。Step ベースの実行が動作する状態。

## 目的

タイムラインからコンテナフレーム描画を削除し、Block を純粋なタスクカードに変える。
旧モデル (Block.type による分岐) を完全に削除する。

**この Phase は破壊的変更を含む。旧形式のシナリオ JSON は読めなくなる。**

## 手順

### Step 1: Block 型の簡素化 (`src/app/types.ts`)

Block から以下のフィールドを**削除**:

```typescript
// 削除するフィールド
type: BlockType;          // → StepType に移行済み
parentBlockId?: string;   // → Step.parentStepId に移行済み
parentBranch?: string;    // → Step.parentBranch に移行済み
nodeId?: string;          // → Step 内に移動
bindings?: Record<...>;   // → Step 内に移動
skipIfMissing?: boolean;  // → Step 内に移動
subroutineId?: string;    // → Step 内に移動
```

新しい Block:

```typescript
export interface Block {
  id: string;
  label: string;
  slot: number;
  steps: Step[];
  /** タスク全体のタイムアウト (任意) */
  timeout?: number;
  /** タスク全体のエラーポリシー (任意) */
  onError?: OnError;
}
```

`BlockType` を削除。`BLOCK_META` を削除 (STEP_META に統一)。

### Step 2: サンプルシナリオの移行 (`src/app/samples.ts`)

旧形式:
```typescript
{
  id: 'b-1', type: 'action', label: 'アプリ起動', slot: 0, steps: [],
}
```

新形式:
```typescript
{
  id: 'b-1', label: 'アプリ起動', slot: 0,
  steps: [
    { id: 's-1', type: 'action', label: 'アプリ起動', order: 0 },
  ],
}
```

旧 controlFlow サンプル (コンテナ + 子ブロック):
```typescript
// Before: フラットな blocks 配列にコンテナと子が混在
blocks: [
  { id: 'b-setup', type: 'action', label: '初期化', slot: 0 },
  { id: 'b-loop1', type: 'loop', label: '3回', slot: 1, params: { iterations: 3 } },
  { id: 'b-loop1-work', type: 'action', label: 'ワーク', slot: 1, parentBlockId: 'b-loop1' },
  { id: 'b-done', type: 'action', label: '完了', slot: 2 },
]

// After: タスクに分割、制御フローは steps 内
blocks: [
  {
    id: 'b-setup', label: '初期化', slot: 0,
    steps: [
      { id: 's-setup', type: 'action', label: '初期化', order: 0 },
    ],
  },
  {
    id: 'b-loop', label: '3回ループ処理', slot: 1,
    steps: [
      { id: 's-loop', type: 'loop', label: '3回', order: 0, params: { iterations: 3 } },
      { id: 's-work', type: 'action', label: 'ワーク', order: 0, parentStepId: 's-loop' },
    ],
  },
  {
    id: 'b-done', label: '完了通知', slot: 2,
    steps: [
      { id: 's-done', type: 'action', label: '完了通知', order: 0 },
    ],
  },
]
```

全サンプル (empty, basic, parallel, controlFlow, switchDemo) を移行する。

### Step 3: TrackRow からコンテナフレーム描画を削除

`src/app/components/TrackRow.tsx`:

1. `computeTrackLayout` の呼び出しを削除 (もしくは簡素化)
2. `containerFrames.map(...)` の描画ループ全体を削除 (~130行)
3. BlockView に渡す `containerFrames`, `lane`, `blockLanes` の props を削除
4. `handleCanvasClick` からコンテナヒットテストを削除

TrackRow は単純な BlockView のリスト描画になる:

```tsx
{track.blocks.map((b) => (
  <BlockView
    key={b.id}
    block={b}
    trackId={track.id}
    status={blockStatus[b.id] ?? 'idle'}
    selected={selectedBlockId === b.id}
    draggable={blocksDraggable}
    trackHeight={trackHeight}
    subroutines={subroutines}
    onSelect={onSelectBlock}
    onUpdate={onUpdateBlock}
    onDelete={onDeleteBlock}
    onDoubleClick={onDoubleClickBlock}
  />
))}
```

### Step 4: BlockView の簡素化

`src/app/components/BlockView.tsx`:

1. `containerFrames` prop を削除
2. `lane` prop を削除
3. レーン計算ロジック (blockTop / blockH の lane 分岐) を削除
4. ドラッグ時の `landingFrame` / `landingCase` ロジックを削除
5. `parentBranch` の TRUE/FALSE ピルを削除

BlockView は単純なカード描画になる:

```tsx
const blockTop = 8;
const blockH = trackHeight - 16;
// lane 分岐は不要
```

ステップ数バッジを追加:

```tsx
{block.steps.length > 0 && (
  <span className="... text-[8px] ...">
    {block.steps.length} steps
  </span>
)}
```

### Step 5: trackLayout.ts の簡素化

`src/app/trackLayout.ts`:

1. `ContainerFrame`, `BlockLaneInfo`, `casesForContainer` を削除
2. `computeTrackLayout` から containerFrames / blockLanes 計算を削除
3. Track 高は固定 (`TRACK_H`) に戻せる (レーン分割がないので動的高は不要)

簡素化後:
```typescript
export function computeTrackLayout(track: Track): TrackLayout {
  const blocks = new Map<string, BlockLayoutBox>();
  const trackHeight = TRACK_H;

  for (const b of track.blocks) {
    const leftX = b.slot * SLOT_PX + BLOCK_MARGIN;
    const rightX = leftX + BLOCK_W;
    blocks.set(b.id, { leftX, rightX, y: trackHeight / 2 });
  }

  return { trackHeight, containerFrames: [], blockLanes: new Map(), blocks };
}
```

(containerFrames / blockLanes は空を返して、参照箇所が他に残っている場合に
型エラーを防ぐ。完全削除はこの Phase の最後にまとめて行う。)

### Step 6: executor.ts の旧モデルコードを削除

`executeBlockOrGroup` から旧モデル分岐を削除:

```typescript
// Before
if (block.steps && block.steps.length > 0) {
  await this.executeTask(...);
  return;
}
if (block.type === 'loop') { ... }  // ← 削除
if (block.type === 'branch') { ... }  // ← 削除
if (block.type === 'switch') { ... }  // ← 削除
await this.executeBlock(...);  // ← 削除

// After
await this.executeTask(containerId, block, opts);
```

旧メソッドを削除:
- `executeLoop` (Block 版)
- `executeBranch` (Block 版)
- `executeSwitch` (Block 版)
- `executeBlock` (Block 版) — Step 版の `executeStep` に統合

### Step 7: useScenario.ts の更新

- `makeRoomAt` / `laneKey`: `parentBlockId` / `parentBranch` の参照を削除
  (Block にこれらのフィールドがなくなるため)
- `deleteBlock`: 子ブロックの orphan 処理を削除 (ネストは Step 内)
- `addBlock`: `laneKey` が常に `":"` になるので、衝突検出が全ブロックで slot ベースに

### Step 8: Inspector の更新

`src/app/components/Inspector.tsx`:

- `block.type` による分岐を削除
  (LoopParamsSection / BranchParamsSection / SwitchParamsSection はフローチャート側)
- `nodeId` 選択を削除 (Step に移動)
- `parentContainerCases` / `parentContainerType` props を削除
- Inspector はタスクレベルのプロパティのみ表示:
  - label, slot, timeout, onError

Step 選択時の Inspector はフローチャートエディタ内で管理 (Phase 3 で接続済み)。

### Step 9: AddBlockModal の簡素化

タスク追加ダイアログに変更:
- type 選択ボタンを削除 (BlockType が廃止されたため)
- label 入力だけの簡素なモーダルに
- 生成する Block: `{ id: uid('b'), label, slot, steps: [] }`

### Step 10: 型チェック + 未使用 import の掃除

```bash
npx tsc --noEmit
npx eslint src/
```

削除した型 (`BlockType`, `BLOCK_META`) を参照している箇所を全て修正する。

## この Phase が完了した状態

- タイムラインは純粋なタスクカードのリスト (コンテナフレームなし)
- 全ての制御フロー (loop/branch/switch) はフローチャート内の Step として動作
- `Block.type` は存在しない
- 旧形式のシナリオ JSON は読めない (version bump を検討)
- コードベースは 200〜300 行削減

## リスク

- **互換性**: 旧 JSON を読もうとするとクラッシュする
  → `replace()` (import) で旧形式を検出して自動変換する移行関数を入れるか、
    version を `'2.0'` に上げてエラーメッセージを出す
- **大量の変更**: 10 ファイル以上に触る
  → `npx tsc --noEmit` を頻繁に実行して型エラーを追跡する
