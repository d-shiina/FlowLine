# FLOWLINE — コンセプト

> **ステータス**: Phase 1 基盤ドキュメント。後続の `02-error-handling.md` と `03-nodes.md`
> で詳細化・更新される箇所があるので、差分はそれぞれのドキュメントを参照。

---

## プロジェクト概要

**FLOWLINE** は、タイムライン式 UI を持つ新感覚の Windows デスクトップ RPA ツール。
既存 RPA のフローチャート / ツリー型 UI と差別化し、**並列処理・依存関係・サブルーチン**
を直感的に表現できることを目指す。

---

## コアコンセプト

### タイムライン式 × DAG

- 横軸は **秒数ではなくブロック（ステップ）単位**
  - RPA の処理時間は環境依存で事前に確定できないため、時刻ベースは不適
  - 位置 = 実行順序、依存関係 = 接続エッジで表現
- 複数トラックを縦に並べることで **並列処理を視覚的に表現**
- **同期ポイント（バリア）** で並列トラックの合流を定義
  - 「特定秒数で合流」ではなく「指定ブロックが全部完了したら合流」
  - これにより処理時間が不定でも合流タイミングを正確に制御できる
- 内部データ構造は **DAG（有向非巡回グラフ）**
  - タイムライン UI で DAG を編集するのがこのツールの独自性

### サブルーチン（再利用可能なブロック群）

- 名前付きのブロック列を定義して、複数トラックから呼び出し可能
- タイムライン上では 1 ブロックとして表示、ダブルクリックで展開編集
- 将来的には引数（変数の受け渡し）にも対応
- これにより同じ処理（例: メール送信フロー）を複数シナリオで再利用できる

### Span は使わない（2026-04 決定）

初期プロトタイプはブロックに `span`（幅 = slot 数）を持たせていたが、span は

- 実行順序にも実行時間にも影響しない純粋な装飾
- 初心者に「何を設定してるのか」の疑問を生む

という理由で廃止。**1 ブロック = 1 slot 固定**。長さで情報を伝えたい場合は
右肩バッジ（⏱ 長時間 / 🔁 リトライあり / ? skipIfMissing）で表現する。

---

## ターゲットユーザー

- 非エンジニア（現場担当者）とエンジニアの両方
- WinActor ユーザーの移行先としても意識する

---

## 技術スタック

```
UI層
  Electron + React + TypeScript
  └─ バンドラー: Vite（Electron Forge テンプレート）
  └─ タイムラインエディタ、サブルーチン管理、設定画面

UIコンポーネント
  Base UI（@base-ui/react）を直接採用
  └─ 2025/12 Base UI v1.0 stable リリース済み、MUI がメンテ
  └─ Radix UI はメンテナンス停滞中のため Base UI を選択
  └─ shadcn/ui は不採用（Base UI を直接使う方がシンプル）
  スタイリング  : Tailwind CSS v4（@tailwindcss/vite プラグイン）
  アイコン      : Lucide React
  アニメーション: Framer Motion（タイムライン再生ヘッド等）

実行エンジン
  Python 3.x
  └─ child_process + stdin/stdout（JSONライン）で通信
  └─ トラック単位で Python ワーカープロセスを起動（後述）
  └─ ローカル操作: pyautogui / uiautomation
  └─ クラウド連携: 各 Python SDK

クラウド連携（拡張）
  Box        → box-sdk-gen（既存資産あり）
  Google     → google-auth / google-api-python-client（既存資産あり）
  kintone    → requests ベース
  SharePoint → Office365-REST-Python-Client 等

ビルド・配布
  Electron Forge
  └─ make: Windows向け .exe インストーラー生成（単体配布）
  └─ publish: 自動アップデート（update.electronjs.org）

Pythonランタイム構成（embeddable Python）
  インストール先/
  └─ _runtime/
     ├─ python.exe          （embeddable Python本体）
     ├─ get-pip.py          （バンドル済み、初回起動時に実行）
     └─ Lib/site-packages/  （コアライブラリはビルド時に同梱）
        ├─ pyautogui/
        ├─ uiautomation/
        ├─ box_sdk_gen/
        └─ ...

  初回起動フロー:
    1. python.exe get-pip.py → _runtime/ 内にpipを展開
    2. 以降はプラグイン追加時に python.exe -m pip install で解決

プラグイン管理
  FLOWLINE内UIからインストール・アンインストール
  └─ コアライブラリは本体同梱 → オフラインでも基本機能は動作
  └─ 追加プラグインはネット接続時にpip経由で取得
  └─ プロキシ設定UIあり（社内環境対応）

ビルドプロセス（GitHub Actions）
  1. pip install -t _runtime/Lib/site-packages -r requirements.txt
  2. embeddable Python + get-pip.py を _runtime/ に配置
  3. Electron Forge make → exe一式に固める
       - ユーザーにPythonインストール不要
```

### 選定理由

