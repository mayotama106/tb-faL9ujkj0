/* テンプレート集: 初期の部品・テンプレートの整合と、本文の組み立て */
import { describe, expect, it } from "vitest";
import { assemble, defaultKit, holesOf, normalizeKit, partsOf, usedBy, KIT_CATS, KIT_GENRES } from "./kit";

describe("初期のテンプレート集", () => {
  const kit = defaultKit();
  it("部品とテンプレートのIDは重ならず、テンプレートの部品はすべてある", () => {
    expect(new Set(kit.parts.map(p => p.id)).size).toBe(kit.parts.length);
    expect(new Set(kit.tpls.map(t => t.id)).size).toBe(kit.tpls.length);
    kit.tpls.forEach(t => {
      t.parts.forEach(id => expect(kit.parts.some(p => p.id === id), t.name + " の " + id).toBe(true));
      t.opt.forEach(id => expect(t.parts).toContain(id));
    });
  });
  it("分類とジャンルは決まったものだけ。どの部品もどこかのテンプレートで使う", () => {
    kit.parts.forEach(p => expect(KIT_CATS).toContain(p.cat));
    kit.tpls.forEach(t => expect(KIT_GENRES).toContain(t.genre));
    kit.parts.forEach(p => expect(usedBy(kit, p.id).length, p.id).toBeGreaterThan(0));
  });
  it("すべてのテンプレートに埋める所があり、書式はチケットビルダーと同じ", () => {
    kit.tpls.forEach(t => {
      const text = assemble(partsOf(kit, t, t.opt));
      expect(holesOf(text), t.name).toBeGreaterThan(0);
      expect(text).not.toMatch(/^ {1,2}\S|^ {4,5}\S|^- /m);   /* 字下げは3文字、箇条書きは「* 」 */
    });
  });
  it("初期状態を取り出すたびに別のオブジェクト(編集しても初期の定義は変わらない)", () => {
    const a = defaultKit(); a.parts[0].body = "x";
    expect(defaultKit().parts[0].body).not.toBe("x");
  });
});

describe("本文の組み立て", () => {
  const p = (id: string, body: string) => ({ id, cat: "基本", name: id, body });
  it("箇条書きの続きはつなげ、見出しの前後は1行空ける。オフの部品は入れない", () => {
    const kit = { parts: [p("h", "## 受け入れ条件"), p("a", "* Aできること"), p("b", "* Bできること"), p("c", "## 参考情報\n\n* 【リンク】")], tpls: [] };
    const t = { id: "t", genre: "実装", name: "t", desc: "", title: "", parts: ["h", "a", "b", "c", "gone"], opt: [] };
    expect(assemble(partsOf(kit, t, []))).toBe("## 受け入れ条件\n\n* Aできること\n* Bできること\n\n## 参考情報\n\n* 【リンク】");
    expect(assemble(partsOf(kit, t, ["b"]))).toBe("## 受け入れ条件\n\n* Aできること\n\n## 参考情報\n\n* 【リンク】");
    expect(holesOf("【a】と【b】")).toBe(2);
  });
  it("保存されていた値を確かめる。形が違えば null", () => {
    expect(normalizeKit(null)).toBeNull();
    expect(normalizeKit({ parts: "x", tpls: [] })).toBeNull();
    expect(normalizeKit({ parts: [{ id: "a", body: 1 }, null], tpls: [{ id: "t", parts: ["a", 3] }] }))
      .toEqual({ parts: [{ id: "a", cat: "基本", name: "", body: "" }], tpls: [{ id: "t", genre: "その他", name: "", desc: "", title: "", parts: ["a"], opt: [] }] });
  });
});
