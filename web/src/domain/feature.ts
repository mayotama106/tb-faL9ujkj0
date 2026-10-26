/* チケットの切り分け。フィーチャーを実装するのに必要なチケットを、漏れなくダブりなく(MECE)洗い出し、実施状況を追う。

   洗い出しの木:
     画面・処理(画面、または画面を介さないもの: バッチ・外部からの呼び出し・その他)
       └ イベント(画面以外は、実行のきっかけ・呼び出し)
           └ チェック / ロジック(CLIENT・BFF か BE か、エラーハンドリングの有無)
   チケット(イベントごと):
     CLIENT・BFF 1枚(画面のイベントだけ。CLIENT・BFF のチェック・ロジックをまとめる)
     BE チェック・ロジック1つにつき1枚
     エラーハンドリング 1枚(エラーハンドリングありのチェック・ロジックをまとめる)
   ほかに、フィーチャー全体のST 1枚 */
import { COMPONENTS, newBlock } from "./components";
import { MISSING } from "./genres";
import type { Block, Ticket, Values } from "./ticket";

export type EntryKind = "screen" | "batch" | "api" | "other";
/* チェック・ロジックを実装する開発領域。front は CLIENT・BFF */
export type Layer = "front" | "be";
export type Status = "未着手" | "進行中" | "レビュー中" | "完了";

export interface FCell { on: boolean; title?: string; status?: Status; docId?: string }
/* cell は BE のチェック・ロジックのチケット(BE は1つにつき1枚) */
export interface FItem { _k: string; kind: "check" | "logic"; name: string; layer: Layer; err?: "" | "あり" | "なし"; errNote?: string; cell?: FCell }
/* cells はイベントのチケット(CLIENT・BFF とエラーハンドリング) */
export interface FEvent { _k: string; name: string; items: FItem[]; cells?: { front?: FCell; err?: FCell } }
export interface FEntry { _k: string; kind: EntryKind; name: string; events: FEvent[] }
/* st はフィーチャー全体のSTチケット(切り分けの最後に1枚) */
export interface Feature { id: string; name: string; goal?: string; entries: FEntry[]; st?: FCell; createdAt: number; updatedAt: number }

export const ENTRY_KINDS: Record<EntryKind, { name: string; event: string; ph: string; eventPh: string; first: string }> = {
  screen: { name: "画面", event: "イベント", ph: "例: 書類提出", eventPh: "例: 保存ボタン押下", first: "初期表示" },
  batch: { name: "バッチ・定期実行", event: "実行のきっかけ", ph: "例: 審査ステータス更新バッチ", eventPh: "例: 毎日0時に起動", first: "" },
  api: { name: "外部からの呼び出し", event: "呼び出し", ph: "例: 審査システム連携", eventPh: "例: 審査結果の通知を受け取る", first: "" },
  other: { name: "その他", event: "きっかけ", ph: "例: 管理者の手動実行", eventPh: "例: 管理画面から再送を指示", first: "" }
};
export const FRONT = "CLIENT・BFF";
export const ERR = "エラーハンドリング";
export const LAYERS: Record<Layer, string> = { front: FRONT, be: "BE" };
export const LAYER_KEYS = Object.keys(LAYERS) as Layer[];
export const STATUSES: Status[] = ["未着手", "進行中", "レビュー中", "完了"];
export const ITEM_KINDS = { check: "チェック", logic: "ロジック" } as const;

const t = (s: unknown) => (typeof s === "string" ? s : "").trim();
/* 画面の名前。「住所変更」でも「住所変更画面」でも、「住所変更画面」と書く */
const screenBase = (name: string) => name.replace(/\s*画面$/, "");
export const entryLabel = (e: FEntry) => (e.kind === "screen" ? (screenBase(t(e.name)) || MISSING) + "画面" : t(e.name) || MISSING);

