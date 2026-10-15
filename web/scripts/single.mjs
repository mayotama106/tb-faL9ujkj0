/* 手元で試すための1ファイル版を作る。dist/ のビルド結果の JS と CSS を index.html に埋め込み、
   dist-single/index.html に書き出す(ダブルクリックでブラウザで開ける) */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
let html = readFileSync(join(dist, "index.html"), "utf8");
/* </script> が JS の中にあっても HTML が壊れないようにする */
const safe = s => s.replace(/<\/script/gi, "<\\/script");
html = html.replace(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g,
  (_, src) => `<script type="module">${safe(readFileSync(join(dist, src), "utf8"))}</script>`);
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g,
  (_, href) => `<style>${readFileSync(join(dist, href), "utf8")}</style>`);
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error("埋め込めなかったファイルがある");
mkdirSync(join(root, "dist-single"), { recursive: true });
writeFileSync(join(root, "dist-single", "index.html"), html);
/* 公開版からダウンロードできるように dist にも置く */
writeFileSync(join(dist, "ticket-builder.html"), html);
console.log("dist-single/index.html", Math.round(html.length / 1024) + " KB");
