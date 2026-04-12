# Phase 4: 実行エンジン更新

## 前提

Phase 1〜3 完了済み。フローチャートエディタで Step を追加・編集できる状態。

## 目的

`executor.ts` を更新し、Block 内の `steps` を実行できるようにする。
既存のコンテナブロック実行 (旧モデル) と新しい Step 実行を共存させる。

## 変更するファイル

### 1. `src/app/engine/executor.ts`

#### executeTask メソッドを追加

`executeBlockOrGroup` の先頭に、Step ベースの分岐を追加:

```typescript
private async executeBlockOrGroup(
  containerId: string,
  trackBlocks: Block[],
  block: Block,
  opts: { isErrorHandler: boolean },
): Promise<void> {
  // ── NEW: Step-based execution ──
  // If the block has steps, run them as an internal flowchart
  // instead of dispatching by block.type.
  if (block.steps && block.steps.length > 0) {
    await this.executeTask(containerId, block, opts);
    return;
  }

  // ── Legacy: type-based dispatch (unchanged) ──
  if (block.type === 'loop') {
    // ...existing code...
```

#### executeTask 実装

```typescript
/**
 * Execute a task block by running its internal flowchart (steps).
 * Steps execute top-to-bottom by `order`. Control flow steps
 * (loop/branch/switch) recurse into their children.
 */
private async executeTask(
  containerId: string,
  block: Block,
  opts: { isErrorHandler: boolean },
): Promise<void> {
  this.state.status[block.id] = 'running';
  this.log('info', containerId, block.id, `タスク「${block.label}」開始`);
  this.flush();

  // Initialize all step statuses to idle.
  for (const step of block.steps) {
    this.state.status[step.id] = 'idle';
  }
  this.flush();

  const topLevel = block.steps
    .filter(s => !s.parentStepId)
    .sort((a, b) => a.order - b.order);

  let failed = false;
  for (const step of topLevel) {
    if (this.aborted) {
      this.markCancelled(step.id);
      continue;
    }
    await this.executeStepOrGroup(containerId, block, step, opts);
    if (this.state.status[step.id] === 'error') {
      failed = true;
      break;
    }
  }

  if (this.aborted) {
    this.state.status[block.id] = 'cancelled';
  } else if (failed) {
    this.state.status[block.id] = 'error';
  } else {
    this.state.status[block.id] = 'ok';
    this.log('info', containerId, block.id, `タスク「${block.label}」完了`);
  }
  this.flush();
}
```

#### executeStepOrGroup 実装

Step 版の `executeBlockOrGroup`。ロジックはほぼ同一だが、
Block[] の代わりに block.steps を参照する:

```typescript
private async executeStepOrGroup(
  containerId: string,
  block: Block,
  step: Step,
  opts: { isErrorHandler: boolean },
): Promise<void> {
  if (step.type === 'loop') {
    await this.executeStepLoop(containerId, block, step, opts);
    return;
  }
  if (step.type === 'branch') {
    await this.executeStepBranch(containerId, block, step, opts);
    return;
  }
  if (step.type === 'switch') {
    await this.executeStepSwitch(containerId, block, step, opts);
    return;
  }
  // action / wait / subroutine
  await this.executeStep(containerId, block, step, opts);
}
```

#### executeStep 実装 (action/wait)

既存の `executeBlock` とほぼ同じ。Step を Block に変換して `runtime.run` に渡す:

```typescript
private async executeStep(
  containerId: string,
  block: Block,
  step: Step,
  opts: { isErrorHandler: boolean },
): Promise<void> {
  if (step.type === 'subroutine') {
    // Subroutine steps: create a temporary Block-like object
    // and delegate to existing executeSubroutine.
    const fakeBlock: Block = {
      id: step.id,
      type: 'subroutine',
      label: step.label,
      slot: 0,
      steps: [],
      subroutineId: step.subroutineId,
    };
    await this.executeSubroutine(containerId, fakeBlock);
    return;
  }

  // Create a Block-compatible object for runtime.run()
  const stepAsBlock: Block = {
    id: step.id,
    type: step.type as any,
    label: step.label,
    slot: 0,
    steps: [],
    nodeId: step.nodeId,
    params: step.params,
    bindings: step.bindings,
    timeout: step.timeout,
    skipIfMissing: step.skipIfMissing,
    onError: step.onError,
  };

  // Reuse existing executeBlock which handles retry/onError/etc.
  await this.executeBlock(containerId, stepAsBlock, opts);
}
```

#### executeStepLoop / executeStepBranch / executeStepSwitch

既存の `executeLoop` / `executeBranch` / `executeSwitch` をコピーし、
以下を変更:
- `trackBlocks` → `block.steps`
- `this.childrenOf(trackBlocks, ...)` → `this.stepChildrenOf(block.steps, ...)`
- 再帰呼び出しを `executeStepOrGroup` に変更

#### stepChildrenOf ヘルパー

```typescript
private stepChildrenOf(
  steps: Step[],
  parentId: string,
  branch?: string,
): Step[] {
  return steps
    .filter(
      s =>
        s.parentStepId === parentId &&
        (branch === undefined || (s.parentBranch ?? '') === branch),
    )
    .sort((a, b) => a.order - b.order);
}
```

### 2. `src/app/engine/types.ts`

Step の status も `BlockStatus` で管理する (Step.id を key にする)。
型変更は不要 — `status: Record<string, BlockStatus>` の key に step id を入れるだけ。

### 3. Step の初期化

`executor.ts` の `run()` メソッドで、Block 内の Step も idle に初期化:

```typescript
// 既存の block status 初期化ループの中に追加
for (const b of t.blocks) {
  this.state.status[b.id] = 'idle';
  // NEW: initialize step statuses too
  if (b.steps) {
    for (const s of b.steps) {
      this.state.status[s.id] = 'idle';
    }
  }
}
```

## 型 import の追加

```typescript
import type { Block, OnError, Scenario, Step, Track } from '../types';
```

## この Phase が完了した状態

- `block.steps` に Step がある Block は、Step を順次実行する
- `block.steps` が空の Block は、従来の type ベース実行 (変更なし)
- Step 内の loop / branch / switch が正しくネスト実行される
- Step ごとの status が `execution.state.status[step.id]` で確認できる
- `npx tsc --noEmit` がパスする

## テスト方法

1. フローチャートエディタで Block に 2〜3 個の action Step を追加
2. シナリオ実行 → Step が順番に running → ok になることを確認
3. loop Step を追加し、中にアクションを入れる → 繰り返し実行されることを確認
