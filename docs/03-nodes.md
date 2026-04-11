# FLOWLINE — ノード設計

> **ステータス**: 2026-04 rev2。当初原案 (rev1) に対する 6 点の構造変更を反映。
> Phase 2（Python 実行エンジン）の実装ガイドとして使う。

### rev1 → rev2 の主な変更

1. `inputs` / `outputs` 文字列リスト → **ポートベース I/O + シナリオ変数バインディング**
2. Run ごとの spawn/kill → **常駐ワーカープール (アイドル保持 + reset)**
3. `escalate` をワーカーが返す → **エラーポリシーは engine 専権**
4. ID 衝突 last-wins → **ロード時ハードエラー (`overrides=True` のみ例外)**
5. 式言語を **JSON Logic** に確定 (loop / branch の条件)
6. ノード `run()` 実行中は stdlib `logging` → `ctx.log()` に**自動ブリッジ**

---

## 設計原則

1. **built-in と custom の 2 層分離** — フロー制御は engine に内蔵、操作系は差し替え可能に
2. **トラック単位の常駐ワーカープロセス** — アイドル状態で保持、Run ごとに reset するだけ
3. **ポートベース I/O + バインディング** — ノードはポートを宣言、シナリオ JSON がシナリオ変数と繋ぐ
4. **JSON が常にデコレータを上書き** — シナリオ作者はコードを触らずにノード挙動を調整できる
5. **エラーポリシーは engine 専権** — ワーカーは「何が起きたか」のみ、「どうするか」は engine
6. **ノード ID は ASCII、label は多言語** — 国際化と diff の読みやすさの両立
7. **`.fln` = ZIP、ソースオープン、ただし **インストール時に確認ダイアログ**** — エコシステム広がりと安全性の両立

---

## ノードの分類

### Built-in ノード

engine.py 内で直接実行される。**フロー制御のみ** 担当し、操作は一切行わない。
ユーザーは編集不可。

| ノード ID | 役割 |
|---|---|
| `loop` | 指定回数 or 条件が真の間繰り返す |
| `branch` | 条件式で TRUE / FALSE に分岐 |
| `sync` | 指定ブロックが全部完了するまで待機（並列合流） |
| `subroutine` | 定義済みサブルーチンを呼び出す |

**原案から削除したもの:**

- `set_var` / `get_var` — `flow.push` / `flow.pull` と二重表現になるため削除。
  定数の初期化は `scenario.variables` で、動的更新は operations ノードの副作用で表現する。
- `error_handler` — エラー処理は **ノードの `onError` フィールド** + **エラー処理トラック**
  （`02-error-handling.md` 参照）の 2 階層で表現できるため、独立したノードにする必要なし。

### Custom ノード

トラック単位のワーカープロセス内で実行される。操作系・連携系を担当し、
クラッシュが engine に波及しない。

- デフォルト実装（`desktop` / `file` / `cloud`）も custom ノードとして実装される
- ユーザー定義のノードと完全に同列扱い
- `.fln` 形式で配布・共有できる

---

## 実行モデル

### トラック単位 × 常駐ワーカープール

```
Electron (engine orchestrator, TS)
 ├─ python_worker_1   ← Track 1 に割り当て (アイドル保持)
 ├─ python_worker_2   ← Track 2 に割り当て
 ├─ python_worker_3   ← Track 3 に割り当て
 └─ python_worker_err ← エラー処理トラック専用
```

**なぜノード単位ではなくトラック単位か:**

| 方式 | 起動コスト | 変数共有 | キャンセル | 総合判定 |
|---|---|---|---|---|
| **ノードごと subprocess** | ❌ 1-2 秒 / ノード | ❌ 毎回失われる | ✅ プロセスごと kill | ❌ 現実的でない |
| **単一 Python プロセス** | ✅ 起動 1 回 | ✅ フル共有 | ❌ sleep 中は止まらない | ❌ キャンセル不能 |
| **トラック単位 subprocess** | ✅ トラックあたり 1 回 | ✅ トラック内は共有 | ✅ プロセスごと kill | ✅ 最適 |

具体的には、`import uiautomation` だけで 800-1500 ms、`import pandas` で
500-800 ms かかる。100 ノードのシナリオがノード単位起動だと import オーバーヘッドだけで
数分溶ける。トラック単位ならトラックあたり 1 回で済む。

**さらに**、Run のたびに spawn/kill するのも勿体ない。編集 → 実行 → 編集を 1 分に
何度も繰り返すノード開発中、毎回 import warmup を払うのは試行回数を削る。

