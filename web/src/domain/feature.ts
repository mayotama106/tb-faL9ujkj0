/* チケットの切り分け。フィーチャーを実装するのに必要なチケットを、漏れなくダブりなく(MECE)洗い出し、実施状況を追う。

   洗い出しの木:
     起点(画面、または画面を介さないもの: バッチ・外部からの呼び出し・その他)
       └ イベント(画面以外は、実行のきっかけ・呼び出し)
           ├ チェック / ロジック(どの開発領域で実装するか、エラーハンドリングの有無)
           └ チケット: 開発領域(CLIENT / BFF / BE / エラーハンドリング)ごとに1つ
   イベントを足すと、開発領域のチケットが自動でそろう(画面以外は BE とエラーハンドリングだけ)。
   1つのイベントの1つの開発領域が1チケットなので、ダブりは起きない。
   チェック・ロジックは選んだ開発領域のチケットに、エラーハンドリングありのものはエラーハンドリングのチケットにも入る */
import { COMPONENTS, newBlock } from "./components";
import { MISSING } from "./genres";
import type { Block, Ticket, Values } from "./ticket";

export type EntryKind = "screen" | "batch" | "api" | "other";
export type Layer = "client" | "bff" | "be" | "err";
export type Status = "未着手" | "進行中" | "レビュー中" | "完了";

export interface FItem { _k: string; kind: "check" | "logic"; name: string; layer: Exclude<Layer, "err">; err?: "" | "あり" | "なし"; errNote?: string }
export interface FCell { on: boolean; title?: string; status?: Status; docId?: string }
/* split: CLIENT と BFF を別のチケットにする(既定はまとめて1チケット) */
export interface FEvent { _k: string; name: string; items: FItem[]; cells: Record<Layer, FCell>; split?: boolean }
export interface FEntry { _k: string; kind: EntryKind; name: string; events: FEvent[] }
export interface Feature { id: string; name: string; goal?: string; entries: FEntry[]; createdAt: number; updatedAt: number }

export const ENTRY_KINDS: Record<EntryKind, { name: string; event: string; ph: string; eventPh: string; first: string }> = {
  screen: { name: "画面", event: "イベント", ph: "例: 書類提出", eventPh: "例: 保存ボタン押下", first: "初期表示" },
  batch: { name: "バッチ・定期実行", event: "実行のきっかけ", ph: "例: 審査ステータス更新バッチ", eventPh: "例: 毎日0時に起動", first: "" },
  api: { name: "外部からの呼び出し", event: "呼び出し", ph: "例: 審査システム連携", eventPh: "例: 審査結果の通知を受け取る", first: "" },
  other: { name: "その他", event: "きっかけ", ph: "例: 管理者の手動実行", eventPh: "例: 管理画面から再送を指示", first: "" }
};
export const LAYERS: Record<Layer, string> = { client: "CLIENT", bff: "BFF", be: "BE", err: "エラーハンドリング" };
export const LAYER_KEYS = Object.keys(LAYERS) as Layer[];
export const STATUSES: Status[] = ["未着手", "進行中", "レビュー中", "完了"];
export const ITEM_KINDS = { check: "チェック", logic: "ロジック" } as const;

/* CLIENT と BFF はまとめることが多い。まとめるときは client のマスを「CLIENT・BFF」のチケットとして使う */
export const FRONT = "CLIENT・BFF";
export const layersOf = (ev: FEvent): Layer[] => (ev.split ? LAYER_KEYS : LAYER_KEYS.filter(l => l !== "bff"));
export const layerName = (ev: FEvent, l: Layer) => (!ev.split && l === "client" ? FRONT : LAYERS[l]);
export const itemLayer = (ev: FEvent, it: FItem): Layer => (!ev.split && it.layer === "bff" ? "client" : it.layer);

const t = (s: unknown) => (typeof s === "string" ? s : "").trim();
export const entryLabel = (e: FEntry) => (t(e.name) || MISSING) + (e.kind === "screen" ? "画面" : "");

