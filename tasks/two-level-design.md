# 設計: 2層モデル (タイムライン + フローチャート)

## 概要

現在の FLOWLINE はタイムライン上にアクション単位でブロックを配置する1層モデル。
これを**タイムライン (並列オーケストレーション) + フローチャート (逐次ロジック)** の
2層に分離する。

```
タイムライン (横): 何が並列に走るか
  Track1: [Excel処理]──[レポート作成]
  Track2: [メール取得]──────[通知送信]
                ‖ SYNC

フローチャート (縦): 各タスク内で何をするか (ダブルクリックで開く)
  ┌──────────┐
  │ ファイル開く │
  └─────┬────┘
        ▼
  ┌──────────┐
  │  行ループ   │
  │ ┌────────┐ │
  │ │ 値を変換  │ │
  │ └────────┘ │
  └─────┬────┘
        ▼
  ┌──────────┐
  │  保存     │
  └──────────┘
```

## データモデル

### Before (現行)

```typescript
// Track.blocks にアクションも制御フローもフラットに入る
interface Block {
  id: string;
  type: 'action' | 'wait' | 'loop' | 'branch' | 'switch' | 'subroutine';
  label: string;
  slot: number;
  parentBlockId?: string;   // コンテナ内包
  parentBranch?: string;    // ケース (then/else/case_0/...)
  nodeId?: string;
  params?: Record<string, unknown>;
  bindings?: Record<string, PortBinding>;
  // ...error handling fields
}

interface Track {
  blocks: Block[];
}
```

### After (新モデル)

```typescript
// ── タイムライン層 ──
// Block はタスク単位。内部にフローチャート (steps) を持つ。
interface Block {
  id: string;
  label: string;
  slot: number;
  /** タイムライン上の見た目ヒント (任意) */
  color?: string;
  icon?: string;
  /** 内部フローチャート。ダブルクリックで編集。 */
  steps: Step[];
}

interface Track {
  id: string;
  name: string;
  color: string;
  blocks: Block[];  // ← 型は同じだが中身が変わる
  variables?: { track?: Record<string, unknown> };
}

// ── フローチャート層 ──
// Step = 現行の Block から slot を除いたもの + order で順序管理
type StepType = 'action' | 'wait' | 'loop' | 'branch' | 'switch' | 'subroutine';

interface Step {
  id: string;
  type: StepType;
  label: string;
  /** フローチャート内の順序 (0, 1, 2...) */
  order: number;
  /** Python ノード ID */
  nodeId?: string;
  params?: Record<string, unknown>;
  bindings?: Record<string, PortBinding>;
  timeout?: number;
  skipIfMissing?: boolean;
  onError?: OnError;
  subroutineId?: string;
  /** 制御フロー内包 (ループ本体、分岐の then/else 等) */
  parentStepId?: string;
  parentBranch?: string;
}
```

### 変更点サマリ

| 項目 | Before | After |
|------|--------|-------|
| タイムラインの `Block.type` | 6種 (action/wait/loop/branch/switch/subroutine) | **廃止** — Block は常にタスクコンテナ |
| 制御フロー (loop/branch/switch) | タイムライン上のコンテナフレーム | **Step としてフローチャート内に移動** |
| 実行単位 | Block 単位 | Block (タスク) → 内部 Step を順次実行 |
| `Block.slot` | 個々のアクションの位置 | タスクの位置 (タイムライン上の粗い粒度) |
| `Step.order` | なし (`slot` が代行) | **新規** — フローチャート内の順序 |
| `parentBlockId` / `parentBranch` | Block に存在 | **Step に移動** (`parentStepId` / `parentBranch`) |
| コンテナフレーム描画 | TrackRow が描画 | **削除** — フローチャートエディタ内でネスト表示 |

### Block.type 廃止の根拠

現行の `BlockType` 6 種は全て Step に移行する:
- `action`, `wait`, `subroutine` → Step として実行
- `loop`, `branch`, `switch` → Step としてネスト制御

タイムライン上の Block は「タスク」という 1 種類のみ。
`type` フィールドは不要。`color` / `icon` で視覚的に分類したければ任意指定。

## ナビゲーション

```
App.tsx の状態:
  editingStep: { trackId: string; blockId: string } | null

  null          → タイムラインビュー (現行に近い、ただし Block が簡素)
  { trackId, blockId } → フローチャートビュー (新規)
```

**遷移**:
- タイムラインで Block をダブルクリック → `editingStep` をセット → フローチャート表示
- フローチャートのパンくずリスト or Esc → `editingStep = null` → タイムラインに戻る

**パンくずリスト**:
```
シナリオ名 > トラック名 > タスク名
```

## UI 構成

### タイムラインビュー (簡素化)

```
┌─────────┬──────────────────────────────────┐
│ Header  │ [タスクA] [タスクB]    [タスクC]  │ Track 1
├─────────┼──────────────────────────────────┤
│ Header  │ [タスクD]──────[タスクE]          │ Track 2
├─────────┼──────────────────────────────────┤
│         │        ‖ SYNC                     │
└─────────┴──────────────────────────────────┘
```

- Block は単純なカード (現行の BlockView に近い)
- **コンテナフレーム描画は完全に不要**
- Block の中に何ステップあるかバッジで表示: `3 steps`
- ダブルクリックでフローチャートに入る

### フローチャートビュー (新規)

