/* STチケットの本文。実施概要、実施手順(部品の並び)、受け入れ条件。
   受け入れ条件は、実施手順の部品1つにつき、部品の定義の ac から作る(手順と1対1)。

   チケットの入力値:
     title, content, schedule, env タイトルと実施概要(内容・スケジュール・実施環境)
     steps[]                       実施手順(部品の並び)
     ac_extra[]                    手順と1対1でない受け入れ条件 */
import { COMPONENTS, fillAc, type CompDef, type FieldDef } from "./components";
import { MISSING, type Genre } from "./genres";
import { headsOf, listItems, type Block, type Ticket, type Values } from "./ticket";

const t = (s: unknown) => (typeof s === "string" ? s : "").trim();
const linesOf = (s: unknown) => t(s).split("\n").map(l => l.trim()).filter(Boolean);
const arr = (x: unknown): Values[] => (Array.isArray(x) ? x : []);

/* 手順から作る受け入れ条件。手順の見出しが空なら、部品の名前を使う */
export function stepAc(defs: Record<string, CompDef>, steps: unknown): string[] {
  return arr(steps).flatMap(b => {
    const def = defs[b.type];
    if (!def) return [];
    const hf = def.fields.find(f => f.head);
    const name = (hf && t(b[hf.id]).split("\n")[0]) || def.name;
    /* 受け入れ条件の欄に書いてあれば、部品の定義の文言の代わりにそれを使う */
    const own = def.fields.filter(f => f.ac).flatMap(f => linesOf(b[f.id]));
    if (own.length) return own;
    return (def.ac || []).map(a => fillAc(a, def, hf ? { ...b, [hf.id]: name } : b, MISSING));
  });
}

export function buildStTicket(g: Genre, v: Values, defs: Record<string, CompDef> = COMPONENTS): Ticket {
  const h = headsOf(g);
  let missing = 0;
  const miss = () => { missing++; return MISSING; };
  const bullet = (d: number, s: string) => " ".repeat(3 * d) + "* " + s;
  const lines = (s: unknown) => { const ls = linesOf(s); return ls.length ? ls.map(l => bullet(0, l)) : [bullet(0, miss())]; };

  /* 手順の欄。リンクなどは「表記：値」、複数行なら子の箇条書き */
  function fieldLines(f: FieldDef, o: Values, d: number): string[] {
    if (f.head || f.ac) return [];
    const val = o[f.id];
    const items = f.kind === "list" ? listItems(val) : f.kind === "multi" ? (Array.isArray(val) ? val : []) : linesOf(val);
    if (!items.length) return f.optional ? [] : [bullet(d, f.label + "：" + miss())];
    if (f.bare) return items.map(l => bullet(d, l));
    if (items.length === 1 || f.kind === "multi") return [bullet(d, f.label + "：" + items.join("、"))];
    return [bullet(d, f.label)].concat(items.map(l => bullet(d + 1, l)));
  }

  const blocks: Block[] = [];
  const block = (key: string, make: () => string[]) => {
    const before = missing;
    const ls = make();
    blocks.push({ key, lines: ls, missing: missing - before });
  };

  block("basic", () => {
    if (!t(v.title)) missing++;
    return ["## " + h.overview, "### " + h.content, "", ...lines(v.content), "", "### " + h.schedule, "", ...lines(v.schedule),
      "", "### " + h.env, "", ...lines(v.env)];
  });
  block("steps", () => {
    const steps = arr(v.steps);
    const out = ["", "## " + h.steps, ""];
    if (!steps.length) return out.concat("1. " + miss());
    steps.forEach((b, i) => {
      const def = defs[b.type];
      if (!def) { out.push((i + 1) + ". (不明な部品: " + b.type + ")"); return; }
      const hf = def.fields.find(f => f.head);
      const name = hf ? t(b[hf.id]) || miss() : def.name;
      const ls = linesOf(name);
      out.push((i + 1) + ". " + (ls[0] || name), ...ls.slice(1).map(l => bullet(1, l)));
      def.fields.forEach(f => out.push(...fieldLines(f, b, 1)));
    });
    return out;
  });
  block("ac", () => {
    const acs = stepAc(defs, v.steps).concat(listItems(v.ac_extra));
    const out = ["", "## " + h.ac, ""];
    if (!acs.length) return out.concat(bullet(0, miss()));
    acs.forEach(a => {
      const ls = linesOf(a);
      out.push(bullet(0, ls[0]), ...ls.slice(1).map(l => bullet(1, l)));
    });
    return out;
  });
  return { text: blocks.flatMap(b => b.lines).join("\n"), missing, blocks };
}
