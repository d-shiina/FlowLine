# シナリオ・ポータビリティ: ノード埋め込み

## 問題

シナリオ JSON は `nodeId` 文字列のみ保存。カスタムノード `.py` はローカルの
`_runtime/nodes/` に存在するため、他者にシナリオを渡すとカスタムノードが
見つからず MockRuntime にフォールバックする。

## 解決策: シナリオにノードソースを埋め込む

### エクスポート時

シナリオが参照するノードの Python ソースを `embeddedNodes` フィールドに
マニフェスト + ソースコードとして埋め込む。

```typescript
interface Scenario {
  version: '1.0';
  // 既存フィールド ...
  /**
   * シナリオが参照するカスタムノードのソース。
   * エクスポート時に自動収集、インポート時に _runtime/nodes/ に展開。
   */
  embeddedNodes?: EmbeddedNode[];
}

interface EmbeddedNode {
  /** Node id (e.g. "custom/my-action") */
  id: string;
  /** Relative .py file path (e.g. "custom/my-action.py") */
  path: string;
  /** Python source code */
  source: string;
  /** Manifest snapshot for offline display (ports, params, label) */
  manifest: NodeManifestEntry;
}
```

### インポート時

1. `embeddedNodes` があれば、各ノードの `.py` を `_runtime/nodes/` に書き出す
2. 既存ファイルと衝突する場合はユーザーに確認 (上書き/スキップ)
3. ワーカーをリロードして新ノードを登録
4. インポート完了

### エクスポートフロー

1. シナリオ内の全 step から `nodeId` を収集 (重複除去)
2. ビルトインノード (将来フラグで判別) は除外
3. 各ノードの `.py` ソースを `readNodeSource()` で取得
4. マニフェスト情報と合わせて `embeddedNodes` に格納
5. JSON にシリアライズして保存

## 実装ステップ

### Step 1: 型定義
- `Scenario` に `embeddedNodes?: EmbeddedNode[]` 追加
- `EmbeddedNode` 型定義

### Step 2: エクスポート改修
- App.tsx の `handleExport` で使用ノードのソースを収集
- `embeddedNodes` をシナリオ JSON に含める
- preload API (`readNodeSource`) を利用

### Step 3: インポート改修
- `handleFile` で `embeddedNodes` を検出
- 衝突チェック + 確認ダイアログ
- ノードファイル書き出し + ワーカーリロード

### Step 4: 不足ノード検出 UI
- インポート後に不足ノードがあれば警告表示
- 埋め込みノードが展開されたことをログに記録

## 使用する既存 API

| API | 用途 |
|-----|------|
| `flowlineRuntime.readNodeSource(path)` | ノードソース読み取り |
| `flowlineRuntime.writeNodeSource(path, src)` | ノードファイル書き出し |
| `flowlineRuntime.reloadNodes()` | ワーカー再スキャン |
| `flowlineRuntime.manifest()` | 現在のマニフェスト取得 |
