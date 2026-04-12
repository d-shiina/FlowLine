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

## 次の実装タスク: 同期ポイントの視覚改善

### 問題

現状の同期ポイントは 1 本の縦線で、どのトラックがどのトラックを待っているか分からない。

### 方針

**データモデルは変えない** (`{ id, label, slot }` のまま)。視覚表現だけ改善する。

### 実装手順

#### 1. SyncLine にトラック情報を渡す

```
// 現状
<SyncLine sp={sp} totalHeight={height} onDelete={...} />

// 変更後
<SyncLine
  sp={sp}
  tracks={scenario.tracks}
  trackHeights={perTrackHeights}   // computeTracksLayout から取得
  trackTops={perTrackTops}         // 同上
  onDelete={...}
/>
```

App.tsx の sync overlay の中で `computeTracksLayout` の結果を SyncLine に渡す。
`totalHeight` は `trackTops + trackHeights` から計算すればいいので削除可能。

#### 2. SyncLine をトラック別マーカーに書き換え

各トラック行に小さなマーカー (⬡ ダイヤモンド、高さ ~12px) を描く。

**マーカーの状態**:
- **待ち対象** (そのトラックに `slot < sp.slot` のブロックがある): 塗りつぶし `#f43f5e`
- **通過済み** (ブロックがない or 全部 slot >= sp.slot): 薄い枠線 `#f43f5e44`

マーカー同士を細い縦線でつなげて「バリア」感を出す。

```
トラック1: ──── ◆ ────  (ブロックあり → 待ち対象)
トラック2: ──── ◇ ────  (ブロックなし → 通過)
トラック3: ──── ◆ ────  (ブロックあり → 待ち対象)
```

#### 3. ツールチップに待ち対象トラック名を表示

```
同期ポイント: 合流 #4
待機対象: Excel処理, ログ記録
```

`tracks.filter(t => t.blocks.some(b => b.slot < sp.slot))` で対象を計算。

#### 4. 実行中のリアルタイムフィードバック (オプショナル)

execution.state.status を参照して、マーカーに色を付ける:
- 待ち中: アンバーのパルス
- 全完了 → バリア通過: グリーンの一瞬フラッシュ

これは MVP では省略可、後で追加。

### ファイル変更リスト

| ファイル | 変更内容 |
|----------|----------|
| `src/app/components/SyncLine.tsx` | Props にトラック情報追加、マーカー描画に書き換え |
| `src/app/App.tsx` | SyncLine に tracks + layout 情報を渡す |
| `src/app/trackLayout.ts` | 変更なし (既存の computeTracksLayout を使う) |
| `src/app/types.ts` | 変更なし |

### 注意点

- SyncLine は `pointer-events-none` のオーバーレイ内にある。クリック削除は `pointer-events-auto` を個別に設定
- トラックの動的高さ (switch の N レーン対応) を考慮してマーカーの Y 位置を計算すること
- `computeTracksLayout` は App.tsx で既に `regularTrackHeight` 算出に使われている。`perTrack` / `trackTops` を同じ場所からも取得してSyncLine に渡す
