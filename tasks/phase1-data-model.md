# Phase 1: データモデル拡張

## 目的

既存の動作を壊さずに `Step` 型と `Block.steps` フィールドを追加する。

## 変更するファイル: `src/app/types.ts`

### 1. StepType と Step を追加

ファイル末尾 (TRACK_COLORS の後) に追加:

```typescript
// ── Flowchart step model ──────────────────────────────

export type StepType =
  | 'action'
  | 'wait'
  | 'loop'
  | 'branch'
  | 'switch'
  | 'subroutine';

/**
 * One step inside a Block's internal flowchart.
 *
 * Steps execute top-to-bottom by ``order``. Control flow steps
 * (loop / branch / switch) nest children via ``parentStepId`` +
 * ``parentBranch``, exactly like the old Block nesting model.
 */
export interface Step {
  id: string;
  type: StepType;
  label: string;
  /** Execution order within the flowchart (0, 1, 2, ...). */
  order: number;
  /** Python node id, e.g. ``desktop/click``. */
  nodeId?: string;
  params?: Record<string, unknown>;
  bindings?: Record<string, PortBinding>;
  timeout?: number;
  skipIfMissing?: boolean;
  onError?: OnError;
  subroutineId?: string;
  /** Parent control-flow step id (for nesting inside loop/branch/switch). */
  parentStepId?: string;
  /** Case label within parent (then/else for branch, case names for switch). */
  parentBranch?: string;
}
```

### 2. STEP_META を追加

`BLOCK_META` の直後に追加 (同じ色・アイコン定義):

```typescript
export const STEP_META: Record<
  StepType,
  { color: string; icon: string; label: string }
> = {
  action: { color: '#3B82F6', icon: '▶', label: 'アクション' },
  wait: { color: '#06B6D4', icon: '⏸', label: '待機' },
  loop: { color: '#8B5CF6', icon: '↻', label: 'ループ' },
  branch: { color: '#F59E0B', icon: '⑂', label: '分岐' },
  switch: { color: '#EC4899', icon: '⧉', label: 'スイッチ' },
  subroutine: { color: '#94A3B8', icon: '⎔', label: 'サブルーチン' },
};
```

### 3. Block に steps フィールドを追加

`Block` interface に 1 行追加 (既存フィールドはまだ消さない):

```typescript
export interface Block {
  // ... 既存フィールドはそのまま ...

  /** Internal flowchart. Empty = legacy mode (use type/parentBlockId). */
  steps: Step[];

  // ... 既存フィールドはそのまま ...
}
```

追加位置: `parentBranch` フィールドの後に入れる。

### 4. サンプルシナリオに空 steps を追加

`src/app/samples.ts` の全ブロックに `steps: []` を追加する。
例:

```typescript
// Before
{ id: 'b-1', type: 'action', label: 'アプリ起動', slot: 0 },

// After
{ id: 'b-1', type: 'action', label: 'アプリ起動', slot: 0, steps: [] },
```

全ブロック (~30個) に同じ変更を適用する。

### 5. useScenario.ts の addBlock を更新

`addBlock` コールバック内で新しいブロックに `steps: []` が無い場合にデフォルトで追加:

```typescript
// addBlock の commit 内、`[...withRoom, block]` の前に
const blockWithSteps = block.steps ? block : { ...block, steps: [] };
// withRoom に blockWithSteps を追加
return [...withRoom, blockWithSteps];
```

### 6. AddBlockModal.tsx の handleAdd を更新

`onAdd({ ... })` 呼び出しに `steps: []` を追加:

```typescript
onAdd({
  id: uid('b'),
  type,
  label: finalLabel,
  slot,
  steps: [],    // ← 追加
  ...(params !== undefined ? { params } : {}),
  ...(type === 'subroutine' ? { subroutineId } : {}),
});
```

## 型チェック確認

```bash
npx tsc --noEmit
```

エラーが出る場合:
- `Block` 型を参照しているテストやユーティリティで `steps` が未設定のケースがあれば
  該当箇所に `steps: []` を追加する

## この Phase が完了した状態

- `Step` / `StepType` / `STEP_META` が types.ts に存在する
- 全ての `Block` が `steps: Step[]` フィールドを持つ (空配列)
- 既存のアプリは一切変わらず動く (steps が空なので従来モードのまま)
- `npx tsc --noEmit` がパスする