### 常駐プールと reset

- **lazy spawn**: 最初の Run 要求時に不足分のワーカーを立ち上げる、以降は保持
- **Run 終了時**: kill せず `reset` コマンドで track-scope 変数をクリアするだけ
- **アイドル時間 5 分で自動停止**: メモリ解放 (設定で変更可)
- **Toolbar の Python チップから明示停止**: 手動でランタイムを畳める
- **クラッシュ時**: 該当ワーカーだけを再 spawn、他のトラックは継続

### ワーカーのライフサイクル (1 Run 内)

```
1. engine が実行開始、必要トラック数ぶんワーカーを確保 (不足分を lazy spawn)
2. 各ワーカーに { "type": "reset" } を送って前回状態をクリア
3. ブロック実行ごとに engine → worker に { "type": "run_node", ... }
4. ワーカーが run() を実行、log / result を engine にストリーム
5. キャンセル時: engine → worker に { "type": "cancel" }、worker が cancel_event をセット
   ノード内の ctx.cancelled チェックで協調キャンセル
6. Run 終了: engine が { "type": "reset" } を送って idle に戻す (kill しない)
```

### IPC プロトコル

stdin/stdout の JSON ライン。全フレームが 1 行 1 オブジェクト + `\n`。

**engine → worker**: `run_node`
```jsonc
{
  "type":     "run_node",
  "reqId":    "r-42",
  "blockId":  "b-10",
  "trackId":  "t-main",
  "nodeId":   "desktop/click",
  "params":   { "method": "xpath", "value": "//Button[@Name='OK']", "timeout": 5 },
  "ports":    { "target": "メインウィンドウ" }   // in ポートを engine が事前解決
}
```

**worker → engine**: ログ (逐次ストリーム、result を待たない)
```jsonc
{ "type": "log", "reqId": "r-42", "blockId": "b-10", "level": "info",
  "message": "クリック実行中…" }
```

**worker → engine**: 成功
```jsonc
{
  "type":    "result",
  "reqId":   "r-42",
  "blockId": "b-10",
  "ok":      true,
  "outputs": { "result": "ok" }   // 宣言した out ポートのみ
}
```

**worker → engine**: 失敗 (ポリシーは engine が決定)
```jsonc
{
  "type":      "result",
  "reqId":     "r-42",
  "blockId":   "b-10",
  "ok":        false,
  "missing":   false,                // ターゲット未検出は true (skipIfMissing 用)
  "error": {
    "message":   "ターゲットが見つからない",
    "traceback": "..."
  }
}
```

ワーカーは `escalate` や `onError` を**知らない**。engine がブロック定義の
`onError` (JSON > デコレータ) を解決して abort / skip / ignore / retry(n) を適用する。
retry はもう一度 `run_node` を投げ直す形で実装する。

**engine → worker**: その他のコマンド
```jsonc
{ "type": "hello" }                           // ハンドシェイク
{ "type": "cancel",   "reqId": "r-42" }       // 実行中のキャンセル
{ "type": "reset" }                           // Run 間の状態クリア
{ "type": "shutdown" }                        // プロセス終了
```

**worker → engine**: 起動完了通知
```jsonc
{
  "type":  "ready",
  "nodes": [
    { "id": "desktop/click", "label": "クリック", "labels": {"ja": "クリック", "en": "Click"},
      "category": "desktop", "version": "1.0.0",
      "ports":  { "target": {"kind": "in", "type": "string"}, "result": {"kind": "out", "type": "string"} },
      "params": { ... } }
  ]
}
```

---

## カスタムノードのインターフェース

### ポートベース I/O

ノードは「このブロックが何を入出力するか」を **ポート** で宣言する。変数名はノード側に
書かず、シナリオ JSON の **バインディング** でシナリオ変数と繋ぐ。これにより同じノードが
異なるシナリオで別の変数を参照して使い回せる。

```python
# nodes/desktop/click.py
from flowline import node

@node(
    id       = "desktop/click",
    label    = "クリック",
    labels   = { "ja": "クリック", "en": "Click" },
    category = "desktop",
    version  = "1.0.0",

    # ポート定義: このノードが in / out で持つ論理変数
    ports = {
        "target": { "kind": "in",  "type": "string", "required": True },
        "result": { "kind": "out", "type": "string" },
    },

    # パラメータのデフォルト値とスキーマ
    params = {
        "method":  { "type": "enum", "choices": ["image", "xpath", "text", "coordinate"], "default": "image" },
        "value":   { "type": "string", "default": "" },
        "timeout": { "type": "number", "default": 5 },
    },

    # デフォルト挙動 (JSON で上書きされる)
    onError = "abort",               # abort | skip | ignore | retry(n)
)
def run(ports, params, ctx):
    target = ports["target"]

    ctx.log("info", f"クリック実行: {params['method']}={params['value']}")
    do_click(params["method"], params["value"], target)

    return { "result": "ok" }
```

