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

## ブランチの版を手元で試す

1. `git fetch origin && git checkout feature/ticket-manager`
2. `cd web && npm install`
3. どちらかで開く
   - `npm run dev` → 表示された URL(http://localhost:5173/ など)をブラウザで開く
   - `npm run build:single` → `web/dist-single/index.html` をダブルクリックで開く

手元で開いたページのデータは、公開ページ(github.io)とは別に保存される(ブラウザはURLごとに保存先を分けるため)。
