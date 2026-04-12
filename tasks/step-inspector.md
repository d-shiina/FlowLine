# ステップインスペクター + フローチャート画面活用

## 現状の問題

フローチャートエディタは**縦一列 240px のステップリストが中央に並ぶだけ**で、
画面の左右 80% 以上がデッドスペースになっている。
ステップを選択してもプロパティパネルがなく、
ノード選択・ポート接続・パラメータ設定が一切できない。

## 設計方針

### レイアウト: 2 カラム split-pane

フローチャートエディタを **左: ビジュアルフロー / 右: ディテールパネル** の
2 カラム構成に変更する。右パネルはタイムライン Inspector の w-72 より広い
**w-[360px]** を確保し、ノード設定に十分なスペースを取る。

```
┌──────────────────────────────────────────────────────────────┐
│ Breadcrumb: scenario > track > block.label                    │
├──────────────────────────────┬───────────────────────────────┤
│                              │                               │
│   ○ block.label (badge)      │ ▶ ACTION / Click ボタン       │
│                              │                               │
│   ┌──────────┐               │ NODE                          │
│   │ Step 1 ★ │───────────────│ 🔍 [desktop/click       ▾]   │
│   └────┬─────┘               │   ├ desktop                   │
│        │                     │   │  click                    │
│   ┌────┴─────┐               │   │  type_text               │
│   │ Step 2   │               │   └ debug                     │
│   └────┬─────┘               │     log                       │
│        │                     │                               │
│   [+ ステップ追加]            │ INPUT PORTS                   │
│                              │ target (required)             │
│                              │  [変数 ▾] [scenario.btn    ]  │
│                              │ x_offset                      │
│                              │  [リテラル ▾] [0           ]  │
│                              │                               │
│                              │ OUTPUT PORTS                  │
│                              │ result                        │
│                              │  [変数 ▾] [scenario.res    ]  │
│                              │                               │
│                              │ LABEL                         │
│                              │ [Click ボタン              ]  │
│                              │                               │
│                              │ ERROR                         │
│                              │ timeout: [x] 30秒             │
│                              │ onError: [skip ▾]             │
│                              │                               │
│                              │ id: s_abc123                  │
└──────────────────────────────┴───────────────────────────────┘
```

ステップ未選択時の右パネル:
```
│ BLOCK SUMMARY                │
│                              │
│ ラベル: [ブロック名        ]  │
│ ステップ数: 5                │
│ 使用ノード: click, log       │
│                              │
│ ─────────────────            │
│ ステップをクリックして編集    │
```

## 変更ファイル + 新規ファイル

### 1. `src/app/components/FlowchartEditor.tsx` (変更)

#### レイアウト変更

現在の `<div className="flex flex-1 overflow-hidden">` 内部を 2 カラムに分割:

```tsx
<div className="flex flex-1 overflow-hidden">
  {/* Left: visual flow */}
  <div className="fl-scroll flex-1 overflow-y-auto" onClick={() => setSelectedStepId(null)}>
    {/* 既存のステップリスト (変更なし) */}
  </div>

  {/* Right: detail panel */}
  <StepInspector
    step={selectedStep}
    block={block}
    nodeManifest={nodeManifest}
    scenarioVariables={scenarioVariables}
    onUpdateStep={handleUpdateStep}
    onCreateVariable={onCreateVariable}
  />
</div>
```

#### 新しいハンドラ追加

```tsx
const selectedStep = block.steps.find(s => s.id === selectedStepId) ?? null;

const handleUpdateStep = (stepId: string, patch: Partial<Step>) => {
  onUpdateBlock({
    steps: block.steps.map(s => s.id === stepId ? { ...s, ...patch } : s),
  });
};
```

### 2. `src/app/components/StepInspector.tsx` (新規 ~250行)

ステップ種別に応じたセクションを切り替えて表示する。

#### Props

```tsx
interface Props {
  step: Step | null;
  block: Block;
  nodeManifest: NodeManifestEntry[];
  scenarioVariables: Record<string, unknown>;
  onUpdateStep: (stepId: string, patch: Partial<Step>) => void;
  onCreateVariable: (key: string, value: unknown) => void;
}
```

#### 構成

パネル幅: `w-[360px]`、固定、左ボーダー、スクロール可能。

```tsx
export function StepInspector({ step, block, nodeManifest, ... }: Props) {
  if (!step) {
    return <BlockSummaryPanel block={block} />;
  }

  return (
    <aside className="fl-scroll w-[360px] ... border-l border-fl-border bg-fl-panel">
      {/* Header: type badge + label */}
      <StepHeader step={step} />

      {/* Section 1: Node picker (action/wait のみ) */}
      {(step.type === 'action' || step.type === 'wait') && (
        <NodePickerSection ... />
      )}

      {/* Section 2: Port bindings (nodeId があるとき) */}
      {step.nodeId && selectedNode && (
        <PortBindingsSection ... />
      )}

      {/* Section 3: Control flow conditions (loop/branch) */}
      {(step.type === 'loop' || step.type === 'branch') && (
        <ConditionSection ... />  // JsonLogicField を使う
      )}

      {/* Section 4: Switch cases */}
      {step.type === 'switch' && (
        <SwitchCasesSection ... />
      )}

      {/* Section 5: Subroutine picker */}
      {step.type === 'subroutine' && (
        <SubroutineSection ... />
      )}

      {/* Section 6: Label */}
      <LabelSection ... />

      {/* Section 7: Error handling (全タイプ共通) */}
      <ErrorSection ... />

      {/* Footer: step id */}
    </aside>
  );
}
```