/* 画面はすべての開発領域、画面以外は BE とエラーハンドリングだけ */
export function defaultCells(kind: EntryKind): Record<Layer, FCell> {
  const on = (l: Layer) => kind === "screen" || l === "be" || l === "err";
  return Object.fromEntries(LAYER_KEYS.map(l => [l, { on: on(l), status: "未着手" as Status }])) as Record<Layer, FCell>;
}
export const newEvent = (kind: EntryKind, name: string, key: () => string): FEvent => ({ _k: key(), name, items: [], cells: defaultCells(kind) });
/* 起点を足すときは、イベントも1つ足す(画面は「初期表示」) */
export const newEntry = (kind: EntryKind, key: () => string): FEntry => ({ _k: key(), kind, name: "", events: [newEvent(kind, ENTRY_KINDS[kind].first, key)] });
export const newItem = (kind: FItem["kind"], key: () => string): FItem => ({ _k: key(), kind, name: "", layer: kind === "check" ? "bff" : "be", err: "" });

/* チケット(オンの開発領域)の一覧 */
export interface FTicket {
  entry: FEntry; event: FEvent; layer: Layer; lname: string; cell: FCell; title: string; items: FItem[];
  path: (string | number)[];   /* フィーチャーの中のマスの位置 */
}
export function defaultTitle(e: FEntry, ev: FEvent, l: Layer) {
  return entryLabel(e) + " " + (t(ev.name) || MISSING) + "(" + layerName(ev, l) + ")";
}
export function itemsOf(ev: FEvent, l: Layer): FItem[] {
  return l === "err" ? ev.items.filter(it => it.err === "あり") : ev.items.filter(it => itemLayer(ev, it) === l);
}
export function ticketsOf(f: Feature): FTicket[] {
  return f.entries.flatMap((e, i) => e.events.flatMap((ev, j) => layersOf(ev).filter(l => ev.cells[l]?.on).map(l => ({
    entry: e, event: ev, layer: l, lname: layerName(ev, l), cell: ev.cells[l], title: t(ev.cells[l].title) || defaultTitle(e, ev, l),
    items: itemsOf(ev, l), path: ["entries", i, "events", j, "cells", l]
  }))));
}
/* チケットが、フィーチャーのどの部分か(起点 / イベント / 開発領域) */
export const partOf = (tk: FTicket) => entryLabel(tk.entry) + " / " + (t(tk.event.name) || MISSING) + " / " + tk.lname;
/* 実装チケットから、つながっている切り分けのチケットを指す(並べ替えてもずれないように、位置ではなく鍵で持つ) */
export interface FeatRef { featureId: string; entry: string; event: string; layer: Layer }
export const refOf = (f: Feature, tk: FTicket): FeatRef => ({ featureId: f.id, entry: tk.entry._k, event: tk.event._k, layer: tk.layer });
export const sameRef = (a: FeatRef | undefined, b: FeatRef) =>
  !!a && a.featureId === b.featureId && a.entry === b.entry && a.event === b.event && a.layer === b.layer;
export function allTickets(features: Feature[]): { f: Feature; tk: FTicket; label: string }[] {
  return features.flatMap(f => ticketsOf(f).map(tk => ({ f, tk, label: (t(f.name) || MISSING) + " › " + partOf(tk) })));
}
/* チケットの内容(Excelの「内容」とプレビュー) */
export function contentOf(tk: FTicket): string[] {
  return tk.items.map(it => tk.layer === "err"
    ? (t(it.name) || MISSING) + (t(it.errNote) ? ": " + t(it.errNote) : "")
    : ITEM_KINDS[it.kind] + ": " + (t(it.name) || MISSING));
}

