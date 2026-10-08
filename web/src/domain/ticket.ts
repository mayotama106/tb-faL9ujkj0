/* チケット本文(Markdown)の生成。画面に依存しない。
   旧版 index.html の buildTicket を移したもの。本文はパートごとのブロックに分けて返す */
import type { CompDef } from "./components";
import { buildImplTicket } from "./impl";
import { HAS, HAS_NOT, LOGIC_SRC, MISSING, MOD, NEW, REF, type Genre, type Heads, type QNode } from "./genres";

/* 入力値。キーは問いのID(と、その派生) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Values = Record<string, any>;

/* 本文の見出しと定型文。ジャンルの heads で上書きできる(テンプレートの編集) */
export const HEADS: Heads = {
  story: "ストーリー", ac: "受け入れ条件", func: "機能要件", nonfunc: "非機能要件", other: "その他",
  deps: "依存関係・環境", refs: "参考情報",
  leadNew: "{名前}が新規作成されていること", leadMod: "{名前}が改修されていること",
  flowSuffix: "処理", flowTitle: "処理の流れ", notes: "制約事項・技術的補足", branch: "ブランチ",
  call: "呼び出し条件", impact: "既存影響", okCase: "正常に処理が完了した場合",
  scope: "スコープ", scopeIn: "スコープ内", scopeOut: "スコープ外"
};
export const headsOf = (g: Genre): Heads => Object.assign({}, HEADS, g.heads || {});

/* 「その他」欄のID。子を持つ項目ごとに1つ。分岐を持つ項目は選択値ごとに分ける。 */
export function etcId(node: QNode, val: string): string | null {
  if (node.branches) return node.branches[val] ? node.id + ":" + val + "__etc" : null;
  if (node.children) return node.id + "__etc";
  return null;
}
export function kidsOf(node: QNode, val: string): QNode[] {
  return (node.children || []).concat(node.branches && node.branches[val] ? node.branches[val] : []);
}
/* 1項目1入力欄の値。各項目は改行を含みうる(旧形式の改行区切りの文字列も受ける) */
export function listItems(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : String(raw || "").split("\n");
  return arr.map(s => String(s).trim()).filter(Boolean);
}
export function valueOf(node: QNode, v: Values): string {
  const raw = v[node.id];
  if (node.type === "multi") return (raw || []).join("、");
  if (node.type === "list") return listItems(raw).join("\n");
  return (raw || "").trim();
}

/* 本文のブロック。key はパート(入力画面の1ページ)に対応する */
export interface Block { key: string; lines: string[]; missing: number }
export interface Ticket { text: string; missing: number; blocks: Block[] }

type Depth = number | string[];