| 項目 | 選択 | 理由 |
|---|---|---|
| OS | Windows 限定 | ローカルアプリ操作が必須 |
| UI フレームワーク | Electron | Python 連携がシンプル（child_process）、実績豊富 |
| UI ライブラリ | React + TypeScript | プロトタイプの資産をそのまま使える、型安全 |
| UI コンポーネント | Base UI 直採用 | コード所有権あり、MUI 公式メンテ、Radix 停滞への対策 |
| スタイリング | Tailwind CSS v4 | ユーティリティファースト、Base UI の data 属性と相性◎ |
| アイコン | Lucide React | 軽量・一貫性あり |
| アニメーション | Framer Motion | タイムライン再生ヘッド等の複雑アニメに対応 |
| バンドラー | Vite | Webpack より起動・HMR が高速、Forge 公式テンプレートあり |
| 実行エンジン | Python | Box/Google 等の SDK 資産が流用できる |
| ビルドツール | Electron Forge | Electron 公式推奨、ファーストパーティツール統合 |
| 自動アップデート | Forge publisher | electron-builder と異なり Electron 本体の auto-updater を直接使う |

---

## UI の設計方針

### エディタ画面

- **メインビュー**: 横スクロールのマルチトラック タイムライン
- **トラック**: 縦に複数並べて並列処理を表現
- **ブロック**: ドラッグで移動・接続、クリックでプロパティ編集（1 slot 固定）
- **同期ポイント**: 赤い縦線で全トラック横断、対象トラックを指定可能
- **サブルーチンパネル**: 左サイドバーで定義・管理、D&D でトラックに配置
- **エラー処理トラック**: タイムライン下部にピン留め（詳細: `02-error-handling.md`）

### ブロック種別

| 種別 | 色 | 用途 |
|---|---|---|
| アクション | 青 | 基本実行単位（クリック、入力等） |
| ループ | 紫 | 繰り返し（クリックで内部展開） |
| 分岐 | 黄 | TRUE/FALSE の 2 レーン |
| 待機 | シアン | 条件待ち・時間待ち |
| 同期 | 赤 | 並列トラックの合流点 |
| サブルーチン | グレー | 再利用可能なブロック群の呼び出し |

### 変数スコープ

| スコープ | キー例 | 用途 |
|---|---|---|
| scenario | `scenario.result_data` | トラック横断で共有。並列トラック間のデータ受け渡しに使う |
| track | `track.loop_index` | そのトラック内だけ有効。ループカウンタ等 |
| block | `block.tmp` | ブロック内の一時処理（内部的に処理、ユーザーは意識しない） |

ユーザーが意識するのは `scenario` と `track` の 2 種類のみ。

### エラーハンドリング（概要）

ブロックごとに `on_error` を設定。さらに「ターゲットが見つからない時は静かに
スキップ」を宣言する `skipIfMissing` フラグを組み合わせる。シナリオ全体の
安全弁として **エラー処理トラック** を持つ。詳細は `02-error-handling.md`。

### Electron と Python の IPC（概要）

child_process + stdin/stdout（JSON ライン）方式。Python ワーカーは
**トラック単位で常駐**し、ノード実行指示を JSON で受け取る。詳細は
`03-nodes.md` の実行モデルを参照。

### シナリオデータ形式（JSON）

```jsonc
{
  "version": "1.0",
  "name": "シナリオ名",
  "variables": {
    "scenario": {                      // シナリオ全体で共有
      "target_file": "data.xlsx",
      "email_to": ""
    }
  },
  "tracks": [
    {
      "id": "track-1",
      "name": "Excel処理",
      "variables": {
        "track": { "loop_index": 0 }   // トラック内スコープ
      },
      "blocks": [
        {
          "id": "block-1",
          "type": "action",
          "label": "Excelを開く",
          "nodeId": "desktop/launch_app",
          "slot": 0,
          "params": { "path": "${scenario.target_file}" },
          "inputs":  ["scenario.target_file"],
          "outputs": ["scenario.result_data"],
          "timeout": 30,
          "skipIfMissing": false,
          "onError": "abort",          // abort | skip | ignore | retry(n)
          "deps": []                    // 依存ブロックID（DAGのエッジ）
        }
      ]
    }
  ],
  "syncPoints": [
    {
      "id": "sync-1",
      "label": "合流",
      "slot": 7,
      "deps": ["block-5", "block-12", "block-18"],
      "trackIds": []
    }
  ],
  "errorHandler": {
    "id": "error-handler",
    "name": "エラー処理",
    "blocks": [ /* ... */ ]
  },
  "subroutines": [
    {
      "id": "sub-1",
      "name": "メール送信処理",
      "blocks": [ /* ... */ ]
    }
  ]
}
```

---

## プロトタイプの経緯

プロトタイプは React の JSX 単一ファイル（`rpa-timeline.jsx`）として作成。
現在は **`src/app/` 配下に Electron Forge + Vite + React + TypeScript で移植済み**。
軸も秒ベース → ブロックベースに変更済み。

---

## 参考・競合

| ツール | 特徴 | FLOWLINE との差別化 |
|---|---|---|
| WinActor | ツリー型、日本製、高価 | タイムライン型、並列処理が直感的 |
| UiPath | フローチャート型、エンタープライズ | 軽量、シンプル、低コスト |
| Power Automate Desktop | Microsoft 製、無料 | 並列・サブルーチンが強い |
| Zapier / Make | クラウド iPaaS | ローカルアプリ操作が可能 |
