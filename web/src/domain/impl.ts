/* 実装チケットの本文。部品(components.ts)の組み合わせから、処理の流れと受け入れ条件を作る。

   チケットの入力値:
     title, story_goal, story_scope, story_refs[], mod   タイトルとストーリー
     proc_name, blocks[]                                  組み立て(部品の並び)
     ok_status, ok_body, ac_extra[]                       受け入れ条件(正常時と追加分)
     deps[], deps_none, branch, call, nonfunc, impact     制約事項・技術的補足
   受け入れ条件は、部品の中のエラーハンドリング(エラーの欄、エラーにした「〇〇の場合」、
   エラーハンドリングの部品)を1件ずつ集めて作る */
import { COMPONENTS, NA, NONE, NO_DISPLAY, errorHead, type CaseVal, type CompDef, type ErrVal, type FieldDef } from "./components";
import { MISSING, MOD, type Genre } from "./genres";
import { headsOf, listItems, type Block, type Ticket, type Values } from "./ticket";

export type Defs = Record<string, CompDef>;
type Path = (string | number)[];

const t = (s: unknown) => (typeof s === "string" ? s : "").trim();
const linesOf = (s: unknown) => t(s).split("\n").map(l => l.trim()).filter(Boolean);
const arr = (x: unknown): Values[] => (Array.isArray(x) ? x : []);
const headOf = (fields: FieldDef[]) => fields.find(f => f.head);
const usable = (f: FieldDef, o: Values) => !f.when || o[f.when.id] === f.when.eq;
export const isEmptyErr = (e: ErrVal | undefined) => !e || !["display", "status", "code", "message", "note"].some(k => t((e as Values)[k]));

/* 受け入れ条件の1件。path は入力値の中の位置(画面から同じエラーを編集するため) */
export interface AcCase { label: string; err: ErrVal; path: Path }
export interface AcGroup { lead: string; cases: AcCase[] }

/* 部品の並びから、受け入れ条件を集める */
export function collectAc(defs: Defs, v: Values): AcGroup[] {
  const groups: AcGroup[] = [];
  const push = (lead: string, c: AcCase) => {
    let g = groups.find(x => x.lead === lead);
    if (!g) { g = { lead, cases: [] }; groups.push(g); }
    g.cases.push(c);
  };
  const walk = (blocks: unknown, base: Path, outer: string, caseLabel?: string) => arr(blocks).forEach((b, i) => {
    const p = [...base, i];
    const def = defs[b.type];
    if (!def) return;
    const hf = headOf(def.fields);
    const name = (hf && t(b[hf.id]).split("\n")[0]) || MISSING;
    const lead = t(b.ac) || (def.container ? name + (def.suffix || "") : name + (def.acSuffix || ""));
    if (def.type === "error") {
      push(outer, { label: t(b.when) || caseLabel || MISSING, err: b.err || {}, path: [...p, "err"] });
      return;
    }
    const fields = (fs: FieldDef[], o: Values, op: Path, rowName?: string) => fs.forEach(f => {
      if (!usable(f, o)) return;
      const label = rowName != null ? (f.label.includes("{行}") ? f.label.split("{行}").join(rowName) : rowName + "：" + f.label) : f.label;
      if (f.kind === "error") {
        if (f.optional && isEmptyErr(o[f.id])) return;
        push(lead, { label, err: o[f.id] || {}, path: [...op, f.id] });
      } else if (f.kind === "case") {
        const cv: CaseVal = o[f.id] || {};
        if (cv.mode === "error") push(lead, { label, err: cv.err || {}, path: [...op, f.id, "err"] });
      } else if (f.kind === "group") {
        if (!(f.ref && o[f.id + "_ref"])) fields(f.fields || [], o, op);
      } else if (f.kind === "rows") {
        if (f.ref && o[f.id + "_ref"]) return;
        const rh = headOf(f.fields || []);
        arr(o[f.id]).forEach((r, j) => fields(f.fields || [], r, [...op, f.id, j], (rh && t(r[rh.id]).split("\n")[0]) || MISSING));
      } else if (f.kind === "blocks") {
        walk(o[f.id], [...op, f.id], rowName && rowName !== MISSING ? rowName : lead);
      } else if (f.kind === "branches") {
        arr(o[f.id]).forEach((c, j) => {
          if (!c.none) walk(c.blocks, [...op, f.id, j, "blocks"], lead, (t(c.cond) || MISSING) + "の場合");
        });
      }
    });
    fields(def.fields, b, p);
  });
  walk(v.blocks, ["blocks"], (t(v.proc_name) || MISSING) + "処理");
  return groups;
}

