# Phase 2: フローチャートエディタ

## 前提

Phase 1 完了済み — `Step` 型と `Block.steps` が存在する。

## 目的

タイムラインに触れずに、フローチャート編集画面を新規作成する。
この Phase では**まだナビゲーションは繋がない** (Phase 3 でやる)。
コンポーネントだけ作って export する。

## 新規作成するファイル

### 1. `src/app/components/Breadcrumb.tsx` (~30行)

パンくずナビゲーション。

```tsx
interface Props {
  segments: { label: string; onClick?: () => void }[];
}

export function Breadcrumb({ segments }: Props) {
  return (
    <nav className="flex items-center gap-1 px-4 py-2 font-mono text-[11px]">
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-fl-text-ghost">&gt;</span>}
          {seg.onClick ? (
            <button
              type="button"
              onClick={seg.onClick}
              className="text-fl-text-dim hover:text-fl-text transition-colors"
            >
              {seg.label}
            </button>
          ) : (
            <span className="text-fl-text font-bold">{seg.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
```

### 2. `src/app/components/AddStepModal.tsx` (~120行)

ステップ追加ダイアログ。`AddBlockModal.tsx` を参考に作る。

Props:
```tsx
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockLabel: string;   // パンくず用
  subroutines: Subroutine[];
  onAdd: (step: Step) => void;
}
```

UI:
- StepType の 6 種ボタン (STEP_META を使う)
- action / wait 選択時: ラベルプリセット + カスタム入力 (AddBlockModal と同じ)
- subroutine 選択時: サブルーチン選択セレクト
- loop / branch / switch: ラベル入力のみ (params は Inspector で)
- 「追加」ボタン → `onAdd(step)` コール

生成する Step:
```typescript
{
  id: uid('s'),
  type,
  label: finalLabel,
  order: (渡された次の order 番号),
  steps は Step には不要,
  ...(type === 'switch' ? { params: { cases: ['case_0', 'case_1', 'default'] } } : {}),
  ...(type === 'subroutine' ? { subroutineId } : {}),
}
```

`order` は Props で `nextOrder: number` として受け取る。

### 3. `src/app/components/FlowchartStepView.tsx` (~150行)

個別ステップのカード。

Props:
```tsx
interface Props {
  step: Step;
  selected: boolean;
  status: BlockStatus;      // 実行ステータス (後で使う、今は idle)
  onSelect: (stepId: string) => void;
  onDelete: (stepId: string) => void;
}
```

描画:
- 幅 240px、高さ auto (padding 含め ~44px)
- 左端に StepType のカラーバー (4px)
- 上段: `STEP_META[step.type].icon` + type label (8px, uppercase, color)
- 下段: `step.label` (11px)
- ホバー時: 右上に × 削除ボタン
- 選択時: ボーダーが type color に、微かなグロー
- ステップ間に縦線コネクタ (高さ 16px、幅 2px、中央配置、色 `var(--fl-border)`)

制御フローステップ (loop/branch/switch) の場合:
- 外枠を表示 (色付きボーダー)
- 子ステップは**このコンポーネント内ではレンダリングしない**
  → FlowchartEditor 側でネスト構造をフラットに描画する
  (Phase 5 でネスト表示に進化させる。今はフラットリストで十分)

### 4. `src/app/components/FlowchartEditor.tsx` (~200行)

フローチャートビュー本体。

Props:
```tsx
interface Props {
  block: Block;
  trackName: string;
  trackColor: string;
  scenarioName: string;
  subroutines: Subroutine[];
  nodeManifest: NodeManifestEntry[];
  scenarioVariables: Record<string, unknown>;
  onBack: () => void;
  onUpdateBlock: (patch: Partial<Block>) => void;
  onCreateVariable: (key: string, value: unknown) => void;
}
```

レイアウト:
```
┌──────────────────────────────────────────────────────────────┐
│ Breadcrumb: scenarioName > trackName > block.label           │
├──────────────────────────────────┬───────────────────────────┤
│                                  │                           │
│  (縦スクロール可能なステップリスト)   │  Inspector (右サイド)      │
│                                  │  選択したステップの詳細      │
│  ┌──────────┐                    │                           │
│  │ Step 1    │                    │                           │
│  └────┬─────┘                    │                           │
│       │                          │                           │
│  ┌────┴─────┐                    │                           │
│  │ Step 2    │                    │                           │
│  └────┬─────┘                    │                           │
│       │                          │                           │
│  [+ ステップ追加]                  │                           │
│                                  │                           │
└──────────────────────────────────┴───────────────────────────┘
```

状態管理:
```tsx
const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
const [addStepOpen, setAddStepOpen] = useState(false);
```

ステップリスト描画:
```tsx
const topLevelSteps = block.steps
  .filter(s => !s.parentStepId)
  .sort((a, b) => a.order - b.order);

// フラットリストとして描画 (Phase 5 でネスト対応)
{topLevelSteps.map((step, i) => (
  <React.Fragment key={step.id}>
    {i > 0 && <Connector />}  {/* 縦線 */}
    <FlowchartStepView
      step={step}
      selected={selectedStepId === step.id}
      status="idle"
      onSelect={setSelectedStepId}
      onDelete={handleDeleteStep}
    />
  </React.Fragment>
))}
```

ステップ追加:
```tsx
const handleAddStep = (step: Step) => {
  onUpdateBlock({ steps: [...block.steps, step] });
};
```

ステップ削除:
```tsx
const handleDeleteStep = (stepId: string) => {
  onUpdateBlock({
    steps: block.steps.filter(s => s.id !== stepId && s.parentStepId !== stepId),
  });
};
```

Inspector 統合:
- 選択中のステップがあれば、右サイドに Inspector を表示
- Inspector は既存のものを**そのまま流用**する
  - `Step` の各フィールドは `Block` のフィールドと同名なので互換性あり
  - ただし `slot` の代わりに `order` を表示する
  - **Inspector の改修は Phase 3 で行う。この Phase では Inspector は表示しない。**

## この Phase が完了した状態

- 4つの新規コンポーネントが存在する
- まだ App.tsx からは呼ばれていない (Phase 3 で接続)
- `npx tsc --noEmit` がパスする
- import は全て正しい (types.ts から Step, StepType, STEP_META を参照)

## 注意

- `Dialog` は `@base-ui/react/dialog` から import (`AddBlockModal.tsx` を参考)
- `uid` は `import { uid } from '../useScenario'` から
- Tailwind クラスの命名は既存ファイルに従う (fl-* カスタムカラー)
- コンポーネントは 300 行以内
