import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* GitHub Pages のサブパス(/リポジトリ名/)でも動くよう、相対パスで出力する */
/* 画面に出す版(ビルドした日時)。古い版を開いていないか確かめられるように */
const pad = (n: number) => String(n).padStart(2, "0");
const d = new Date(Date.now() + 9 * 3600 * 1000);   /* 日本時間 */
const BUILD = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

export default defineConfig({
  base: "./",
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [react()],
});