/* defs は実装チケットの部品の定義(テンプレートの編集を反映したもの)。省略すると初期の定義 */
export function buildTicket(g: Genre, v: Values = {}, defs?: Record<string, CompDef>): Ticket {
  if (g.impl) return buildImplTicket(g, v, defs);
  const h = headsOf(g);
  const sparseAll = v.mod === MOD;   /* 既存改修は、記載のある項目だけを出力する */
  let missing = 0;

  const esc = (s: string) => s;
  const H = (lv: number, s: string) => "#".repeat(lv) + " " + s;
  /* d は深さ(数値)、または "b"(箇条書き)と "n"(番号付き)の並び */
  const typesOf = (d: Depth): string[] => Array.isArray(d) ? d : Array(d).fill("b");
  const deeper = (d: Depth, t?: string) => typesOf(d).concat(t || "b");
  const B = (d: Depth, s: string) => {
    const ts = typesOf(d);
    const indent = ts.slice(0, -1).reduce((n, t) => n + (t === "n" ? 3 : 2), 0);
    return " ".repeat(indent) + (ts[ts.length - 1] === "n" ? "1. " : "- ") + s;
  };
  const str = (id: string): string => (v[id] || "").trim();

  /* 値を「ラベル: 値」または複数行の子箇条書きにする */
  function valued(d: Depth, label: string, val: string): string[] {
    const ls = val.split("\n").map(s => s.trim()).filter(Boolean);
    if (ls.length === 1) return [B(d, label + ": " + esc(ls[0]))];
    return [B(d, label)].concat(ls.map(l => B(deeper(d), esc(l))));
  }
  /* 見出しになる値(工程、要素名、項目など)。2行目以降は子の箇条書きにする */
  function headed(d: Depth, s: string): string[] {
    const ls = s.split("\n").map(l => l.trim()).filter(Boolean);
    return [B(d, esc(ls[0] || ""))].concat(ls.slice(1).map(l => B(deeper(d), esc(l))));
  }
  function etc(id: string | null, d: Depth): string[] {
    const val = id ? str(id) : "";
    return val ? valued(d, "その他", val) : [];
  }
  function errLines(node: QNode, d: number, sparse: boolean): string[] {
    const kind = str(node.id + "_kind");
    if (!kind) {
      if (sparse) return [];
      missing++; return [B(d, node.label + ": " + MISSING)];
    }
    if (kind === "その他") {
      const free = str(node.id + "_efree");
      if (free) return valued(d, node.label, free);
      if (sparse) return [B(d, node.label + ": その他")];
      missing++; return [B(d, node.label + ": " + MISSING)];
    }
    const res = [B(d, node.label + ": " + kind)];
    ([["_eid", "エラーID"], ["_emsg", "エラーメッセージ"], ["_elog", "ログレベル"]] as const).forEach(([suf, label]) => {
      const val = str(node.id + suf);
      if (val) res.push(...valued(d + 1, label, val));
      else if (!sparse) { missing++; res.push(B(d + 1, label + ": " + MISSING)); }
    });
    if (kind === "エラー画面") res.push(...etc(node.id + "_eetc", d + 1));
    return res;
  }
  /* 種類(モーダル / 画面 / その他)を持つエラーの記載。o は ek, eid, emsg, elog, eetc, efree を持つ */
  function errBlock(o: Values, ts: Depth, label: string, sparse: boolean): string[] {
    const kind = (o.ek || "").trim();
    if (!kind) {
      if (sparse) return [];
      missing++; return [B(ts, label + ": " + MISSING)];
    }
    if (kind === "その他") {
      const freeText = (o.efree || "").trim();
      if (freeText) return valued(ts, label, freeText);
      if (sparse) return [B(ts, label + ": その他")];
      missing++; return [B(ts, label + ": " + MISSING)];
    }
    const res = [B(ts, label + ": " + kind)];
    ([["eid", "エラーID"], ["emsg", "エラーメッセージ"], ["elog", "ログレベル"]] as const).forEach(([key, l]) => {
      const val = (o[key] || "").trim();
      if (val) res.push(...valued(deeper(ts), l, val));
      else if (!sparse) { missing++; res.push(B(deeper(ts), l + ": " + MISSING)); }
    });
    const extra = (o.eetc || "").trim();
    if (kind === "エラー画面" && extra) res.push(...valued(deeper(ts), "その他", extra));
    return res;
  }
  /* 原典を参照する場合のリンク行 */
  function refLink(node: QNode, d: number, sparse: boolean): string[] {
    const link = str(node.id + "_link");
    const src = node.src || LOGIC_SRC;
    if (link) return valued(d, src, link);
    if (sparse) return [];
    missing++; return [B(d, src + ": " + MISSING)];
  }
  /* 画面の要素。1要素ごとに、種類、スタイリング、型、不正時、表示条件を持つ */
  function elementsLines(node: QNode, d: number, sparse: boolean): string[] {
    let kids: string[];
    if (v[node.id + "_src"] === REF) {
      kids = refLink(node, d + 1, sparse);
    } else {
      const els: Values[] = Array.isArray(v[node.id]) ? v[node.id] : [];
      kids = els.flatMap(e => {
        const name = (e.name || "").trim();
        const body: string[] = [];
        const add = (label: string, raw: string) => {
          const val = (raw || "").trim();
          if (val) body.push(...valued(d + 2, label, val));
          else if (!sparse) { missing++; body.push(B(d + 2, label + ": " + MISSING)); }
        };
        add("種類", e.kind);
        add("スタイリング", e.style);
        if (e.kind === "入力") {   /* 型と不正時の扱いは、入力要素にだけ問う */
          add("型・桁・必須", e.type);
          body.push(...errBlock(e.bad || {}, d + 2, "入力が不正な場合", sparse));
        }
        add("表示条件・操作条件", e.cond);
        if (!name) {
          if (sparse) return body.length ? [B(d + 1, "要素")].concat(body) : [];
          missing++; return [B(d + 1, MISSING)].concat(body);
        }
        return headed(d + 1, name).concat(body);
      });
      if (!kids.length && !sparse) { missing++; kids = [B(d + 1, MISSING)]; }
    }
    kids = kids.concat(etc(node.id + "__etc", d + 1));
    if (sparse && !kids.length) return [];
    return [B(d, node.label)].concat(kids);
  }
  /* ロジックの工程。処理実行と条件分岐は互いに入れ子にできる */
  function stepLines(step: Values, ts: Depth, sparse: boolean): string[] {
    const text = (step.text || "").trim();
    const note = (step.note || "").trim();
    if (step.kind === "err") {
      const label = "エラーハンドリング";
      const noteL = note ? valued(deeper(ts), "補足", note) : [];
      const ls = errBlock(step, ts, label, sparse);
      if (!ls.length) return noteL.length ? [B(ts, label)].concat(noteL) : [];
      return ls.concat(noteL);
    }
    const isIf = step.kind === "if";
    let body: string[] = [];
    if (isIf) {
      ([["then", "満たす場合"], ["else", "満たさない場合"]] as const).forEach(([key, label]) => {
        const ls = stepsLines(step[key], deeper(deeper(ts), "n"), sparse);
        if (ls.length) body.push(B(deeper(ts), label), ...ls);
        else if (!sparse) { missing++; body.push(B(deeper(ts), label + ": " + MISSING)); }
      });
    } else {
      body = stepsLines(step.kids, deeper(ts, "n"), sparse);
    }
    if (note) body.push(...valued(deeper(ts), "補足", note));
    const prefix = isIf ? "条件分岐: " : "";
    if (!text) {
      if (sparse) return body.length ? [B(ts, isIf ? "条件分岐" : "処理実行")].concat(body) : [];
      missing++;
      return [B(ts, prefix + MISSING)].concat(body);
    }
    return headed(ts, prefix + text).concat(body);
  }
  function stepsLines(arr: unknown, ts: Depth, sparse: boolean): string[] {
    return (Array.isArray(arr) ? arr : []).flatMap(s => stepLines(s, ts, sparse));
  }
  function logicLines(node: QNode, d: number, sparse: boolean): string[] {
    const has = node.noHas ? HAS : str(node.id + "_has");
    if (!has) {
      if (sparse) return [];
      missing++; return [B(d, node.label + ": " + MISSING)];
    }
    if (has === HAS_NOT) return [B(d, node.label + ": なし")];
    let kids: string[];
    if (v[node.id + "_src"] === REF) {
      kids = refLink(node, d + 1, sparse);
    } else {
      kids = stepsLines(v[node.id + "_steps"], deeper(d, "n"), sparse);
      if (!kids.length && !sparse) { missing++; kids = [B(d + 1, "処理の順序: " + MISSING)]; }
    }
    kids = kids.concat(etc(node.id + "__etc", d + 1));
    if (sparse && !kids.length) return [];
    return [B(d, node.label)].concat(kids);
  }
  /* 画面のイベント。イベントごとに、きっかけと処理の工程を持つ */
  function eventsLines(node: QNode, d: number, sparse: boolean): string[] {
    let kids: string[];
    if (v[node.id + "_src"] === REF) {
      kids = refLink(node, d + 1, sparse);
    } else {
      const evs: Values[] = Array.isArray(v[node.id]) ? v[node.id] : [];
      kids = evs.flatMap(ev => {
        const name = (ev.name || "").trim(), trig = (ev.trig || "").trim();
        const body: string[] = [];
        if (trig) body.push(...valued(d + 2, "きっかけ", trig));
        else if (!sparse) { missing++; body.push(B(d + 2, "きっかけ: " + MISSING)); }
        const st = stepsLines(ev.steps, deeper(d + 2, "n"), sparse);
        if (st.length) body.push(B(d + 2, "処理"), ...st);
        else if (!sparse) { missing++; body.push(B(d + 2, "処理: " + MISSING)); }
        if (!name) {
          if (sparse) return body.length ? [B(d + 1, "イベント")].concat(body) : [];
          missing++; return [B(d + 1, MISSING)].concat(body);
        }
        return headed(d + 1, name).concat(body);
      });
      if (!kids.length && !sparse) { missing++; kids = [B(d + 1, MISSING)]; }
    }
    kids = kids.concat(etc(node.id + "__etc", d + 1));
    if (sparse && !kids.length) return [];
    return [B(d, node.label)].concat(kids);
  }
  function lines(node: QNode, d: number): string[] {
    /* optional の項目は、空なら出力しない */
    const sparse = (sparseAll || !!node.optional) && !node.always;
    if (node.type === "logic") return logicLines(node, d, sparse);
    if (node.type === "events") return eventsLines(node, d, sparse);
    if (node.type === "elements") return elementsLines(node, d, sparse);
    if (node.type === "error") return errLines(node, d, sparse);
    if (node.type === "group") {
      let kids: string[];
      if (node.refChildren && v[node.id + "_src"] === REF) {
        /* 原典を参照する場合は、リンクだけを載せて項目の記載を省略する */
        const link = str(node.id + "_link");
        const srcLabel = g.srcLabel || LOGIC_SRC;
        if (link) kids = valued(d + 1, srcLabel, link);
        else if (sparse) kids = [];
        else { missing++; kids = [B(d + 1, srcLabel + ": " + MISSING)]; }
        kids = kids.concat(node.refChildren.flatMap(c => lines(c, d + 1)));
      } else {
        kids = (node.children || []).flatMap(c => lines(c, d + 1));
      }
      kids = kids.concat(etc(node.id + "__etc", d + 1));
      if (sparse && !kids.length) return [];
      return [B(d, node.label)].concat(kids);
    }
    const val = valueOf(node, v);
    const kids = kidsOf(node, val).flatMap(c => lines(c, d + 1)).concat(etc(etcId(node, val), d + 1));
    if (!val) {
      if (sparse) return kids.length ? [B(d, node.label)].concat(kids) : [];
      missing++;
      return [B(d, node.label + ": " + MISSING)].concat(kids);
    }
    if (node.type === "list")
      return [B(d, node.label)].concat(listItems(v[node.id]).flatMap(l => headed(node.numbered ? deeper(d, "n") : d + 1, l)), kids);
    return valued(d, node.label, val).concat(kids);
  }
  function free(id: string): string[] {
    const val = str(id);
    if (!val) { missing++; return [MISSING]; }
    return val.split("\n").map(l => esc(l.replace(/\s+$/, "")));
  }

  /* ブロックを1つ作る。作る間に数えた未記入を、そのブロックの件数にする */
  const blocks: Block[] = [];
  const block = (key: string, make: () => string[]) => {
    const before = missing;
    const ls = make();
    const last = blocks[blocks.length - 1];
    if (last && last.key === key) { last.lines.push(...ls); last.missing += missing - before; }
    else blocks.push({ key, lines: ls, missing: missing - before });
  };
  const titleBlock = () => block("basic", () => { if (!str("title")) missing++; return []; });

  /* 節の構成を自前で持つジャンル(バグチケット) */
  if (g.sections) {
    block("basic", () => [H(3, g.storyLabel || "ストーリー"), ...free("story")]);
    titleBlock();
    g.sections.forEach(sec => block("sec:" + sec.key, () => {
      const o = ["", H(3, sec.title)];
      if (sec.lead) o.push(B(1, sec.lead));
      o.push(...sec.nodes.flatMap(n => lines(n, 1)), ...etc(sec.key + "__etc", 1));
      return o;
    }));
    block("refs", () => ["", H(3, h.deps), ...free("deps"), "", H(3, h.refs), ...free("refs")]);
    return finish();
  }

  block("basic", () => [H(3, h.story), ...free("story")]);
  titleBlock();
  /* 受け入れ条件の先頭行: 〇〇APIが新規作成されていること */
  block("kind", () => {
    let name = str("api_name").replace(new RegExp((g.noun || "") + "$", "i"), "").trim();
    if (!name) { name = MISSING; missing++; }
    const fill = (t: string) => t.split("{名前}").join(esc(name) + (g.noun || ""));
    let lead;
    if (v.mod === NEW) lead = B(1, fill(h.leadNew));
    else if (v.mod === MOD) lead = B(1, fill(h.leadMod));
    else { lead = B(1, "作成区分: " + MISSING); missing++; }
    return ["", H(3, h.ac), lead];
  });
  ([["func", h.func, g.func || []], ["nonfunc", h.nonfunc, g.nonfunc || []],
    ["other", h.other, sparseAll ? g.modOnly || [] : []]] as const).forEach(([key, title, nodes]) => block(key, () => {
    let body = nodes.flatMap(n => lines(n, 1)).concat(etc(key + "__etc", 1));
    if (!body.length) {
      if (!sparseAll) return [];            /* 新規作成で中身がない節は出さない */
      body = ["変更なし"];
    }
    return ["", H(4, title), ...body];
  }));
  block("refs", () => ["", H(3, h.deps), ...free("deps"), "", H(3, h.refs), ...free("refs")]);
  return finish();

  function finish(): Ticket {
    return { text: blocks.flatMap(b => b.lines).join("\n"), missing, blocks };
  }
}