```
┌──────────────────────────────────────────────────┐
│  パンくず: シナリオ名 > Track1 > Excel処理        │
├──────────────────────────────────────────────────┤
│                                                    │
│  ┌──────────────┐                                  │
│  │ ▶ ファイル開く │                                  │
│  └──────┬───────┘                                  │
│         │                                          │
│         ▼                                          │
│  ┌──────────────┐                                  │
│  │ ↻ 行ループ    │                                  │
│  │ ┌──────────┐ │                                  │
│  │ │ ▶ 値を変換 │ │                                  │
│  │ └──────────┘ │                                  │
│  └──────┬───────┘                                  │
│         │                                          │
│         ▼                                          │
│  ┌──────────────┐                                  │
│  │ ▶ 保存       │                                  │
│  └──────────────┘                                  │
│                                                    │
│       [+ ステップ追加]                               │
│                                                    │
├──────────────────────────────────────────────────┤
│  Inspector (右サイド)                               │
└──────────────────────────────────────────────────┘
```

- ステップはドラッグで並べ替え (order 変更)
- ステップ追加: アクション / 待機 / ループ / 分岐 / スイッチ / サブルーチン
- ループ/分岐/スイッチはネストされたボックスとして描画
- クリックで Inspector にステップ詳細を表示

## 実行エンジン

### Before
```
runTrack(track)
  → top-level blocks by slot order
    → executeBlockOrGroup(block)
      → executeBlock (action) / executeLoop / executeBranch / executeSwitch
```

### After
```
runTrack(track)
  → blocks by slot order
    → executeTask(block)     ← NEW: タスク単位
      → top-level steps by order
        → executeStepOrGroup(step)
          → executeStep (action) / executeLoop / executeBranch / executeSwitch
```

変更は**1レベルのラッピング追加**だけ。Step の実行ロジックは現行の Block 実行と
ほぼ同一 (slot → order に変わるだけ)。

## 影響範囲

### 削除されるもの
- `BlockType` (6 種) → `StepType` に移行
- `Block.type`, `Block.parentBlockId`, `Block.parentBranch` → Step に移動
- `BLOCK_META` → `STEP_META` にリネーム
- コンテナフレーム描画 (TrackRow の containerFrames ループ全体)
- `trackLayout.ts` の `ContainerFrame`, `BlockLaneInfo`, `casesForContainer` 等
- `BlockView` のレーン計算ロジック

### 変更されるもの
| ファイル | 変更内容 |
|----------|----------|
| `types.ts` | `Block` を簡素化, `Step` / `StepType` 追加 |
| `useScenario.ts` | Step 操作メソッド追加 (addStep, updateStep, deleteStep, moveStep) |
| `executor.ts` | `executeTask()` ラッパー追加, Block 実行 → Step 実行に移行 |
| `App.tsx` | `editingStep` 状態追加, フローチャートビューの表示切替 |
| `TrackRow.tsx` | コンテナフレーム描画を削除, Block を簡素カードに |
| `BlockView.tsx` | レーン計算を削除, ダブルクリックハンドラ追加 |
| `Inspector.tsx` | Step 選択時の表示対応 |
| `AddBlockModal.tsx` | タイムライン用: タスク追加に簡素化 / フロー用: ステップ追加モーダル新設 |
| `samples.ts` | 新データモデルに移行 |

### 新規作成
| ファイル | 内容 |
|----------|------|
| `components/FlowchartEditor.tsx` | フローチャートビュー本体 |
| `components/FlowchartStepView.tsx` | 個別ステップの描画 (縦型カード) |
| `components/AddStepModal.tsx` | ステップ追加ダイアログ |
| `components/Breadcrumb.tsx` | パンくずナビゲーション |

## 実装フェーズ

### Phase 1: データモデル + 型定義
**既存の動作を壊さずに新しい型を追加する。**
- `types.ts` に `Step`, `StepType` を追加
- `Block` に `steps: Step[]` を追加 (既存の `type` 等はまだ残す)
- `STEP_META` を追加 (BLOCK_META のコピー)
- この段階では `steps` は空配列でも動く

### Phase 2: フローチャートエディタ (新規コンポーネント)
**タイムラインに触れずにフローチャート画面を作る。**
- `FlowchartEditor.tsx` — Step を縦に並べて描画
- `FlowchartStepView.tsx` — 個別ステップ (アクション/制御フロー)
- `AddStepModal.tsx` — ステップ追加
- `Breadcrumb.tsx` — 戻るナビゲーション
- `useScenario.ts` に Step 操作 (addStep / updateStep / deleteStep / reorderStep)

### Phase 3: ナビゲーション接続
**ダブルクリックでフローチャートに入れるようにする。**
- `App.tsx` に `editingStep` 状態 + ビュー切替ロジック
- `BlockView` にダブルクリックハンドラ
- Inspector を Step 対応に拡張

### Phase 4: 実行エンジン更新
**Step ベースの実行に対応。**
- `executor.ts` に `executeTask()` 追加
- Step 内の loop/branch/switch 実行は現行ロジックをそのまま流用
- 既存のコンテナ実行と新しい Step 実行を共存させる (移行期間)

### Phase 5: タイムライン簡素化 + 移行
**コンテナフレームを削除し、Block を純粋なタスクに。**
- `Block.type`, `parentBlockId`, `parentBranch` を削除
- `TrackRow.tsx` からコンテナフレーム描画を削除
- `BlockView.tsx` からレーン計算を削除
- `trackLayout.ts` を簡素化 (ContainerFrame 不要)
- `samples.ts` を新モデルに移行
- `AddBlockModal.tsx` をタスク追加に簡素化

## 移行期間の互換性

Phase 1〜4 の間、Block は新旧両方の形をサポートする:
- `block.steps.length > 0` → 新モデル (フローチャートで編集)
- `block.type !== undefined && block.steps.length === 0` → 旧モデル (従来の描画)

これにより、既存のサンプルシナリオが壊れずに動作する。
Phase 5 で旧モデルを完全に削除する。