export const newCell = (): FCell => ({ on: true, status: "未着手" });
/* イベントには、CLIENT・BFF(画面のときだけ)とエラーハンドリングのチケットを付ける */
export const eventCells = (kind: EntryKind) => ({ ...(kind === "screen" ? { front: newCell() } : {}), err: newCell() });
export const newEvent = (kind: EntryKind, name: string, key: () => string): FEvent => ({ _k: key(), name, items: [], cells: eventCells(kind) });
/* 画面・処理を足すときは、イベントも1つ足す(画面は「初期表示」) */
export const newEntry = (kind: EntryKind, key: () => string): FEntry => ({ _k: key(), kind, name: "", events: [newEvent(kind, ENTRY_KINDS[kind].first, key)] });
/* 画面のチェックは CLIENT・BFF、それ以外は BE から始める(画面を介さない処理は BE だけ) */
export const newItem = (kind: FItem["kind"], key: () => string, entry: EntryKind = "screen"): FItem =>
  ({ _k: key(), kind, name: "", layer: kind === "check" && entry === "screen" ? "front" : "be", err: "", cell: newCell() });

/* チケットの一覧。kind: front は CLIENT・BFF、be は BE のチェック・ロジック1つ、err はエラーハンドリング */
export interface FTicket {
  kind: "front" | "be" | "err"; entry: FEntry; event: FEvent; item?: FItem; items: FItem[];
  lname: string; cell: FCell; title: string;
  path: (string | number)[];   /* フィーチャーの中の、このチケット(cell)の位置 */
}
const lnameOf = (k: FTicket["kind"]) => (k === "front" ? FRONT : k === "be" ? "BE" : ERR);
export function defaultTitle(e: FEntry, ev: FEvent, k: FTicket["kind"], it?: FItem) {
  return "【" + lnameOf(k) + "】" + entryLabel(e) + " " + (t(ev.name) || MISSING) + (k === "be" ? "：" + (t(it && it.name) || MISSING) : "");
}
export function ticketsOf(f: Feature): FTicket[] {
  return f.entries.flatMap((e, i) => e.events.flatMap((ev, j) => {
    const out: FTicket[] = [];
    const at = (...p: (string | number)[]) => ["entries", i, "events", j, ...p];
    const front = e.kind === "screen" && ev.cells && ev.cells.front;
    if (front && front.on)
      out.push({ kind: "front", entry: e, event: ev, items: ev.items.filter(it => it.layer === "front"), lname: FRONT, cell: front,
        title: t(front.title) || defaultTitle(e, ev, "front"), path: at("cells", "front") });
    ev.items.forEach((it, n) => {
      if ((it.layer === "be" || e.kind !== "screen") && it.cell && it.cell.on)
        out.push({ kind: "be", entry: e, event: ev, item: it, items: [it], lname: "BE", cell: it.cell,
          title: t(it.cell.title) || defaultTitle(e, ev, "be", it), path: at("items", n, "cell") });
    });
    const err = ev.cells && ev.cells.err;
    if (err && err.on)
      out.push({ kind: "err", entry: e, event: ev, items: ev.items.filter(it => it.err === "あり"), lname: ERR, cell: err,
        title: t(err.title) || defaultTitle(e, ev, "err"), path: at("cells", "err") });
    return out;
  }));
}
/* チケットが、フィーチャーのどの部分か(画面・処理 / イベント / [BEはチェック・ロジック /] 開発領域) */
export const partOf = (tk: FTicket) => entryLabel(tk.entry) + " / " + (t(tk.event.name) || MISSING) + " / " +
  (tk.kind === "be" ? (t(tk.item!.name) || MISSING) + " / " : "") + tk.lname;
/* 実装チケットから、つながっている切り分けのチケットを指す(並べ替えてもずれないように、位置ではなく鍵で持つ) */
export interface FeatRef { featureId: string; entry: string; event: string; layer: string; item?: string }
export const refOf = (f: Feature, tk: FTicket): FeatRef => ({ featureId: f.id, entry: tk.entry._k, event: tk.event._k, layer: tk.kind, ...(tk.kind === "be" ? { item: tk.item!._k } : {}) });
export const sameRef = (a: FeatRef | undefined, b: FeatRef) =>
  !!a && a.featureId === b.featureId && a.entry === b.entry && a.event === b.event && a.layer === b.layer && (a.item || "") === (b.item || "");
