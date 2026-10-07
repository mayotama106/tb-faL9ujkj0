/* 処理の流れの形式(ロジック作成)のチケット本文。
   処理の流れを工程で組み立て、受け入れ条件は工程(チェックとエラー返却)から作る。

   入力値:
     title, story_goal, story_scope, story_refs[]       ストーリー
     proc_name, flow[]                                    処理の流れ
     ok_status, ok_body, ac_extra[]                       受け入れ条件(正常時と追加分)
     deps[], deps_none, branch, call, nonfunc, impact     制約事項・技術的補足
   工程(flow の要素):
     { kind: "checks", text, ac, items: [{ name, detail, status, code }] }   チェック群
     { kind: "do", text, detail }                                           処理実行
     { kind: "if", text, ac, yes, no, then[], else[], thenNone, elseNone }  条件分岐
     { kind: "error", status, code, detail }                                エラーを返却(条件分岐の中) */
import { MISSING, type Genre } from "./genres";
import { headsOf, listItems, type Block, type Ticket, type Values } from "./ticket";

export const NONE = "何もしない";

/* 受け入れ条件の1件。path は flow の中の位置(画面から同じ値を編集するため) */
export interface AcCase { label: string; path: (string | number)[]; status: string; code: string }
export interface AcGroup { lead: string; cases: AcCase[] }

const t = (s: unknown) => (typeof s === "string" ? s : "").trim();
const linesOf = (s: unknown) => t(s).split("\n").map(l => l.trim()).filter(Boolean);
const arr = (x: unknown): Values[] => (Array.isArray(x) ? x : []);

/* 工程から受け入れ条件を集める。チェック1つ、エラー返却1つが、それぞれ1件になる */
export function collectAc(flow: unknown, base: (string | number)[] = ["flow"]): AcGroup[] {
  const groups: AcGroup[] = [];
  arr(flow).forEach((st, i) => {
    const p = [...base, i];
    if (st.kind === "checks") {
      groups.push({
        lead: t(st.ac) || (t(st.text) || MISSING) + "がされていること",
        cases: arr(st.items).map((it, j) => ({
          label: (t(it.name).split("\n")[0] || MISSING) + "に引っかかる場合",
          path: [...p, "items", j], status: t(it.status), code: t(it.code)
        }))
      });
    } else if (st.kind === "if") {
      const cases: AcCase[] = [];
      const nested: AcGroup[] = [];
      ([["then", "yes"], ["else", "no"]] as const).forEach(([key, lab]) => {
        arr(st[key]).forEach((s, j) => {
          if (s.kind === "error")
            cases.push({ label: (t(st[lab]) || MISSING) + "の場合", path: [...p, key, j], status: t(s.status), code: t(s.code) });
        });
        nested.push(...collectAc(st[key], [...p, key]));
      });
      if (cases.length) groups.push({ lead: t(st.ac) || (t(st.text) || MISSING) + "がされていること", cases });
      groups.push(...nested);
    }
  });
  return groups;
}