シナリオ JSON はポートを実際のシナリオ変数に繋ぐ:

```jsonc
{
  "nodeId": "desktop/click",
  "params": { "method": "xpath", "value": "//Button[@Name='OK']", "timeout": 5 },
  "bindings": {
    "target": "scenario.main_window",
    "result": "scenario.last_click"
  }
}
```

### なぜポートか (原案からの変更理由)

原案の `inputs=["scenario.target"]` は、ノード実装がシナリオ変数名に直接結びついていた。
同じクリックノードを `scenario.main_window` を参照する別シナリオで使うのに書き換え必須になる。

ポート/バインディングに分けると:

1. **ノードが pure** — `scenario.*` の命名を知らない。同じノードを複数シナリオで使い回せる
2. **Inspector が自動で wiring UI を生成** — ポート定義を読むだけでフォームが書ける
3. **型チェック** — 編集時に ports の type とバインド先の実値型を検査できる
4. **グラフが意味を持つ** — 将来ブロック同士のポート直結 (変数を介さない) にも拡張可能

これは Blender / Houdini / n8n / ComfyUI / Unreal Blueprints が共通して採用するパターン。

### `run()` の引数

| 引数 | 型 | 説明 |
|---|---|---|
| `ports` | `dict[str, Any]` | 宣言した in ポートの値 (engine がバインディング経由で解決済み) |
| `params` | `dict[str, Any]` | JSON の `params` がデコレータのデフォルトを上書きした結果 |
| `ctx` | `NodeContext` | `ctx.log()` / `ctx.track_id` / `ctx.block_id` / `ctx.cancelled` などを提供 |

戻り値は `dict[str, Any]`。**デコレータで宣言した out ポートのキーだけ** が engine に反映される
(宣言外のキーは警告ログ付きで無視される)。

### ログとキャンセル検知

```python
def run(ports, params, ctx):
    for i in range(100):
        if ctx.cancelled:
            return {}     # 早期リターンで協調キャンセル
        ctx.log("info", f"処理中 {i}/100")
        do_something()
```

`ctx.cancelled` は **abort シグナルを受けてキャンセル中** であることを示す。
ループ内でチェックすれば、ワーカープロセスが SIGKILL される前にきれいに抜けられる。

### stdlib `logging` の自動ブリッジ

ノード作者は何もしなくていい。`run()` の実行中だけ Python 標準 `logging` の root logger に
ハンドラが挿入され、ライブラリが吐くログが `ctx.log()` 経由で ExecutionLogPanel に流れる。

```python
import requests

def run(ports, params, ctx):
    # requests の内部 DEBUG ログも自動で ExecutionLogPanel に表示される
    r = requests.get(ports["url"])
    return { "body": r.text }
```

`logging` のレベル (`DEBUG`/`INFO`/`WARNING`/`ERROR`) は FLOWLINE の `info`/`warn`/`error` に
マッピングされる。ブリッジは `run()` が抜けた瞬間に解除される。

---

## デコレータ vs JSON の優先順位

**原則: JSON が常にデコレータを上書きする。**

シナリオ作者（非エンジニア）がコードを触らずに、個別ブロックの挙動を調整できる
ことを優先する。具体例:

```python
@node(id="desktop/click", onError="retry(3)", params={"timeout": {"default": 5}})
def run(...): ...
```

```jsonc
{
  "nodeId": "desktop/click",
  "onError": "abort",          // retry(3) を上書き
  "params": { "timeout": 30 }  // 5 を上書き
}
```

結果: このブロックは timeout=30 秒、失敗したら即 abort。デコレータの値は
無視される。

上書き対象:

- `onError`
- `params.*`
- `timeout`
- `skipIfMissing`

上書き **できない** もの（ノードの本質を変えるため）:

- `id` / `category`
- `inputs` / `outputs` の宣言
- `run()` の実装

---

## ターゲット指定方式

操作系ノードが「何を操作するか」を指定する共通スキーマ:

