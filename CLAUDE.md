# FLOWLINE — 開発ガイド

## プロジェクト概要

Windows 向け RPA ツール。タイムラインベースのマルチトラック UI で
WinActor / UiPath の代替を目指す。

- **スタック**: Electron Forge + Vite + React 18 + TypeScript strict + Tailwind v4
- **Python ランタイム**: `_runtime/python/` に python-build-standalone を隔離インストール
- **ノード**: `_runtime/nodes/**/*.py` に `@flowline.node()` デコレータ付き Python ファイル
- **設計ドキュメント**: `docs/01-concept.md`, `docs/02-error-handling.md`, `docs/03-nodes.md`

## アーキテクチャの要所

### ブロックモデル

- `Block` は action / wait / loop / branch / switch / subroutine の 6 種
- **loop / branch / switch はフレームとしてレンダリング** — 個別の BlockView を持たない。
  TrackRow がコンテナフレーム (Blender ノード風ヘッダー + レーン分割) を直接描画する
- `parentBlockId` + `parentBranch` でコンテナ内包関係を表現。フラットな blocks 配列のまま
- **`deps` は廃止済み** — 実行順序はスロット順 + コンテナネスト + 同期ポイントで確定する

### スロットとレーン

- `Block.slot` は同一レーン内でユニーク。レーンが異なれば同じ slot を共有可能
- レーン = `laneKey(b) = "${b.parentBlockId}:${b.parentBranch}"`
- `makeRoomAt()` はレーン単位で衝突検出する

### レイアウト計算

- **`src/app/trackLayout.ts` が唯一の真実** — TrackRow / BlockView / App すべてここから消費
- `computeTrackLayout(track)` → `{ containerFrames, blockLanes, blocks, trackHeight }`
- `computeTracksLayout(tracks)` → canvas 座標系のブロック位置 + 合計高

### 実行エンジン

- `executor.ts` がトップレベルブロックのみ走査し、loop/branch/switch は再帰
- Loop: `params.iterations` (回数) or `params.whileCondition` (JSON Logic)
- Branch: `params.condition` (JSON Logic) → true/false 側を選択
- Switch: `params.expression` (JSON Logic) → cases マッチ → 勝者実行
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