/* フィーチャー全体のSTチケット */
export const ST_PART = "フィーチャー全体 / ST";
export const stTitle = (f: Feature) => "【ST】" + (t(f.name) || MISSING) + "のST実施";
export const stRef = (f: Feature): FeatRef => ({ featureId: f.id, entry: "", event: "", layer: "st" });
export const newStCell = newCell;
/* フィーチャーの中のチケットの枠をすべて(外したものも含む)。受け渡しでチケット本文のつながりを辿るときに使う */
export const allCells = (f: Feature): FCell[] => f.entries.flatMap(e => e.events.flatMap(ev =>
  [ev.cells && ev.cells.front, ev.cells && ev.cells.err, ...ev.items.map(it => it.cell)].filter((c): c is FCell => !!c))).concat(f.st ? [f.st] : []);
/* 実施状況を数えるチケット(開発のチケットと、フィーチャー全体のST) */
export const cellsOf = (f: Feature): FCell[] => ticketsOf(f).map(tk => tk.cell).concat(f.st && f.st.on ? [f.st] : []);

/* チケット本文から選ぶ、切り分けのチケット。impl は開発のチケット、st はフィーチャー全体のST */
export interface PickOption { f: Feature; ref: FeatRef; label: string; name: string; part: string; title: string; cell: FCell }
export function pickOptions(features: Feature[], kind: "impl" | "st"): PickOption[] {
  return features.flatMap(f => kind === "st"
    ? (f.st && f.st.on ? [{ f, ref: stRef(f), label: (t(f.name) || MISSING) + " › ST", name: t(f.name), part: ST_PART, title: t(f.st.title) || stTitle(f), cell: f.st }] : [])
    : ticketsOf(f).map(tk => ({ f, ref: refOf(f, tk), label: (t(f.name) || MISSING) + " › " + partOf(tk), name: t(f.name), part: partOf(tk), title: tk.title, cell: tk.cell })));
}
/* STチケットの入力値。内容には、フィーチャーの画面・処理とイベントを並べておく */
export function stValues(f: Feature): Values {
  return {
    title: t(f.st && f.st.title) || stTitle(f), feat_title: t(f.st && f.st.title) || stTitle(f), feat_name: t(f.name), feat_part: ST_PART, feat_ref: stRef(f),
    content: f.entries.map(e => entryLabel(e) + "（" + e.events.map(ev => t(ev.name) || MISSING).join("、") + "）").join("\n")
  };
}
/* チケットの内容(Excelの「内容」とプレビュー) */
export function contentOf(tk: FTicket): string[] {
  return tk.items.map(it => tk.kind === "err"
    ? (t(it.name) || MISSING) + (tk.entry.kind === "screen" ? "（" + LAYERS[it.layer] + "）" : "") + (t(it.errNote) ? "：" + t(it.errNote) : "")
    : ITEM_KINDS[it.kind] + "：" + (t(it.name) || MISSING));
}

/* 確認事項(漏れ・決まっていないこと)。part は直すパート */
export interface Issue { part: "parts" | "split"; text: string }
export function issuesOf(f: Feature): Issue[] {
  const out: Issue[] = [];
  if (!t(f.name)) out.push({ part: "parts", text: "フィーチャーの名前が未記入" });
  if (!f.entries.length) out.push({ part: "parts", text: "画面・処理が1つもない" });
  f.entries.forEach(e => {
    const k = ENTRY_KINDS[e.kind];
    if (!t(e.name)) out.push({ part: "parts", text: k.name + "の名前が未記入" });
    if (!e.events.length) out.push({ part: "parts", text: entryLabel(e) + "に" + k.event + "が1つもない" });
    e.events.forEach(ev => {
      const where = entryLabel(e) + " / " + (t(ev.name) || MISSING);
      if (!t(ev.name)) out.push({ part: "parts", text: entryLabel(e) + "の" + k.event + "の名前が未記入" });
      ev.items.forEach(it => {
        const name = "「" + (t(it.name) || MISSING) + "」（" + where + "）";
        if (!t(it.name)) out.push({ part: "parts", text: where + "の" + ITEM_KINDS[it.kind] + "の名前が未記入" });
        if (!it.err) out.push({ part: "parts", text: name + "：エラーハンドリングの有無が未定" });
        if (e.kind === "screen" && it.layer === "front" && !(ev.cells && ev.cells.front && ev.cells.front.on))
          out.push({ part: "split", text: name + "：" + FRONT + "で実装するが、" + FRONT + "のチケットがない" });
        if (it.err === "あり" && !(ev.cells && ev.cells.err && ev.cells.err.on))
          out.push({ part: "split", text: name + "：エラーハンドリングありだが、エラーハンドリングのチケットがない" });
      });
    });
  });
  return out;
}

