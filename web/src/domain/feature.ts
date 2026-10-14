/* フィーチャーの分解。フィーチャーを実装するのに必要なチケットを、漏れなくダブりなく(MECE)切り分ける。

   構成要素の木:
     起点(画面、または画面を介さないもの: バッチ・外部からの呼び出し・その他)
       └ イベント(画面以外は、実行のきっかけ・呼び出し)
           └ チェック / ロジック
               └ エラーハンドリング(あり・なし)
   チケットに割り当てる単位は「画面の表示」(画面1つにつき1つ)と「チェック・ロジック」(1つずつ)。
   単位は1つのチケットにだけ割り当てる(選択式なので重複は起きない)。未割当と空のチケットを警告する */
import { COMPONENTS, newBlock } from "./components";
import { MISSING } from "./genres";
import type { Block, Ticket, Values } from "./ticket";

export interface FItem { _k: string; kind: "check" | "logic"; name: string; err?: "" | "あり" | "なし"; errNote?: string; ticket?: string }
export interface FEvent { _k: string; name: string; items: FItem[] }
export interface FEntry { _k: string; kind: EntryKind; name: string; screenTicket?: string; events: FEvent[] }
export interface FTicket { id: string; title: string; kind: "impl" | "st"; docId?: string }
export interface Feature {
  id: string; name: string; goal: string; scope_in: string[]; scope_out: string[];
  entries: FEntry[]; tickets: FTicket[]; createdAt: number; updatedAt: number;
}

export type EntryKind = "screen" | "batch" | "api" | "other";
export const ENTRY_KINDS: Record<EntryKind, { name: string; event: string; ph: string; eventPh: string }> = {
  screen: { name: "画面", event: "イベント", ph: "例: 書類提出", eventPh: "例: 保存ボタン押下" },
  batch: { name: "バッチ・定期実行", event: "実行のきっかけ", ph: "例: 審査ステータス更新バッチ", eventPh: "例: 毎日0時に起動" },
  api: { name: "外部からの呼び出し", event: "呼び出し", ph: "例: 審査システム連携", eventPh: "例: 審査結果の通知を受け取る" },
  other: { name: "その他", event: "きっかけ", ph: "例: 管理者の手動実行", eventPh: "例: 管理画面から再送を指示" }
};
export const ITEM_KINDS = { check: "チェック", logic: "ロジック" } as const;

const t = (s: unknown) => (typeof s === "string" ? s : "").trim();
const entryLabel = (e: FEntry) => (t(e.name) || MISSING) + (e.kind === "screen" ? "画面" : "");

/* 割り当ての単位 */
export interface Unit { key: string; label: string; ticket: string; path: (string | number)[]; event?: string }
export function unitsOf(f: Feature): Unit[] {
  const out: Unit[] = [];
  f.entries.forEach((e, i) => {
    if (e.kind === "screen")
      out.push({ key: e._k + ":screen", label: entryLabel(e) + "の表示", ticket: e.screenTicket || "", path: ["entries", i, "screenTicket"] });
    e.events.forEach((ev, j) => ev.items.forEach((it, k) => out.push({
      key: it._k, label: entryLabel(e) + " / " + (t(ev.name) || MISSING) + " / " + ITEM_KINDS[it.kind] + ": " + (t(it.name) || MISSING),
      ticket: it.ticket || "", path: ["entries", i, "events", j, "items", k, "ticket"], event: ev._k
    })));
  });
  return out;
}