| method | 内容 | 安定性 | 用途 |
|---|---|---|---|
| `image` | 画像マッチング（pyautogui） | 中 | 汎用、Web ブラウザ等 |
| `xpath` | UI 要素の XPath（uiautomation） | 高 | Windows ネイティブアプリ |
| `text` | テキストで要素を探す | 中 | シンプルな操作 |
| `coordinate` | 座標直指定 | 低 | 最終手段 |

```jsonc
{
  "nodeId": "desktop/click",
  "params": {
    "method":  "xpath",
    "value":   "//Button[@Name='送信']",
    "timeout": 5
  }
}
```

---

## デフォルト実装ノード一覧

インストール時に本体同梱する。ユーザーのカスタムノードと同列扱い。

### desktop カテゴリ

| ノード ID | ラベル | 主な params |
|---|---|---|
| `desktop/click` | クリック | method, value, timeout |
| `desktop/double_click` | ダブルクリック | method, value, timeout |
| `desktop/right_click` | 右クリック | method, value, timeout |
| `desktop/input_text` | テキスト入力 | method, value, text, clear_first |
| `desktop/key_press` | キー送信 | keys（例: "ctrl+c"） |
| `desktop/scroll` | スクロール | method, value, direction, amount |
| `desktop/screenshot` | スクリーンショット | region（`scenario.screenshot` に書き込み） |
| `desktop/wait_image` | 画像出現待ち | image, timeout |
| `desktop/launch_app` | アプリ起動 | path, args |
| `desktop/switch_window` | ウィンドウ切替 | title |
| `desktop/get_text` | テキスト取得 | method, value |

### file カテゴリ

| ノード ID | ラベル | 主な params |
|---|---|---|
| `file/read_file` | ファイル読込 | path, encoding |
| `file/write_file` | ファイル書込 | path, content, encoding |
| `file/copy_file` | ファイルコピー | src, dst |
| `file/delete_file` | ファイル削除 | path |
| `file/read_excel` | Excel 読込 | path, sheet, range |
| `file/write_excel` | Excel 書込 | path, sheet, cell, value |

### cloud カテゴリ（拡張）

| ノード ID | ラベル | 主な params |
|---|---|---|
| `cloud/box_upload` | Box アップロード | folder_id, file_path |
| `cloud/box_download` | Box ダウンロード | file_id, dest_path |
| `cloud/gmail_send` | Gmail 送信 | to, subject, body |
| `cloud/gmail_read` | Gmail 読込 | query |
| `cloud/sheets_read` | Sheets 読込 | spreadsheet_id, range |
| `cloud/sheets_write` | Sheets 書込 | spreadsheet_id, range, value |
| `cloud/drive_upload` | Drive アップロード | folder_id, file_path |
| `cloud/slack_post` | Slack 投稿 | channel, text |

---

## ディレクトリ構造

```
_runtime/
└─ nodes/
   ├─ desktop/
   │  ├─ click.py
   │  ├─ input_text.py
   │  └─ ...
   ├─ file/
   │  ├─ read_excel.py
   │  └─ ...
   ├─ cloud/
   │  ├─ box_upload.py
   │  ├─ gmail_send.py
   │  └─ ...
   └─ custom/          ← ユーザー定義・インポートしたノードはここ
      └─ my_node.py
```

ワーカープロセスは起動時に `_runtime/nodes/**/*.py` を全部 import し、
`@node` デコレータで登録されたノードを内部レジストリに溜める。

### ID 衝突時の扱い

原則: **同じ `id` のノードを複数登録するとロード時にハードエラー**。順序依存の無言バグを
避けるため、last-wins は採用しない。

唯一の例外は **明示的なオーバーライド**:

```python
@node(id="desktop/click", overrides=True, ...)
def run(...): ...
```

`overrides=True` を宣言したノードは既存の同 ID ノードを**意図的に置き換える**。
`_runtime/nodes/custom/` に置いた社内版 `desktop/click` で built-in を差し替える、といった
正規フローに使う。2 枚の `overrides=True` が同じ ID に当たる場合も、やはりエラー。

将来的には `@node(id=..., version=...)` で複数バージョン共存を検討。

---

## 変数スコープ (バインディング先)

シナリオ JSON の `bindings` は、ポートを以下のいずれかの変数キーに繋げる:

| スコープ | キー例 | 生存範囲 |
|---|---|---|
| `scenario` | `scenario.result_data` | シナリオ全体、トラック間で engine 経由で同期 |
| `track` | `track.loop_index` | そのトラック内 (engine 側で track ごとに保持) |
| `block` | (内部処理のみ) | ユーザー非公開 |