/* 実施状況の集計 */
export function statusCount(cells: FCell[]): Record<Status, number> {
  const c = Object.fromEntries(STATUSES.map(s => [s, 0])) as Record<Status, number>;
  cells.forEach(cell => { c[cell.status || "未着手"]++; });
  return c;
}

/* チケットから、チケットビルダーの実装チケットの入力値を作る。チェック・ロジックを部品にして入れておく。
   CLIENT・BFF は画面作成の部品のイベント(初期表示なら初期表示)に入れる。BE はそのチェック・ロジック1つ。
   エラーハンドリングは、ありのものを1つずつエラーハンドリングの部品にする */
export function docValues(f: Feature, tk: FTicket, key: () => string): Values {
  const steps: Values[] = [];
  let checks: Values | null = null;
  tk.items.forEach(it => {
    if (tk.kind === "err") {
      steps.push({ ...newBlock(COMPONENTS.error, key), when: errWhen(it), err: {} });
    } else if (it.kind === "check") {
      if (!checks) { checks = { ...newBlock(COMPONENTS.check, key), name: "", items: [] }; steps.push(checks); }
      (checks.items as Values[]).push({ _k: key(), name: t(it.name), detail: "", err: {} });
    } else {
      steps.push({ ...newBlock(COMPONENTS[compOf(t(it.name))], key), name: t(it.name) });
    }
  });
  /* チェックが1つならその名前を、複数なら「〇〇時のチェック」をチェック群の名前にする */
  if (checks) {
    const c = checks as Values, items = c.items as Values[];
    c.name = items.length === 1 ? items[0].name : (t(tk.event.name) || MISSING) + "時のチェック";
  }
  const base = { _impl: 1, title: tk.title, feat_title: tk.title, story_goal: t(f.goal), feat_name: t(f.name), feat_part: partOf(tk), feat_ref: refOf(f, tk) };
  /* 画面の CLIENT・BFF は画面作成の部品に入れる。画面全体の仕様は最初のイベントのチケットで書き、ほかのイベントでは任意にする */
  if (tk.kind === "front" && tk.entry.kind === "screen") {
    const first = tk.entry.events[0] === tk.event;
    const init = t(tk.event.name) === ENTRY_KINDS.screen.first;
    return { ...base, proc_name: "", blocks: [{ ...newBlock(COMPONENTS.screen, key), name: screenBase(t(tk.entry.name)),
      ...(init ? { init: steps, events: [], only_init: true } : { only_events: !first, events: [{ _k: key(), name: t(tk.event.name), trig: trigOf(t(tk.event.name)), steps }] }) }] };
  }
  return { ...base, proc_name: t(tk.event.name), blocks: steps };
}

/* エラーハンドリングのチケットの「どんな場合？」。理由があれば「理由場合（チェック名）」、なければ「チェック名でエラーになる場合」 */
export function errWhen(it: FItem): string {
  const name = t(it.name) || MISSING, note = t(it.errNote).replace(/[。．]$/, "");
  if (!note) return name + "でエラーになる場合";
  return (/(場合|とき|時)$/.test(note) ? note : note + "場合") + "（" + name + "）";
}
/* イベントのきっかけ。イベント名から決める(〇〇ボタン押下 → クリック、初期表示 → 画面の表示) */
export function trigOf(ev: string): string {
  if (/押下|クリック|タップ/.test(ev)) return "クリック";
  if (/初期表示|表示/.test(ev)) return "画面の表示";
  if (/入力/.test(ev)) return "入力";
  if (/選択/.test(ev)) return "選択";
  return ev;
}

