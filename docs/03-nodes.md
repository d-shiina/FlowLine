# FLOWLINE — ノード設計

> **ステータス**: 2026-04 決定版。原案に対して 7 項目の論点反映済み。
> Phase 2（Python 実行エンジン）の実装ガイドとして使う。

---

## 設計原則

1. **built-in と custom の 2 層分離** — フロー制御は engine に内蔵、操作系は差し替え可能に
2. **トラック単位のワーカープロセス** — ノード単位の subprocess ではなく、トラック単位で常駐
3. **inputs / outputs 宣言 + バルク IPC** — 実行前後の 1 往復で変数を同期
4. **JSON が常にデコレータを上書き** — シナリオ作者はコードを触らずにノード挙動を調整できる
5. **ノード ID は ASCII、label は多言語** — 国際化と diff の読みやすさの両立
6. **`.fln` = ZIP、ソースオープン、ただし **インストール時に確認ダイアログ**** — エコシステム広がりと安全性の両立

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

### トラック単位のワーカープロセス

```
Electron (engine orchestrator)
 ├─ python_track_1.exe   ← Track 1 の全ノードを順に実行
 ├─ python_track_2.exe   ← Track 2 の全ノードを順に実行
 ├─ python_track_3.exe   ← Track 3 の全ノードを順に実行
 └─ python_error.exe     ← エラー処理トラック用（idle）
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

### ワーカーのライフサイクル

```
1. Electron が engine.py を起動
2. engine.py がシナリオを解釈、トラック数だけ python_worker.py を spawn
3. 各ワーカーは起動時に全ノードモジュールを import（1 回だけ）
4. engine から JSON でノード実行指示が届くたびに、指定ノードの run() を呼ぶ
5. 結果を JSON で返す
6. シナリオ終了 or abort でワーカー停止
```

### IPC プロトコル

stdin/stdout の JSON ライン。engine → worker:

```jsonc
{
  "type": "run_node",
  "blockId": "b-10",
  "nodeId": "desktop/click",
  "params": { "method": "xpath", "value": "//Button[@Name='OK']", "timeout": 5 },
  "inputs": {
    "scenario.target": "メインウィンドウ"
  }
}
```

worker → engine:

```jsonc
{
  "type": "result",
  "blockId": "b-10",
  "status": "ok",
  "outputs": {
    "scenario.last_click": "ok"
  },
  "logs": [
    { "level": "info", "message": "クリック成功" }
  ]
}
```

エラー時:

```jsonc
{
  "type": "result",
  "blockId": "b-10",
  "status": "error",
  "escalate": "abort",     // Layer 2 へ
  "error": {
    "message": "ターゲットが見つからない",
    "traceback": "..."
  }
}
```

---

## カスタムノードのインターフェース

### デコレータ定義

```python
# nodes/desktop/click.py
from flowline import node

@node(
    id       = "desktop/click",     # ASCII、category/name 形式
    label    = "クリック",            # 表示用（i18n 可）
    labels   = {                    # 多言語化したい場合
        "ja": "クリック",
        "en": "Click",
    },
    category = "desktop",           # desktop / file / cloud / logic / custom
    version  = "1.0.0",

    # このノードが読む / 書く変数を「宣言」する
    inputs  = ["scenario.target"],
    outputs = ["scenario.last_click"],

    # パラメータのデフォルト値とスキーマ
    params  = {
        "method":  { "type": "enum", "choices": ["image", "xpath", "text", "coordinate"], "default": "image" },
        "value":   { "type": "string", "default": "" },
        "timeout": { "type": "number", "default": 5 },
    },

    # デフォルト挙動（JSON で上書きされる）
    onError = "abort",               # abort | skip | ignore | retry(n)
)
def run(inputs, params, ctx):
    target = inputs["scenario.target"]
    method = params["method"]
    value  = params["value"]

    ctx.log("info", f"クリック実行: {method}={value}")
    do_click(method, value, target)

    return {
        "scenario.last_click": "ok"
    }
