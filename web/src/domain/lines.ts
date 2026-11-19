/* 部品の中身を、行の並び(見出し・箇条書き・番号付き・文・表)として扱う。エディタで編集し、Markdown(チケットビルダーの書式)に戻す。
   書式: 見出しは「# 」〜「#### 」、箇条書きは「* 」、番号付きは「1. 」、字下げは1段3文字。
   空行は持たず、書き戻すときに入れる(見出しの前後、種類が変わる所) */

export type LineKind = "h1" | "h2" | "h3" | "h4" | "bullet" | "num" | "text" | "table";
export interface Line { kind: LineKind; level: number; text: string }

export const HEADS: LineKind[] = ["h1", "h2", "h3", "h4"];
export const isList = (k: LineKind) => k === "bullet" || k === "num";

export function parseLines(md: string): Line[] {
  const out: Line[] = [];
  md.replace(/\r/g, "").split("\n").forEach(raw => {
    if (!raw.trim()) return;
    let m = /^(#{1,4})\s+(.*)$/.exec(raw);
    if (m) { out.push({ kind: HEADS[m[1].length - 1], level: 0, text: m[2] }); return; }
    m = /^( *)[*-](?: (.*))?$/.exec(raw);
    if (m) { out.push({ kind: "bullet", level: Math.round(m[1].length / 3), text: m[2] || "" }); return; }
    m = /^( *)\d+\.(?: (.*))?$/.exec(raw);
    if (m) { out.push({ kind: "num", level: Math.round(m[1].length / 3), text: m[2] || "" }); return; }
    if (/^\s*\|/.test(raw)) { out.push({ kind: "table", level: 0, text: raw.trim() }); return; }
    out.push({ kind: "text", level: 0, text: raw.trim() });
  });
  return out;
}

/* 番号付きの番号。字下げごとに数え、同じ字下げの箇条書き・見出し・文で数え直す */
export function numbers(lines: Line[]): number[] {
  const count = new Map<number, number>();
  return lines.map(l => {
    if (!isList(l.kind)) { count.clear(); return 0; }
    [...count.keys()].forEach(k => { if (k > l.level) count.delete(k); });
    if (l.kind !== "num") { count.delete(l.level); return 0; }
    const n = (count.get(l.level) || 0) + 1;
    count.set(l.level, n);
    return n;
  });
}

const group = (k: LineKind) => (isList(k) ? "list" : k === "table" ? "table" : k);
export function toMarkdown(lines: Line[]): string {
  const nums = numbers(lines);
  const out: string[] = [];
  let prev: Line | null = null;
  lines.forEach((l, i) => {
    if (l.kind === "text" && !l.text.trim()) return;   /* 空の文の行は書かない */
    const pad = " ".repeat(3 * l.level);
    const s = l.kind.startsWith("h") ? "#".repeat(HEADS.indexOf(l.kind) + 1) + " " + l.text
      : l.kind === "bullet" ? pad + "* " + l.text
      : l.kind === "num" ? pad + nums[i] + ". " + l.text
      : l.text;
    if (prev && !(group(prev.kind) === group(l.kind) && (group(l.kind) === "list" || group(l.kind) === "table"))) out.push("");
    out.push(s.replace(/\s+$/, ""));
    prev = l;
  });
  return out.join("\n");
}