### 変数ストアは engine 所有

ワーカー内にはシナリオ変数を持たない。engine (TypeScript) が全変数の唯一の真実とする:

1. `run_node` 送信時に、engine がバインディングを解決し in ポートの値を `ports: {...}` に詰める
2. ワーカーは `run()` を実行、out ポートを `outputs: {...}` に詰めて返す
3. engine が `outputs` のキーをバインディング経由でシナリオ変数に反映

### 書き込み可視性

- `scenario.*` への書き込みは **ブロック実行完了時に engine に反映** される
- 他のトラックからは **次にそのブロックが engine に問い合わせた時に見える**
- **同時刻の並列書き込みは last-write-wins** (決定論性はユーザー側で sync point を使って保証する)

---

## エラーハンドリング

詳細は `02-error-handling.md` 参照。ノード設計から見た要点:

- **ポリシーは engine の専権**: ワーカーは `ok: false` + `error: {...}` を返すだけ。
  abort / skip / ignore / retry の判定は engine が実施
- デコレータの `onError` は **デフォルト値**、JSON で上書き可能
- `skipIfMissing` はデコレータでも JSON でも指定できる。ワーカーは `missing: true` を返す
  ことで engine に「ターゲット不在」を伝える (engine 側で skipIfMissing 判定)
- `retry(n)` は engine がもう一度 `run_node` を投げ直して実装する。リトライ間隔は
  1 秒固定 (将来はパラメータ化)
- エラー処理トラック内のノードは `onError: abort` を engine 側で強制的に `skip` に変換

---

## 式言語 (loop / branch の条件)

