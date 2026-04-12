# FLOWLINE — 開発ガイド

## プロジェクト概要

Windows 向け RPA ツール。タイムラインベースのマルチトラック UI で
WinActor / UiPath の代替を目指す。

- **スタック**: Electron Forge + Vite + React 18 + TypeScript strict + Tailwind v4
- **Python ランタイム**: `_runtime/python/` に python-build-standalone を隔離インストール
- **ノード**: `_runtime/nodes/**/*.py` に `@flowline.node()` デコレータ付き Python ファイル
- **設計ドキュメント**: `docs/01-concept.md`, `docs/02-error-handling.md`, `docs/03-nodes.md`

## アーキテクチャの要所

### 2層モデル (移行中)

**設計**: `tasks/two-level-design.md`

- **タイムライン (横)**: `Block` はタスクコンテナ。`slot` で並列オーケストレーション
- **フローチャート (縦)**: `Block.steps: Step[]` でタスク内の逐次ロジックを記述。
  ダブルクリックで編集画面に入る
- 制御フロー (loop / branch / switch) は `Step` としてフローチャート内に配置
- 実行順序: slot 順 (タイムライン) → order 順 (フローチャート) + 同期ポイント

#### 移行状態

現在は旧モデル (Block.type + コンテナフレーム) と新モデル (Block.steps) が共存。
`block.steps.length > 0` なら新モデル、それ以外は旧モデルで動作する。

### レイアウト計算

- **`src/app/trackLayout.ts` が唯一の真実** — TrackRow / BlockView / App すべてここから消費
- `computeTrackLayout(track)` → `{ containerFrames, blockLanes, blocks, trackHeight }`
- `computeTracksLayout(tracks)` → canvas 座標系のブロック位置 + 合計高

### 実行エンジン

- `executor.ts` がトップレベルブロックのみ走査
- 新モデル: `executeTask(block)` → `block.steps` を order 順に実行
- 旧モデル: `executeBlockOrGroup(block)` → type ベースで loop/branch/switch を再帰
- Sync point: slot ベースのバリア (`slot < sp.slot` の全ブロック完了を待つ)

### Python 統合

- Main process: `pythonWorker.ts` が worker 管理、`nodeFiles.ts` がファイル I/O
- Preload: `flowlineRuntime` API で status / install / runNode / nodeEditor 等を公開
- Renderer: `IpcRuntime` が `Runtime` インターフェース実装、nodeId 未設定なら `MockRuntime` にフォールバック
- Worker protocol: stdin/stdout JSON-line (`run_node` / `result` / `log` / `reload`)

### JSON Logic

- `src/app/engine/jsonLogic.ts` に依存ゼロの evaluator (var / == / != / < / > / and / or / ! / + / - / in / cat / if)
- `summarizeExpression()` でヘッダーにインライン表示用の要約文字列を生成
- `src/app/components/JsonLogicField.tsx` が GUI エディタ (`mode='comparison'` | `'value'`)

## コーディング規約

- 日本語 UI ラベル、英語コメント・変数名
- Tailwind クラスは Prettier の並び順に従う
- コンポーネントは 1 ファイル 300 行以内を目安に分割 (Inspector → inspector/ のように)
- `useMemo` / `useCallback` は依存配列を正確に。eslint が通ること
- 新しいファイルを作るより既存ファイルを編集する

## ビルド・テスト

```bash
npm run dev          # Vite dev server + Electron
npx tsc --noEmit     # 型チェック
npx eslint src/      # リント
python3 _runtime/worker.py  # Python worker 単体テスト (stdin に JSON-line を流す)
```

---

## タスク管理

実装タスクは `tasks/` ディレクトリに個別ファイルで管理する。
Sonnet に実装を依頼する場合: 該当タスクファイルだけ読ませれば OK。

### 現在のタスク

| ファイル | 内容 | 状態 |
|----------|------|------|
| `tasks/two-level-design.md` | 2層モデル全体設計 | 設計完了 |
| `tasks/phase1-data-model.md` | Phase 1: Step 型 + Block.steps 追加 | 未着手 |
| `tasks/phase2-flowchart-editor.md` | Phase 2: フローチャートエディタ新規作成 | 未着手 |
| `tasks/phase3-navigation.md` | Phase 3: ダブルクリック遷移 + パンくず | 未着手 |
| `tasks/phase4-executor.md` | Phase 4: Step ベース実行エンジン | 未着手 |
| `tasks/phase5-timeline-cleanup.md` | Phase 5: 旧モデル削除 + タイムライン簡素化 | 未着手 |
| `tasks/sync-visual.md` | 同期ポイント視覚改善 (破線バリア) | 未着手 |
| `tasks/step-inspector.md` | ステップインスペクター + フローチャート画面活用 | 未着手 |