/* 確認事項(漏れ・ダブり・決まっていないこと)。part は直すパート */
export interface Issue { part: "basic" | "parts" | "split"; text: string }
export function issuesOf(f: Feature): Issue[] {
  const out: Issue[] = [];
  if (!t(f.name)) out.push({ part: "basic", text: "フィーチャーの名前が未記入" });
  if (!t(f.goal)) out.push({ part: "basic", text: "目的が未記入" });
  if (!f.entries.length) out.push({ part: "parts", text: "起点(画面など)が1つもない" });
  f.entries.forEach(e => {
    const k = ENTRY_KINDS[e.kind];
    if (!t(e.name)) out.push({ part: "parts", text: k.name + "の名前が未記入" });
    if (!e.events.length) out.push({ part: "parts", text: entryLabel(e) + "に" + k.event + "が1つもない" });
    e.events.forEach(ev => {
      const where = entryLabel(e) + " / " + (t(ev.name) || MISSING);
      if (!t(ev.name)) out.push({ part: "parts", text: entryLabel(e) + "の" + k.event + "の名前が未記入" });
      if (!ev.items.length) out.push({ part: "parts", text: where + "にチェック・ロジックが1つもない" });
      ev.items.forEach(it => {
        if (!t(it.name)) out.push({ part: "parts", text: where + "の" + ITEM_KINDS[it.kind] + "の名前が未記入" });
        if (!it.err) out.push({ part: "parts", text: where + " / " + (t(it.name) || MISSING) + "のエラーハンドリングの有無が未定" });
      });
    });
  });
  const ids = new Set(f.tickets.map(x => x.id));
  const units = unitsOf(f);
  units.filter(u => !u.ticket || !ids.has(u.ticket)).forEach(u => out.push({ part: "split", text: "チケットに未割当: " + u.label }));
  f.tickets.forEach(tk => {
    if (!t(tk.title)) out.push({ part: "split", text: "チケットのタイトルが未記入" });
    if (tk.kind === "impl" && !units.some(u => u.ticket === tk.id)) out.push({ part: "split", text: "中身のないチケット: " + (t(tk.title) || MISSING) });
  });
  return out;
}

/* まだ割り当てのない単位から、チケット案を作る。画面の表示は画面ごと、チェック・ロジックはイベントごとにまとめる。
   STチケットがなければ1つ足す。既に割り当てた単位とチケットは変えない */
export function planTickets(f: Feature, key: () => string): Feature {
  const n: Feature = JSON.parse(JSON.stringify(f));
  const ids = new Set(n.tickets.map(x => x.id));
  const add = (title: string, kind: FTicket["kind"]) => { const tk = { id: key(), title, kind }; n.tickets.push(tk); ids.add(tk.id); return tk.id; };
  n.entries.forEach(e => {
    if (e.kind === "screen" && !(e.screenTicket && ids.has(e.screenTicket))) e.screenTicket = add(entryLabel(e) + "の作成", "impl");
    e.events.forEach(ev => {
      const free = ev.items.filter(it => !(it.ticket && ids.has(it.ticket)));
      if (!free.length) return;
      const id = add(entryLabel(e) + " " + (t(ev.name) || MISSING) + "の処理", "impl");
      free.forEach(it => { it.ticket = id; });
    });
  });
  if (!n.tickets.some(x => x.kind === "st")) add((t(n.name) || MISSING) + "のST", "st");
  return n;
}

/* チケット案から、チケットビルダーの入力値を作る。割り当てた構成要素を、スコープ内と組み立ての部品にする */
export function docValues(f: Feature, tk: FTicket, key: () => string): Values {
  if (tk.kind === "st") return {
    title: tk.title, content: (t(f.name) || MISSING) + "の総合テスト(ST)を実施する",
    steps: ["st_case", "st_account", "st_exec"].map(x => newBlock(COMPONENTS[x], key))
  };
  const units = unitsOf(f).filter(u => u.ticket === tk.id);
  const blocks: Values[] = [];
  const steps: Values[] = [];
  f.entries.forEach(e => {
    if (e.kind === "screen" && e.screenTicket === tk.id)
      blocks.push({ ...newBlock(COMPONENTS.screen, key), name: t(e.name), events: e.events.map(ev => ({ _k: key(), name: t(ev.name), steps: [] })) });
    const evs = e.events.filter(ev => ev.items.some(it => it.ticket === tk.id));
    evs.forEach(ev => {
      const inner: Values[] = [];
      let checks: Values | null = null;
      ev.items.filter(it => it.ticket === tk.id).forEach(it => {
        if (it.kind === "check") {
          if (!checks) { checks = { ...newBlock(COMPONENTS.check, key), name: t(ev.name) + "のチェック", items: [] }; inner.push(checks); }
          (checks.items as Values[]).push({ _k: key(), name: t(it.name), detail: t(it.errNote), err: {} });
        } else {
          const kids = it.err === "あり" ? [{ ...newBlock(COMPONENTS.error, key), when: t(it.errNote) || t(it.name) + "に失敗した場合", err: {} }] : [];
          inner.push({ ...newBlock(COMPONENTS.do, key), name: t(it.name), kids });
        }
      });
      /* イベントが複数なら、イベントごとに処理実行でまとめる */
      steps.push({ ev, inner });
    });
  });
  const flat = steps.length === 1 ? (steps[0].inner as Values[])
    : steps.map(s => ({ ...newBlock(COMPONENTS.do, key), name: t((s.ev as FEvent).name), kids: s.inner }));
  const procName = steps.length === 1 ? t((steps[0].ev as FEvent).name) : t(f.name);
  return {
    _impl: 1, title: tk.title, story_goal: t(f.goal),
    scope_in: units.map(u => u.label), scope_out: [],
    proc_name: flat.length ? procName : "", blocks: blocks.concat(flat)
  };
}