export function buildImplTicket(g: Genre, v: Values, defs: Defs = COMPONENTS): Ticket {
  const h = headsOf(g);
  const sparse = v.mod === MOD;   /* 既存改修は、記載のある欄だけを出す */
  let missing = 0;
  const miss = () => { missing++; return MISSING; };
  const ind = (d: number) => " ".repeat(3 * d);
  const bullet = (d: number, s: string) => ind(d) + "* " + s;
  const headed = (d: number, s: string) => {
    const ls = linesOf(s);
    return [bullet(d, ls[0] || "")].concat(ls.slice(1).map(l => bullet(d + 1, l)));
  };
  const valued = (d: number, label: string, val: string) => {
    const ls = linesOf(val);
    if (ls.length <= 1) return [bullet(d, label + "：" + (ls[0] || ""))];
    return [bullet(d, label)].concat(ls.map(l => bullet(d + 1, l)));
  };
  const req = (s: unknown) => t(s) || miss();
  const skip = (f: FieldDef) => !!f.optional || sparse;

  /* 欄1つ分(処理の流れ・仕様の中)。エラーは受け入れ条件にだけ出す */
  function fieldLines(f: FieldDef, o: Values, d: number): string[] {
    if (f.head || f.ac || f.kind === "error" || !usable(f, o)) return [];
    const val = o[f.id];
    const empty = () => (skip(f) ? [] : [bullet(d, f.label + "：" + miss())]);
    switch (f.kind) {
      case "text": {
        if (!t(val)) return empty();
        return f.bare ? linesOf(val).map(l => bullet(d, l)) : valued(d, f.label, val);
      }
      case "list": {
        const items = listItems(val);
        if (!items.length) return empty();
        return [bullet(d, f.label)].concat(items.flatMap(x => headed(d + 1, x)));
      }
      case "choice": return t(val) ? [bullet(d, f.label + "：" + t(val))] : empty();
      case "multi": return Array.isArray(val) && val.length ? [bullet(d, f.label + "：" + val.join("、"))] : empty();
      case "group": {
        if (f.ref && o[f.id + "_ref"]) return [bullet(d, f.label), bullet(d + 1, "原典：" + (t(o[f.id + "_link"]) || miss()))];
        const kids = (f.fields || []).flatMap(c => fieldLines(c, o, d + 1));
        return kids.length ? [bullet(d, f.label)].concat(kids) : [];
      }
      case "case": {
        const cv: CaseVal = val || {};
        if (cv.mode === "error") return [bullet(d, f.label + "：" + errorHead(cv.err))];
        if (cv.mode === "text") return valued(d, f.label, t(cv.text) || miss());
        return empty();
      }
      case "blocks": {
        const items = arr(val);
        if (!items.length) return empty();
        return [bullet(d, f.label)].concat(blockLines(items, d + 1, true));
      }
      case "rows": {
        if (f.ref && o[f.id + "_ref"]) return [bullet(d, f.label), bullet(d + 1, "原典：" + (t(o[f.id + "_link"]) || miss()))];
        const rows = arr(val);
        if (!rows.length) return empty();
        const rh = headOf(f.fields || []);
        const rd = f.bare ? d : d + 1;   /* bare なら表記の行を出さず、行をそのまま並べる */
        const lines = rows.flatMap(r => [
          ...headed(rd, (rh && t(r[rh.id])) || miss()),
          ...(f.fields || []).filter(c => c !== rh).flatMap(c => fieldLines(c, r, rd + 1))
        ]);
        return f.bare ? lines : [bullet(d, f.label)].concat(lines);
      }
      case "branches": return branchLines(val, d);
    }
    return [];
  }

  /* 条件分岐の場合ごと。1つの部品で1行に収まるなら「〇〇であれば△△」と1行で書く */
  function branchLines(cases: unknown, d: number): string[] {
    const cs = arr(cases);
    if (!cs.length) return [bullet(d, miss())];
    return cs.flatMap(c => {
      const label = req(c.cond);
      if (c.none) return [bullet(d, label + "であれば" + NONE)];
      const bs = arr(c.blocks);
      if (!bs.length) return [bullet(d, label + "であれば" + miss())];
      const one = bs[0];
      if (bs.length === 1 && one.type === "error" && !t(one.when) && !t((one.err || {}).note))
        return [bullet(d, label + "であれば" + errorHead(one.err))];
      if (bs.length === 1 && one.type === "do" && !t(one.detail) && linesOf(one.name).length === 1)
        return [bullet(d, label + "であれば" + t(one.name))];
      return [bullet(d, label + "であれば")].concat(blockLines(bs, d + 1, false));
    });
  }

  /* 部品の並び。numbered なら番号付き(d の深さで 1. 2. …) */
  function blockLines(blocks: Values[], d: number, numbered: boolean): string[] {
    return blocks.flatMap((b, i) => {
      const def = defs[b.type];
      const first = (s: string) => {
        const ls = linesOf(s);
        const top = numbered ? ind(d) + (i + 1) + ". " + (ls[0] || "") : bullet(d, ls[0] || "");
        return [top].concat(ls.slice(1).map(l => bullet(d + 1, l)));
      };
      if (!def) return first("(不明な部品: " + b.type + ")");
      if (def.type === "error") {
        const e: ErrVal = b.err || {};
        return first((t(b.when) ? t(b.when) + "は" : "") + errorHead(e)).concat(t(e.note) ? valued(d + 1, "補足", e.note || "") : []);
      }
      const hf = headOf(def.fields);
      const out = first(hf ? req(b[hf.id]) : def.name);
      def.fields.forEach(f => out.push(...fieldLines(f, b, d + 1)));
      return out;
    });
  }

  /* 入れ物の部品は、チケットの節になる。仕様の欄と、中の処理(blocks)の節を持つ */
  function containerLines(b: Values, def: CompDef): string[] {
    const hf = headOf(def.fields);
    const out = ["", "## " + (hf ? req(b[hf.id]) : def.name) + (def.suffix || "")];
    const spec = def.fields.filter(f => f.kind !== "blocks").flatMap(f => fieldLines(f, b, 0));
    if (spec.length) out.push("### 仕様", "", ...spec);
    def.fields.filter(f => f.kind === "blocks" && usable(f, b)).forEach(f => {
      const items = arr(b[f.id]);
      if (!items.length && skip(f)) return;
      out.push("", "### " + f.label, "", ...(items.length ? blockLines(items, 0, true) : ["1. " + miss()]));
    });
    return out;
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

  block("build", () => {
    const all = arr(v.blocks);
    if (!all.length) return ["", "## " + h.flowTitle, "", "1. " + miss()];
    const out: string[] = [];
    let steps: Values[] = [];
    const flush = () => {
      if (!steps.length) return;
      out.push("", "## " + req(v.proc_name) + h.flowSuffix, "### " + h.flowTitle, "", ...blockLines(steps, 0, true));
      steps = [];
    };
    all.forEach(b => {
      const def = defs[b.type];
      if (def && def.container) { flush(); out.push(...containerLines(b, def)); }
      else steps.push(b);
    });
    flush();
    return out;
  });

  block("ac", () => {
    const out = ["", "## " + h.ac, ""];
    collectAc(defs, v).forEach(gr => {
      out.push(bullet(0, gr.lead));
      gr.cases.forEach(c => out.push(bullet(1, c.label), ...errLines(c.err, 2)));
    });
    out.push(bullet(0, h.okCase), bullet(1, "HTTPステータス：" + req(v.ok_status)));
    const body = linesOf(v.ok_body);
    if (body.length === 1) out.push(bullet(1, "返す内容：" + body[0]));
    else if (body.length) out.push(bullet(1, "返す内容"), ...body.map(l => bullet(2, l)));
    listItems(v.ac_extra).forEach(x => out.push(...headed(0, x)));
    return out;
  });

  /* エラーの内容。「なし」の欄は出さない。表示しない場合はエラーメッセージを問わない */
  function errLines(e: ErrVal, d: number): string[] {
    const out: string[] = [];
    const display = t(e.display);
    if (!display) out.push(bullet(d, "表示：" + miss()));
    else if (display !== NO_DISPLAY) out.push(bullet(d, "表示：" + display));
    ([["status", "HTTPステータス"], ["code", "エラーコード"], ["message", "エラーメッセージ"]] as const).forEach(([k, label]) => {
      if (k === "message" && display === NO_DISPLAY) return;
      const val = t(e[k]);
      if (val === NA) return;
      out.push(bullet(d, label + "：" + (val || miss())));
    });
    if (t(e.note)) out.push(...valued(d, "補足", e.note || ""));
    return out;
  }

  block("notes", () => {
    const deps = listItems(v.deps);
    const out = ["", "## " + h.notes, "### " + h.deps, ""];
    if (deps.length) deps.forEach(x => out.push(...headed(0, x)));
    else out.push(bullet(0, v.deps_none ? "なし" : miss()));
    out.push("", "### " + h.branch, "", ...headed(0, req(v.branch)));
    ([["call", h.call], ["nonfunc", h.nonfunc], ["impact", h.impact]] as const).forEach(([k, title]) => {
      if (t(v[k])) out.push("", "### " + title, "", ...linesOf(v[k]).map(l => bullet(0, l)));
      else if (k === "impact" && sparse) out.push("", "### " + title, "", bullet(0, miss()));
    });
    return out;
  });

  return { text: blocks.flatMap(b => b.lines).join("\n"), missing, blocks };
}