未選択時の `BlockSummaryPanel`:
- ブロックのラベル表示
- ステップ数
- 使用ノードのサマリ (`nodeId` を集計)
- 「ステップをクリックして編集」ヒント

### 3. `src/app/components/ui/Combobox.tsx` (新規 ~120行)

ノードが増えるため、**AutoComplete 式の検索ピッカー**を汎用コンポーネントとして作る。

#### API

```tsx
interface ComboboxOption {
  value: string;
  label: string;
  group?: string;        // カテゴリグルーピング用
  description?: string;  // 補足テキスト (optional)
}

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  allowClear?: boolean;   // 選択解除ボタン
}
```

#### 実装方針

- `@base-ui/react` に Combobox はないため、**自前で実装**
- `<input>` + filtered `<ul>` ドロップダウン (Portal で z-index 管理)
- `group` プロパティがあればカテゴリヘッダを挿入 (sticky)
- フィルタリング: `label` と `value` を case-insensitive 部分一致
- キーボード: ↑↓ で移動、Enter で選択、Esc で閉じる
- 空検索で全候補表示 (スクロール可能、max-h-[280px])
- スタイル: 既存 `Select.tsx` のポップアップと統一感

#### ノードピッカーでの使い方

```tsx
const nodeOptions: ComboboxOption[] = nodeManifest.map(n => ({
  value: n.id,
  label: n.label || n.id,
  group: n.category,
  description: n.id,  // "desktop/click" を補足表示
}));

<Combobox
  value={step.nodeId ?? ''}
  onValueChange={(nodeId) => onUpdateStep(step.id, { nodeId })}
  options={nodeOptions}
  placeholder="ノードを検索..."
  allowClear
/>
```

### 4. PortBindingsSection (StepInspector 内のセクション)

選択されたノードの `ports` 定義に基づいて、各ポートのバインディング UI を生成する。

```
INPUT PORTS
┌──────────────────────────────────────┐
│ target (string, required) ●          │
│ [変数 ▾] [scenario.button_name    ]  │
│                                      │
│ x_offset (number)                    │
│ [リテラル ▾] [0                   ]  │
└──────────────────────────────────────┘

OUTPUT PORTS
┌──────────────────────────────────────┐
│ result (string)                      │
│ [変数 ▾] [scenario.click_result   ]  │
└──────────────────────────────────────┘
```

各ポート行:
- ポート名 + 型 + (required バッジ)
- BindingMode セレクタ: `変数` | `リテラル` (Select コンポーネント)
- 値入力:
  - 変数モード: scenarioVariables のキーを候補とするテキスト入力 (datalist)
  - リテラルモード: テキスト入力 (型に応じて number / string)
- バインディングは `step.bindings[portName]` に保存:

```typescript
// types.ts の PortBinding (既存)
type PortBinding = { var: string } | { literal: unknown };
```

### 5. ConditionSection

`loop` / `branch` タイプのステップ用。

- 既存の `JsonLogicField` コンポーネントをそのまま使用
- `step.params?.condition` を `value` に渡す
- `scenarioVariables` を渡してピッカーに変数候補を表示

```tsx
<JsonLogicField
  value={step.params?.condition}
  onChange={(condition) =>
    onUpdateStep(step.id, { params: { ...step.params, condition } })
  }
  scenarioVariables={scenarioVariables}
  mode={step.type === 'branch' ? 'comparison' : 'comparison'}
/>
```

### 6. SwitchCasesSection

`switch` タイプのステップ用。

- ケース一覧の表示・追加・削除・並べ替え
- `step.params?.cases: string[]` を操作
- 各ケースラベルは inline 編集可能
- 「+ ケース追加」ボタン
- `default` ケースは削除不可

## 実装順序

```
Step 1: Combobox.tsx         — 汎用 AutoComplete (他でも使える)
Step 2: StepInspector.tsx    — メインパネル (骨格 + LabelSection + ErrorSection)
Step 3: NodePicker 統合      — Combobox でノード選択
Step 4: PortBindingsSection  — ポートバインディング UI
Step 5: ConditionSection     — JsonLogicField 統合
Step 6: SwitchCasesSection   — ケース管理
Step 7: FlowchartEditor 変更 — 2 カラムレイアウト + StepInspector 統合
```

## この Phase が完了した状態

- フローチャートエディタが 2 カラムレイアウトになっている
- ステップ選択で右パネルにプロパティが表示される
- action/wait ステップでノードを AutoComplete 検索・選択できる
- 選択ノードのポートに変数/リテラルをバインドできる
- loop/branch ステップで JsonLogicField による条件編集ができる
- switch ステップでケースの追加・削除・編集ができる
- 未選択時にブロックサマリが表示される
- `npx tsc --noEmit` がパスする

## 注意

- `Combobox.tsx` は `ui/` に配置し、Select.tsx と同じスタイルルールに従う
- StepInspector は 300 行以内。セクションが大きくなる場合は
  `inspector/` サブディレクトリに分割する (既存パターン踏襲)
- nodeManifest が空 (Python 未インストール) でも crash しないこと
- 変数名は英語、UI ラベルは日本語
