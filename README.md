# tb-faL9ujkj0

チケット作成ツール「Ticket Builder」。

- `web/` … 現行版(React + TypeScript + Vite)。`main` へ push すると GitHub Actions でビルドし、GitHub Pages に公開する。
- `index.html` … 単一ファイルだった頃の旧版。

## 開発

```
cd web
npm install
npm run dev     # 開発用サーバー
npm test        # 本文の整形が旧版と一致するかのテスト
npm run build   # web/dist に出力
npm run build:single  # web/dist-single/index.html に1ファイル版を出力(ダブルクリックで開ける)
```

## ローカルで使う(ビルド不要)

1. 公開ページ右上の「ローカル版・データ」→「アプリをダウンロード」で `ticket-builder.html` を保存する
2. ダブルクリックでブラウザで開く(ネット接続なしで動く)
3. 公開ページのデータを続けて使うときは、公開ページで「データを書き出す(.json)」→ ローカル版で「データを読み込む」

公開ページとローカル版は、データの保存先が別(ブラウザはURLごとに保存先を分けるため)。行き来するときは、同じ手順でデータを書き出して読み込む。

## チケット・切り分けを受け渡す

- チケット：一覧の「ファイルに書き出す」（検索・絞り込みで表示中のものだけ）、または各チケットの「仕上げ」の「ファイルに書き出す」
- 切り分け：一覧の「すべてファイルに書き出す」、または結果の欄の「ファイルに書き出す」（つながっているチケット本文も入る）
- 受け取った人は、一覧の「読み込む」で足す。今の内容は消えない。同じものがあれば、1件ずつ「上書き」か「別に追加」を選ぶ（「元に戻す」で取り消せる）

「ローカル版・データ」の「すべてのデータを置き換えて読み込む」は、ブラウザ間の移行用（今の内容を置き換える）。

## ブランチの版を手元で試す

1. `git fetch origin && git checkout feature/ticket-manager`
2. `cd web && npm install`
3. どちらかで開く
   - `npm run dev` → 表示された URL(http://localhost:5173/ など)をブラウザで開く
   - `npm run build:single` → `web/dist-single/index.html` をダブルクリックで開く

手元で開いたページのデータは、公開ページ(github.io)とは別に保存される(ブラウザはURLごとに保存先を分けるため)。