/* ロジックの名前から部品を選ぶ(住所を更新 → 更新 など)。当てはまらなければ処理実行 */
export function compOf(name: string): string {
  if (/削除/.test(name)) return "delete";
  if (/更新|変更/.test(name)) return "update";
  if (/登録|作成|追加|保存/.test(name)) return "create";
  if (/取得|検索|参照|読み込/.test(name)) return "get";
  return "do";
}

/* 切り分けの結果(プレビューに出す本文)。確認事項の件数を未記入として数える */
export function buildFeature(f: Feature, docMissing: (id: string) => number | null = () => null): Ticket {
  const bullet = (d: number, s: string) => " ".repeat(3 * d) + "* " + s;
  const issues = issuesOf(f);
  const tks = ticketsOf(f);
  const cells = cellsOf(f);
  const c = statusCount(cells);
  const blocks: Block[] = [];
  const tree: string[] = ["## " + (t(f.name) || MISSING), "", "チケット" + cells.length + "件（" + STATUSES.map(s => s + c[s]).join("・") + "）", "", "## 洗い出し", ""];
  if (!f.entries.length) tree.push(bullet(0, MISSING));
  f.entries.forEach(e => {
    const k = ENTRY_KINDS[e.kind];
    tree.push(bullet(0, (e.kind === "screen" ? "" : "［" + k.name + "］") + entryLabel(e)));
    e.events.forEach(ev => {
      tree.push(bullet(1, k.event + "：" + (t(ev.name) || MISSING)));
      /* 開発領域とエラーハンドリングは［ ］にまとめ、「／」で区切る(名前の括弧や CLIENT・BFF の「・」とぶつからないように) */
      ev.items.forEach(it => tree.push(bullet(2, ITEM_KINDS[it.kind] + "：" + (t(it.name) || MISSING) +
        "［" + (e.kind === "screen" ? LAYERS[it.layer] : "BE") + "／エラーハンドリング" + (it.err || "未定") + "］")));
    });
  });
  blocks.push({ key: "parts", missing: issues.filter(i => i.part === "parts").length, lines: tree });
  const sp: string[] = ["", "## チケット", ""];
  if (!tks.length) sp.push(bullet(0, MISSING));
  const line = (i: number, cell: FCell, title: string) => {
    const m = cell.docId ? docMissing(cell.docId) : null;
    return (i + 1) + ". ［" + (cell.status || "未着手") + "］" + title + (cell.docId && m != null ? "（チケット本文：" + (m ? "未記入" + m + "件" : "記入済み") + "）" : "");
  };
  tks.forEach((tk, i) => {
    sp.push(line(i, tk.cell, tk.title));
    contentOf(tk).forEach(x => sp.push(bullet(1, x)));
  });
  if (f.st && f.st.on) sp.push(line(tks.length, f.st, t(f.st.title) || stTitle(f)));
  if (issues.length) sp.push("", "### 確認事項", "", ...issues.map(i => bullet(0, i.text)));
  blocks.push({ key: "split", missing: issues.filter(i => i.part === "split").length, lines: sp });
  return { text: blocks.flatMap(b => b.lines).join("\n"), missing: issues.length, blocks };
}

/* Excelの表(1行目が見出し、1チケット1行) */
export const EXCEL_HEADER = ["No", "フィーチャー", "種類", "画面・処理名", "イベント", "開発領域", "チケットタイトル", "内容（チェック・ロジック）", "実施状況"];
export function excelRows(features: Feature[]): string[][] {
  const rows: string[][] = [EXCEL_HEADER];
  features.forEach(f => {
    ticketsOf(f).forEach(tk => rows.push([
      String(rows.length), t(f.name), ENTRY_KINDS[tk.entry.kind].name, entryLabel(tk.entry), t(tk.event.name),
      tk.lname, tk.title, contentOf(tk).join("\n"), tk.cell.status || "未着手"
    ]));
    if (f.st && f.st.on) rows.push([String(rows.length), t(f.name), "フィーチャー全体", "", "", "ST", t(f.st.title) || stTitle(f), "", f.st.status || "未着手"]);
  });
  return rows;
}