/* 確認事項(漏れ・決まっていないこと)。part は直すパート */
export interface Issue { part: "parts" | "split"; text: string }
export function issuesOf(f: Feature): Issue[] {
  const out: Issue[] = [];
  if (!t(f.name)) out.push({ part: "parts", text: "フィーチャーの名前が未記入" });
  if (!f.entries.length) out.push({ part: "parts", text: "起点(画面など)が1つもない" });
  f.entries.forEach(e => {
    const k = ENTRY_KINDS[e.kind];
    if (!t(e.name)) out.push({ part: "parts", text: k.name + "の名前が未記入" });
    if (!e.events.length) out.push({ part: "parts", text: entryLabel(e) + "に" + k.event + "が1つもない" });
    e.events.forEach(ev => {
      const where = entryLabel(e) + " / " + (t(ev.name) || MISSING);
      if (!t(ev.name)) out.push({ part: "parts", text: entryLabel(e) + "の" + k.event + "の名前が未記入" });
      ev.items.forEach(it => {
        const name = where + " / " + (t(it.name) || MISSING);
        if (!t(it.name)) out.push({ part: "parts", text: where + "の" + ITEM_KINDS[it.kind] + "の名前が未記入" });
        if (!it.err) out.push({ part: "parts", text: name + "のエラーハンドリングの有無が未定" });
        const l = layerName(ev, itemLayer(ev, it));
        if (!ev.cells[itemLayer(ev, it)]?.on) out.push({ part: "split", text: name + "は" + l + "で実装するが、" + l + "のチケットがない" });
        if (it.err === "あり" && !ev.cells.err?.on) out.push({ part: "split", text: name + "はエラーハンドリングありだが、エラーハンドリングのチケットがない" });
      });
      if (!layersOf(ev).some(l => ev.cells[l]?.on)) out.push({ part: "split", text: where + "のチケットが1つもない" });
    });
  });
  return out;
}

/* 実施状況の集計 */
export function statusCount(tks: FTicket[]): Record<Status, number> {
  const c = Object.fromEntries(STATUSES.map(s => [s, 0])) as Record<Status, number>;
  tks.forEach(tk => { c[tk.cell.status || "未着手"]++; });
  return c;
}

/* チケットから、チケットビルダーの実装チケットの入力値を作る。チェック・ロジックを部品にして入れておく */
export function docValues(f: Feature, tk: FTicket, key: () => string): Values {
  const steps: Values[] = [];
  let checks: Values | null = null;
  tk.items.forEach(it => {
    if (tk.layer === "err") {
      steps.push({ ...newBlock(COMPONENTS.error, key), when: (t(it.name) || MISSING) + (t(it.errNote) ? "(" + t(it.errNote) + ")" : "") + "の場合", err: {} });
    } else if (it.kind === "check") {
      if (!checks) { checks = { ...newBlock(COMPONENTS.check, key), name: t(tk.event.name) + "のチェック", items: [] }; steps.push(checks); }
      (checks.items as Values[]).push({ _k: key(), name: t(it.name), detail: "", err: {} });
    } else {
      steps.push({ ...newBlock(COMPONENTS.do, key), name: t(it.name) });
    }
  });
  const blocks: Values[] = [];
  if (tk.layer === "client" && tk.entry.kind === "screen")
    blocks.push({ ...newBlock(COMPONENTS.screen, key), name: t(tk.entry.name), events: [{ _k: key(), name: t(tk.event.name), steps }] });
  return {
    _impl: 1, title: tk.title, story_goal: t(f.goal),
    feat_name: t(f.name), feat_part: partOf(tk), feat_ref: refOf(f, tk),
    scope_in: tk.items.map(it => t(it.name)).filter(Boolean), scope_out: [],
    proc_name: blocks.length || !steps.length ? "" : t(tk.event.name), blocks: blocks.length ? blocks : steps
  };
}

