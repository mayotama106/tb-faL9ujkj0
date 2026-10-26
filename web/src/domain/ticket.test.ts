/* 旧版(test/legacy-index.html。単一ファイルだった頃の index.html)の buildTicket と、未記入の数え方が同じことを確かめる。
   本文の書式は実装・STチケットにそろえたので、旧版とは異なる(下の「バグチケットの書式」で確かめる) */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { ERR_KINDS, GENRES, HAS, HAS_NOT, MOD, NEW, REF, type QNode } from "./genres";
import { buildTicket, renumber, type Values } from "./ticket";

const legacyPath = resolve(import.meta.dirname, "../../test/legacy-index.html");
const html = readFileSync(legacyPath, "utf8");
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const ctx: Record<string, unknown> = {};
vm.createContext(ctx);
vm.runInContext(script + ";this.legacy = buildTicket;", ctx);
const legacy = ctx.legacy as (s: { genre: string; v: Values }) => { text: string; missing: number };

/* 再現できる乱数 */
function rng(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
}

function randomValues(genre: string, r: () => number): Values {
  const v: Values = {};
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const text = () => pick(["", "", "値", "1行目\n2行目", "  前後に空白  ", "a\n\nb"]);
  const err = (): Values => ({ ek: pick(["", ...ERR_KINDS]), eid: text(), emsg: text(), elog: text(), eetc: text(), efree: text() });
  const steps = (depth: number): Values[] => Array.from({ length: Math.floor(r() * 3) }, () => {
    const kind = pick(depth > 0 ? ["do", "if", "err"] : ["do", "if"]);
    if (kind === "err") return { kind, ...err(), note: text() };
    if (kind === "if") return { kind, text: text(), note: text(), then: depth < 2 ? steps(depth + 1) : [], else: depth < 2 ? steps(depth + 1) : [] };
    return { kind, text: text(), note: text(), kids: depth < 2 ? steps(depth + 1) : [] };
  });
  const fill = (n: QNode) => {
    if (r() < 0.3) v[n.id + "__etc"] = text();
    if (n.type === "text") v[n.id] = text();
    if (n.type === "list") v[n.id] = Array.from({ length: Math.floor(r() * 3) }, text);
    if (n.type === "choice") v[n.id] = pick(["", ...(n.options || [])]);
    if (n.type === "multi") v[n.id] = (n.options || []).filter(() => r() < 0.5);
    if (n.type === "error") { const e = err(); v[n.id + "_kind"] = e.ek; for (const k of ["eid", "emsg", "elog", "eetc", "efree"]) v[n.id + "_" + k] = e[k]; }
    if (n.type === "group" && n.refChildren) { v[n.id + "_src"] = pick(["", REF]); v[n.id + "_link"] = text(); }
    if (n.type === "logic") { v[n.id + "_has"] = pick(["", HAS, HAS_NOT]); v[n.id + "_src"] = pick(["", "", REF]); v[n.id + "_link"] = text(); v[n.id + "_steps"] = steps(0); }
    if (n.type === "elements") { v[n.id + "_src"] = pick(["", "", REF]); v[n.id + "_link"] = text();
      v[n.id] = Array.from({ length: Math.floor(r() * 3) }, () => ({ name: text(), kind: pick(["", "表示", "入力", "ボタン"]), style: text(), type: text(), cond: text(), bad: err() })); }
    if (n.type === "events") { v[n.id + "_src"] = pick(["", "", REF]); v[n.id + "_link"] = text();
      v[n.id] = Array.from({ length: Math.floor(r() * 3) }, () => ({ name: text(), trig: text(), steps: steps(1) })); }
    (n.children || []).forEach(fill); (n.refChildren || []).forEach(fill);
    Object.values(n.branches || {}).forEach(a => a.forEach(fill));
  };
  const g = GENRES[genre];
  (g.func || []).concat(g.nonfunc || [], g.modOnly || []).forEach(fill);
  (g.sections || []).forEach(s => { s.nodes.forEach(fill); if (r() < 0.3) v[s.key + "__etc"] = text(); });
  for (const k of ["title", "story", "deps", "refs", "api_name", "func__etc", "nonfunc__etc", "other__etc"]) v[k] = text();
  v.mod = pick(["", NEW, MOD]);
  return v;
}

describe("buildTicket は旧版と同じく未記入を数える", () => {
  /* 実装チケットとSTチケットは旧版にないので、impl.test.ts と st.test.ts で確かめる */
  for (const genre of Object.keys(GENRES).filter(k => !GENRES[k].impl && !GENRES[k].st && !GENRES[k].call)) {
    it(genre, () => {
      const r = rng(genre.length * 7919);
      expect(buildTicket(GENRES[genre], {}).missing).toBe(legacy({ genre, v: {} }).missing);
      for (let i = 0; i < 400; i++) {
        const v = randomValues(genre, r);
        const a = buildTicket(GENRES[genre], structuredClone(v));
        const b = legacy({ genre, v: structuredClone(v) });
        expect(a.missing).toBe(b.missing);
        expect(a.blocks.reduce((n, x) => n + x.missing, 0)).toBe(a.missing);
      }
    });
  }
});

describe("バグチケットの書式", () => {
  it("見出しは ##、箇条書きは「* 」と3文字の字下げ、区切りは「：」。番号は振り直し、選択肢は本文の書き方で出す", () => {
    const v: Values = {
      title: "t", story: "住所2を空にすると500エラーになる", b_what: "エラー画面が出る", b_expect: "変更できる",
      b_steps: ["ログインする", "住所変更画面を開く", "変更ボタンを押す"], b_env: "ST環境", b_proof: ["リクエストID: 1"],
      b_freq: "毎回", b_impact: "住所2がない会員", b_wa: "ない", b_cause: "判明している", b_fact: ["NOT NULL制約に違反"],
      b_check: ["住所2が空でも変更できること"], b_side: "住所変更APIのみ", b_test: "追加する", b_test_what: "住所2が空のケース",
      deps: "なし", refs: "設計書"
    };
    const text = buildTicket(GENRES.bug, v).text;
    expect(text).toContain("## 概要\n\n* 住所2を空にすると500エラーになる");
    expect(text).toContain("## 事象\n\n* 事象：エラー画面が出る\n* 期待動作：変更できる\n* 再現手順\n   1. ログインする\n   2. 住所変更画面を開く\n   3. 変更ボタンを押す");
    expect(text).toContain("* 回避策：なし");
    expect(text).toContain("* 原因：判明\n   * 確認済みの事実\n      * NOT NULL制約に違反");
    expect(text).toContain("* 再発防止のテスト：あり\n   * 追加するテスト：住所2が空のケース");
    expect(text).toContain("## 依存関係・環境\n\n* なし\n\n## 参考情報\n\n* 設計書");
    expect(text).not.toMatch(/^\s*- /m);
  });
  it("番号の振り直しは、字下げごとに数え、箇条書きでない行で数え直す", () => {
    expect(renumber(["1. a", "   1. x", "   1. y", "1. b", "* c", "1. d", "", "1. e"]))
      .toEqual(["1. a", "   1. x", "   2. y", "2. b", "* c", "1. d", "", "1. e"]);
  });
});