/* 分解の結果(プレビューに出す本文)。パートごとのブロックに分け、確認事項の件数を未記入として数える */
export function buildFeature(f: Feature, docMissing: (id: string) => number | null = () => null): Ticket {
  const bullet = (d: number, s: string) => " ".repeat(3 * d) + "* " + s;
  const issues = issuesOf(f);
  const count = (p: Issue["part"]) => issues.filter(i => i.part === p).length;
  const blocks: Block[] = [];
  const list = (xs: string[]) => (xs.map(x => t(x)).filter(Boolean).length ? xs.map(x => t(x)).filter(Boolean).map(x => bullet(0, x)) : [bullet(0, MISSING)]);
  blocks.push({ key: "basic", missing: count("basic"), lines: [
    "## フィーチャー: " + (t(f.name) || MISSING), "", bullet(0, t(f.goal) || MISSING),
    "", "### スコープ内", "", ...list(f.scope_in), "", "### スコープ外", "", ...list(f.scope_out.length ? f.scope_out : ["なし"])
  ] });
  const tree: string[] = ["", "## 構成要素", ""];
  if (!f.entries.length) tree.push(bullet(0, MISSING));
  f.entries.forEach(e => {
    const k = ENTRY_KINDS[e.kind];
    tree.push(bullet(0, (e.kind === "screen" ? "" : "[" + k.name + "] ") + entryLabel(e)));
    e.events.forEach(ev => {
      tree.push(bullet(1, k.event + ": " + (t(ev.name) || MISSING)));
      ev.items.forEach(it => tree.push(bullet(2, ITEM_KINDS[it.kind] + ": " + (t(it.name) || MISSING) +
        "(エラーハンドリング: " + (it.err || "未定") + (it.err === "あり" && t(it.errNote) ? "・" + t(it.errNote) : "") + ")")));
    });
  });
  blocks.push({ key: "parts", missing: count("parts"), lines: tree });
  const units = unitsOf(f);
  const sp: string[] = ["", "## チケット", ""];
  if (!f.tickets.length) sp.push(MISSING);
  f.tickets.forEach((tk, i) => {
    const m = tk.docId ? docMissing(tk.docId) : null;
    sp.push((i + 1) + ". " + (t(tk.title) || MISSING) + "(" + (tk.kind === "st" ? "ST" : "実装") +
      (tk.docId ? (m == null ? "・作成済み" : m ? "・作成済み・未記入 " + m : "・作成済み・記入済み") : "・未作成") + ")");
    units.filter(u => u.ticket === tk.id).forEach(u => sp.push(bullet(1, u.label)));
  });
  const iss = issues.filter(i => i.part === "split");
  if (iss.length) sp.push("", "### 確認事項", "", ...iss.map(i => bullet(0, i.text)));
  blocks.push({ key: "split", missing: count("split"), lines: sp });
  return { text: blocks.flatMap(b => b.lines).join("\n"), missing: issues.length, blocks };
}