/* 切り分けの結果(プレビューに出す本文)。確認事項の件数を未記入として数える */
export function buildFeature(f: Feature, docMissing: (id: string) => number | null = () => null): Ticket {
  const bullet = (d: number, s: string) => " ".repeat(3 * d) + "* " + s;
  const issues = issuesOf(f);
  const tks = ticketsOf(f);
  const c = statusCount(tks);
  const blocks: Block[] = [];
  const tree: string[] = ["## " + (t(f.name) || MISSING), "", "チケット " + tks.length + " 件(" + STATUSES.map(s => s + " " + c[s]).join("・") + ")", "", "## 洗い出し", ""];
  if (!f.entries.length) tree.push(bullet(0, MISSING));
  f.entries.forEach(e => {
    const k = ENTRY_KINDS[e.kind];
    tree.push(bullet(0, (e.kind === "screen" ? "" : "[" + k.name + "] ") + entryLabel(e)));
    e.events.forEach(ev => {
      tree.push(bullet(1, k.event + ": " + (t(ev.name) || MISSING)));
      ev.items.forEach(it => tree.push(bullet(2, ITEM_KINDS[it.kind] + ": " + (t(it.name) || MISSING) +
        "(" + layerName(ev, itemLayer(ev, it)) + "・エラーハンドリング: " + (it.err || "未定") + ")")));
    });
  });
  blocks.push({ key: "parts", missing: issues.filter(i => i.part === "parts").length, lines: tree });
  const sp: string[] = ["", "## チケット", ""];
  if (!tks.length) sp.push(MISSING);
  tks.forEach((tk, i) => {
    const m = tk.cell.docId ? docMissing(tk.cell.docId) : null;
    sp.push((i + 1) + ". [" + (tk.cell.status || "未着手") + "] " + tk.title + (tk.cell.docId && m != null ? "(ビルダー: " + (m ? "未記入 " + m : "記入済み") + ")" : ""));
    contentOf(tk).forEach(x => sp.push(bullet(1, x)));
  });
  if (issues.length) sp.push("", "### 確認事項", "", ...issues.map(i => bullet(0, i.text)));
  blocks.push({ key: "split", missing: issues.filter(i => i.part === "split").length, lines: sp });
  return { text: blocks.flatMap(b => b.lines).join("\n"), missing: issues.length, blocks };
}

/* Excelの表(1行目が見出し、1チケット1行) */
export const EXCEL_HEADER = ["No", "フィーチャー", "起点の種類", "起点", "イベント", "開発領域", "チケットタイトル", "内容(チェック・ロジック)", "実施状況"];
export function excelRows(features: Feature[]): string[][] {
  const rows: string[][] = [EXCEL_HEADER];
  features.forEach(f => ticketsOf(f).forEach(tk => rows.push([
    String(rows.length), t(f.name), ENTRY_KINDS[tk.entry.kind].name, entryLabel(tk.entry), t(tk.event.name),
    tk.lname, tk.title, contentOf(tk).join("\n"), tk.cell.status || "未着手"
  ])));
  return rows;
}

/* 前の形(チケット案を別に持ち、チェック・ロジックをチケットに割り当てる形)のフィーチャーを、今の形に移す */
export function migrateFeature(raw: unknown): Feature {
  const o = (raw || {}) as Values;
  const entries: FEntry[] = (Array.isArray(o.entries) ? o.entries : []).map((e: Values) => {
    const kind: EntryKind = ENTRY_KINDS[e.kind as EntryKind] ? e.kind : "other";
    return {
      _k: e._k || Math.random().toString(36).slice(2, 10), kind, name: t(e.name),
      events: (Array.isArray(e.events) ? e.events : []).map((ev: Values) => ({
        _k: ev._k || Math.random().toString(36).slice(2, 10), name: t(ev.name),
        cells: ev.cells && typeof ev.cells === "object" ? { ...defaultCells(kind), ...ev.cells } : defaultCells(kind), split: !!ev.split,
        items: (Array.isArray(ev.items) ? ev.items : []).map((it: Values) => ({
          _k: it._k || Math.random().toString(36).slice(2, 10), kind: it.kind === "check" ? "check" : "logic", name: t(it.name),
          layer: it.layer === "client" || it.layer === "bff" || it.layer === "be" ? it.layer : it.kind === "check" ? "bff" : "be",
          err: it.err === "あり" || it.err === "なし" ? it.err : "", errNote: t(it.errNote)
        }))
      }))
    };
  });
  return { id: o.id, name: t(o.name), goal: t(o.goal), entries, createdAt: o.createdAt || Date.now(), updatedAt: o.updatedAt || Date.now() };
}