export function buildFlowTicket(g: Genre, v: Values): Ticket {
  const h = headsOf(g);
  let missing = 0;
  const miss = () => { missing++; return MISSING; };
  const ind = (d: number) => " ".repeat(3 * d);
  const bullet = (d: number, s: string) => ind(d) + "* " + s;
  /* 1行目を箇条書きにし、2行目以降はその子にする */
  const headed = (d: number, s: string) => {
    const ls = linesOf(s);
    return [bullet(d, ls[0] || "")].concat(ls.slice(1).map(l => bullet(d + 1, l)));
  };
  const req = (s: unknown) => t(s) || miss();

  /* 工程1つ。top は処理の流れの直下(番号付き)。d は子の箇条書きの深さ */
  function step(st: Values, n: number, top: boolean, d: number): string[] {
    const cd = top ? 1 : d + 1;
    const head = (s: string) => {
      const ls = s.split("\n").map(l => l.trim()).filter(Boolean);
      const first = top ? n + ". " + (ls[0] || "") : bullet(d, ls[0] || "");
      return [first].concat(ls.slice(1).map(l => bullet(cd, l)));
    };
    const details = (s: unknown, dd: number) => linesOf(s).map(l => bullet(dd, l));
    if (st.kind === "checks") {
      const items = arr(st.items);
      const out = head(req(st.text));
      if (!items.length) out.push(bullet(cd, miss()));
      items.forEach(it => out.push(...headed(cd, req(it.name)), ...details(it.detail, cd + 1)));
      return out;
    }
    if (st.kind === "error") return head("エラーを返却").concat(details(st.detail, cd));
    if (st.kind === "if") {
      const out = head(req(st.text));
      ([["yes", "then", "thenNone"], ["no", "else", "elseNone"]] as const).forEach(([lab, key, none]) => {
        const label = req(st[lab]);
        const steps = arr(st[key]);
        if (st[none]) { out.push(bullet(cd, label + "であれば" + NONE)); return; }
        if (!steps.length) { out.push(bullet(cd, label + "であれば" + miss())); return; }
        /* 工程が1つで1行に収まるなら、「〇〇であれば△△」と1行で書く */
        const one = steps[0];
        if (steps.length === 1 && one.kind === "error" && !t(one.detail)) { out.push(bullet(cd, label + "であればエラーを返却")); return; }
        if (steps.length === 1 && one.kind === "do" && !t(one.detail) && linesOf(one.text).length <= 1) {
          out.push(bullet(cd, label + "であれば" + req(one.text))); return;
        }
        out.push(bullet(cd, label + "であれば"));
        steps.forEach(s => out.push(...step(s, 0, false, cd + 1)));
      });
      return out;
    }
    return head(req(st.text)).concat(details(st.detail, cd));
  }

  const blocks: Block[] = [];
  const block = (key: string, make: () => string[]) => {
    const before = missing;
    const lines = make();
    blocks.push({ key, lines, missing: missing - before });
  };

  block("basic", () => {
    if (!t(v.title)) missing++;
    const refs = listItems(v.story_refs).flatMap(r => headed(1, r));
    return ["## " + h.story, "", ...headed(0, req(v.story_goal)), ...headed(0, req(v.story_scope)), ...refs];
  });

  block("flow", () => {
    const steps = arr(v.flow);
    const body = steps.length ? steps.flatMap((s, i) => step(s, i + 1, true, 0)) : ["1. " + miss()];
    return ["", "## " + req(v.proc_name) + h.flowSuffix, "### " + h.flowTitle, "", ...body];
  });

  block("ac", () => {
    const out = ["", "## " + h.ac, ""];
    collectAc(v.flow).forEach(gr => {
      out.push(bullet(0, gr.lead));
      if (!gr.cases.length) out.push(bullet(1, miss()));
      gr.cases.forEach(c => out.push(
        bullet(1, c.label),
        bullet(2, "HTTPステータス：" + (c.status || miss())),
        bullet(2, "エラーコード：" + (c.code || miss()))
      ));
    });
    out.push(bullet(0, h.okCase), bullet(1, "HTTPステータス：" + req(v.ok_status)));
    const body = linesOf(v.ok_body);
    if (body.length === 1) out.push(bullet(1, "返す内容：" + body[0]));
    else if (body.length) out.push(bullet(1, "返す内容"), ...body.map(l => bullet(2, l)));
    listItems(v.ac_extra).forEach(x => out.push(...headed(0, x)));
    return out;
  });

  block("notes", () => {
    const deps = listItems(v.deps);
    const out = ["", "## " + h.notes, "### " + h.deps, ""];
    if (deps.length) deps.forEach(x => out.push(...headed(0, x)));
    else out.push(bullet(0, v.deps_none ? "なし" : miss()));
    out.push("", "### " + h.branch, "", ...headed(0, req(v.branch)));
    ([["call", h.call], ["nonfunc", h.nonfunc], ["impact", h.impact]] as const).forEach(([k, title]) => {
      if (t(v[k])) out.push("", "### " + title, "", ...linesOf(v[k]).map(l => bullet(0, l)));
    });
    return out;
  });

  return { text: blocks.flatMap(b => b.lines).join("\n"), missing, blocks };
}
