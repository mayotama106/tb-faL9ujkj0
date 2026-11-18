/* ビルドした日時(vite.config.ts の define で入れる) */
declare const __BUILD__: string;
/* 配布するファイル(?inline でデータURLとして埋め込む。ローカル版でもダウンロードできるように) */
declare module "*.xlsx?inline" { const src: string; export default src; }