```

### `run()` の引数

| 引数 | 型 | 説明 |
|---|---|---|
| `inputs` | `dict[str, Any]` | デコレータの `inputs` で宣言した変数の値を engine が事前取得して渡す |
| `params` | `dict[str, Any]` | JSON の `params` がデコレータのデフォルトを上書きした結果 |
| `ctx` | `NodeContext` | `ctx.log()` / `ctx.track_id` / `ctx.block_id` / `ctx.cancelled` などを提供 |

戻り値は `dict[str, Any]`。**デコレータの `outputs` で宣言したキーだけ** が
engine に反映される（それ以外は無視されて警告ログが出る）。

### 旧 `flow.pull` / `flow.push` との対比

原案では WinActor の `!var!` / `$var$` に倣った `flow.pull` / `flow.push` API だったが、
以下の理由で **inputs / outputs 辞書を引数で受ける関数型** に変更した:

1. **IPC 往復を 1 回に圧縮** — pull/push を関数呼び出しで実装すると、ノード実行中に
   engine と何度もラウンドトリップが発生する。宣言ベースなら 1 回で済む
2. **静的解析が可能** — 実行前に「このノードはどの変数を読み書きするか」が分かるので、
   デバッグ・依存関係検出・ドキュメント生成ができる
3. **デグレード時の挙動が明確** — 宣言にない変数を読もうとしたらエラー（黙って失敗しない）
4. **RPA ノードは大半が pure function** — 可変代入の柔軟性はほぼ不要

WinActor 互換の書き心地が欲しい場合は、将来のオプションとして `flow.pull` / `flow.push`
を **宣言を自動で推論する糖衣構文** として再導入する余地はある。

### ログとキャンセル検知

```python
def run(inputs, params, ctx):
    for i in range(100):
        if ctx.cancelled:
            return {}     # 早期リターンで協調キャンセル
        ctx.log("info", f"処理中 {i}/100")
        do_something()
```

`ctx.cancelled` は **abort シグナルを受けてキャンセル中** であることを示す。
ループ内でチェックすれば、ワーカープロセスが SIGKILL される前にきれいに抜けられる。

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

- 同じ `id` を持つノードが複数あった場合は **後から import された方が勝つ**
  ＋ 警告ログを出す
- 将来的には `@node(id=..., version=...)` で複数バージョン共存を検討

---

## 変数スコープと IPC

| スコープ | キー例 | 生存範囲 |
|---|---|---|
| `scenario` | `scenario.result_data` | シナリオ全体、トラック間で engine 経由で同期 |
| `track` | `track.loop_index` | そのトラック内（ワーカー内メモリ） |
| `block` | （内部処理のみ） | ユーザー非公開 |

### 書き込み可視性

- `scenario.*` への書き込みは **ブロック実行完了時に engine に反映** される
- 他のトラックからは **次にそのブロックが engine に問い合わせた時に見える**
- **同時刻の並列書き込みは last-write-wins**（決定論性はユーザー側で sync point を使って保証する）

---

## エラーハンドリング

詳細は `02-error-handling.md` 参照。ノード設計から見た要点:

- デコレータの `onError` は **デフォルト**、JSON で上書き可能
- `skipIfMissing` はデコレータでも JSON でも指定できる
- `retry(n)` のリトライ間隔は 1 秒固定（将来はパラメータ化）
- エラー処理トラック内のノードは `onError: abort` を強制的に `skip` に変換

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

- [ ] engine.py: トラックごとに Python ワーカーを spawn
- [ ] worker.py: 起動時にノードレジストリを構築、JSON ライン IPC を待つ
- [ ] `@node` デコレータとレジストリ
- [ ] `NodeContext`（log / cancelled / track_id / block_id）
- [ ] inputs / outputs の宣言ベース解決
- [ ] built-in ノード（loop / branch / sync / subroutine）の engine 側実装
- [ ] デフォルト desktop ノード 10 個を実装
- [ ] デフォルト file ノード 6 個を実装
- [ ] SIGTERM / SIGKILL によるキャンセル伝播
- [ ] `scenario.error.*` のセット
- [ ] エラー処理トラック専用ワーカーの起動ロジック
- [ ] `skipIfMissing` のターゲット存在チェック

## Phase 4 実装タスク（配布）

- [ ] `.fln` ファイル形式のパーサ
- [ ] インストール確認ダイアログ
- [ ] `python -m pip install` でのライブラリ解決
- [ ] `.fln` を Windows のファイル関連付けに登録
- [ ] プラグイン管理画面（一覧 / 更新 / アンインストール）
- [ ] プロキシ設定 UI