built-in の loop / branch は条件式を受け取る。安全性とシナリオ作者の書きやすさを両立するため、
**[JSON Logic](https://jsonlogic.com/)** を採用する。

```jsonc
{
  "nodeId": "loop",
  "params": {
    "condition": { "<": [ { "var": "scenario.count" }, 10 ] },
    "body":      [ /* ブロックの並び */ ]
  }
}
```

```jsonc
{
  "nodeId": "branch",
  "params": {
    "condition": { "==": [ { "var": "scenario.status" }, "ok" ] },
    "then":      [ /* ... */ ],
    "else":      [ /* ... */ ]
  }
}
```

**採用理由:**

- **GUI で組み立てやすい** — ネスト JSON なので dropdown ベースの条件エディタが自作しやすい
- **diff レビュー可能** — エクスポートされたシナリオ JSON で条件の差分が読める
- **`eval` 的危険ゼロ** — パーサが JSON 構造しか解釈しない、任意コード実行の面が存在しない
- **変数参照が明示的** — `{ "var": "scenario.count" }` で変数と定数が構文上区別される

engine 側では [`json-logic-js`](https://www.npmjs.com/package/json-logic-js) を採用予定。
式言語として不足する場面が出てきたら、カスタム演算子を追加する方向で拡張する。

Inspector には将来「条件式ビルダ」を統合 (Phase 2b)。それまではプレーンな JSON テキストエリアで受ける。

---

## 配布形式 `.fln`

### 設計方針

ソースはオープンのまま、共有を限りなく簡単にする。
知財保護よりも **エコシステムの広がり** を優先。

### ファイル構造

`.fln` の実態は ZIP。拡張子だけ FLOWLINE 独自:

```
my_node.fln  （= zip）
├─ node.py           ← ノード本体（@node デコレータ付き）
├─ meta.json         ← id, label, version 等（下記）
├─ requirements.txt  ← 依存ライブラリ（省略可）
└─ README.md         ← 使い方説明（省略可）
```

### meta.json

```jsonc
{
  "id":       "logic/string_concat",   // ASCII、node.py の @node(id=...) と一致
  "label":    "文字列連結",
  "labels": {
    "ja": "文字列連結",
    "en": "String Concat"
  },
  "category": "logic",
  "version":  "1.0.0",
  "author":   "Daiki",
  "description": "2 つの文字列を連結してシナリオ変数に格納する",
  "requiresFlowline": ">=0.1.0"
}
```

### インストールフロー

```
ユーザー操作:
  .fln をダブルクリック
  or FLOWLINE にドラッグ&ドロップ
  or プラグイン管理画面から「ファイルを開く」

FLOWLINE の挙動:
  1. ZIP を一時展開
  2. meta.json をパース
  3. 確認ダイアログを出す（後述）  ← ここが重要
  4. ユーザーが承認したら:
     a. ノードを _runtime/nodes/custom/<id>/ にコピー
     b. requirements.txt があれば python -m pip install で解決
     c. ワーカープロセスにホットリロードを指示（または次回起動時に反映）
  5. タイムラインエディタのノード一覧に即時反映
```

### セキュリティ: インストール前の確認ダイアログ

`.fln` は任意の Python コードなので、**ダブルクリック = 即インストール**
は禁止。必ず以下のダイアログを出す:

```
┌──────────────────────────────────────────────┐
│ FLOWLINE: ノードをインストール                  │
│                                              │
│ ID:      logic/string_concat                 │
│ ラベル:  文字列連結                           │
│ 作者:    Daiki                                │
│ バージョン: 1.0.0                              │
│ 説明:    2 つの文字列を連結してシナリオ変数に…  │
│                                              │
│ ▸ コードを表示                                │
│ ▸ 追加される依存ライブラリ:                    │
│     - requests >= 2.28                       │
│     - openpyxl >= 3.1                        │
│                                              │
│   ⚠ .fln は任意のコードを実行できます。         │
│     信頼できる提供元かを必ず確認してください。  │
│                                              │
│        [ キャンセル ]   [ インストール ]       │
└──────────────────────────────────────────────┘
```

### 将来のセキュリティ強化（Phase 4 以降）

- **署名検証**: `.fln` に作者の署名を入れ、信頼済み作者のリストと照合
- **サンドボックス**: ワーカープロセスの権限を制限（ファイル書き込み先、ネットワークアクセス）
- **requirements.txt の許可リスト**: 既知の危険パッケージを拒否
- **PyPI 以外禁止**: リポジトリ指定のインストールを拒否

### WinActor との比較

|  | WinActor | FLOWLINE |
|---|---|---|
| 共有形式 | バイナリ（.ums 等） | `.fln`（ZIP、ソースオープン） |
| インストール | 手動配置 | ダブルクリック + 確認ダイアログ |
| 依存解決 | 手動 | 自動（requirements.txt） |
| ソース保護 | あり | なし（オープン前提） |
| 配布場所 | 社内共有 | GitHub / 任意の場所 |

---

## Phase 2 実装タスク

### Python 側 (worker)
- [x] `@node` デコレータ・`NodeSpec`・`REGISTRY`
- [x] `NodeContext` (log / cancelled / track_id / block_id)
- [x] worker.py: JSON ライン IPC ループ、ready/run_node/cancel/shutdown
- [ ] `ports` ベースの `run(ports, params, ctx)` 署名切替
- [ ] ID 衝突のハードエラー + `overrides=True`
- [ ] stdlib `logging` → `ctx.log()` の自動ブリッジ
- [ ] `reset` コマンド (track-scope 変数クリア)
- [ ] out ポートのホワイトリスト絞り込み + 宣言外警告

### Electron 側 (engine orchestrator, TS)
- [ ] `src/main/pythonWorker.ts`: 常駐ワーカープール (lazy spawn / アイドル 5 分 / reset)
- [ ] `src/app/engine/ipcRuntime.ts`: MockRuntime と同インターフェースの実 Python ランタイム
- [ ] `useExecution` のランタイム自動選択 (Python 在/不在)
- [ ] バインディング解決: ports と scenario/track 変数ストアの入出力
- [ ] built-in: `loop` / `branch` / `sync` / `subroutine` を engine 内で実装
- [ ] 式言語: `json-logic-js` で loop/branch 条件評価
- [ ] エラーポリシー: abort / skip / ignore / retry(n) の適用
- [ ] `missing: true` + `skipIfMissing` のハンドリング
- [ ] エラー処理トラック専用ワーカーの起動ロジック + `onError: abort → skip` 強制変換
- [ ] SIGTERM / SIGKILL によるキャンセル伝播

### ノード本体
- [ ] `_runtime/nodes/debug/log.py`: 動作確認用最小ノード
- [ ] デフォルト desktop ノード 11 個
- [ ] デフォルト file ノード 6 個
- [ ] (cloud カテゴリは Phase 3 以降)

## Phase 4 実装タスク（配布）

- [ ] `.fln` ファイル形式のパーサ
- [ ] インストール確認ダイアログ
- [ ] `python -m pip install` でのライブラリ解決
- [ ] `.fln` を Windows のファイル関連付けに登録
- [ ] プラグイン管理画面（一覧 / 更新 / アンインストール）
- [ ] プロキシ設定 UI