/* 前の形のフィーチャーを、今の形に移す。
   ・イベント×開発領域で1チケット(ev.cells の client・bff・be・err): CLIENT・BFF とエラーハンドリングはそのまま、BE はチェック・ロジックごとに分ける
   ・チェック・ロジックごとに1チケット(it.cell、画面の作成 e.cell): CLIENT・BFF のものはイベントの CLIENT・BFF にまとめる
   実施状況は引き継ぎ、チケット本文のつながりは1つにだけ移す */
export function migrateFeature(raw: unknown): Feature {
  const o = (raw || {}) as Values;
  const rnd = () => Math.random().toString(36).slice(2, 10);
  const cellOf = (c: Values | undefined, keepDoc = true): FCell => (c && typeof c === "object"
    ? { on: c.on !== false, status: STATUSES.includes(c.status) ? c.status : "未着手", ...(t(c.title) ? { title: t(c.title) } : {}), ...(keepDoc && c.docId ? { docId: c.docId } : {}) }
    : newCell());
  /* 欠けたデータ(null など)は読み飛ばす */
  const objs = (x: unknown): Values[] => (Array.isArray(x) ? x.filter(y => y && typeof y === "object") : []);
  const entries: FEntry[] = objs(o.entries).map((e: Values) => {
    const kind: EntryKind = ENTRY_KINDS[e.kind as EntryKind] ? e.kind : "other";
    const events: FEvent[] = objs(e.events).map((ev: Values) => {
      const oc: Values = ev.cells && typeof ev.cells === "object" ? ev.cells : {};
      const rawItems: Values[] = objs(ev.items);
      const layerOf = (it: Values): Layer => (kind !== "screen" ? "be" : it.layer === "be" ? "be" : it.layer === "front" || it.layer === "client" || it.layer === "bff" ? "front" : it.kind === "check" ? "front" : "be");
      let beDocUsed = false;
      const items: FItem[] = rawItems.map(it => {
        const layer = layerOf(it);
        let cell: FCell | undefined;
        if (it.cell) cell = cellOf(it.cell, layer === "be");
        else if (layer === "be") {
          /* イベント×開発領域の BE のチケットから、状況を引き継ぐ。チケット本文は最初のものにだけ */
          cell = cellOf(oc.be ? { ...oc.be, on: true, title: "" } : undefined, !beDocUsed);
          if (oc.be && oc.be.docId) beDocUsed = true;
        } else cell = newCell();
        return { _k: it._k || rnd(), kind: it.kind === "check" ? "check" : "logic", name: t(it.name), layer,
          err: it.err === "あり" || it.err === "なし" ? it.err : "", errNote: t(it.errNote), cell };
      });
      /* CLIENT・BFF: 前のイベントの client(または front)、なければ CLIENT・BFF のチェック・ロジックのチケットから */
      const firstFront = rawItems.find(it => it.cell && layerOf(it) === "front");
      const cells = {
        ...(kind === "screen" ? { front: cellOf(oc.front || oc.client || (firstFront && firstFront.cell)) } : {}),
        err: cellOf(oc.err)
      };
      return { _k: ev._k || rnd(), name: t(ev.name), items, cells };
    });
    return { _k: e._k || rnd(), kind, name: t(e.name), events };
  });
  const st: FCell = o.st && typeof o.st === "object" ? o.st : newStCell();
  return { id: o.id, name: t(o.name), goal: t(o.goal), entries, st, createdAt: o.createdAt || Date.now(), updatedAt: o.updatedAt || Date.now() };
}

/* 移し替えのあと、チケット本文の側の「つながり」(feat_ref)を今の形に合わせる */
export function relinkDocs(features: Feature[], docs: { id: string; v: Values }[]) {
  features.forEach(f => [...ticketsOf(f).map(tk => ({ docId: tk.cell.docId, ref: refOf(f, tk) })),
    ...(f.st && f.st.docId ? [{ docId: f.st.docId, ref: stRef(f) }] : [])].forEach(({ docId, ref }) => {
    const d = docId && docs.find(x => x.id === docId);
    if (d && !sameRef(d.v.feat_ref, ref)) d.v = { ...d.v, feat_ref: ref };
  }));
}
