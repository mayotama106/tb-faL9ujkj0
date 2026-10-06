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
```
