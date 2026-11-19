/* テンプレート集: 初期の部品・テンプレートの整合と、本文の組み立て */
import { describe, expect, it } from "vitest";
import { assemble, defaultKit, holesOf, insertIndex, mergeDefaults, normalizeKit, partsOf, usedBy, KIT_CATS, KIT_GENRES } from "./kit";

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

describe("初期のテンプレート集が増えたとき", () => {
  it("まだ知らない部品・テンプレートだけを足し、消したものは戻さない。手を入れていない部品は分類をそろえる", () => {
    const d = defaultKit();
    const old = { parts: d.parts.filter(p => !p.id.startsWith("file_")).map(p => (p.id === "ac_get" ? { ...p, cat: "受け入れ条件" } : p.id === "ac_update" ? { ...p, cat: "受け入れ条件", body: "直した" } : p)),
      tpls: d.tpls.filter(t => t.id !== "t_file_check" && t.id !== "t_bug") };
    const k = mergeDefaults(structuredClone(old));
    expect(k.parts.some(p => p.id === "file_ext")).toBe(true);
    expect(k.tpls.findIndex(t => t.id === "t_file_check")).toBe(d.tpls.findIndex(t => t.id === "t_file_check"));
    expect(k.parts.find(p => p.id === "ac_get")!.cat).toBe("データ操作");
    expect(k.parts.find(p => p.id === "ac_update")!.cat).toBe("受け入れ条件");
    /* seen があれば、消したもの(t_auth)は戻さない */
    const again = mergeDefaults({ ...structuredClone(k), tpls: k.tpls.filter(t => t.id !== "t_auth") });
    expect(again.tpls.some(t => t.id === "t_auth")).toBe(false);
  });
});

describe("部品を足す位置", () => {
  it("処理の部品は受け入れ条件の中(エラーの見出しの前)、そのエラーはエラーの中に入る", () => {
    const kit = defaultKit();
    const t = kit.tpls.find(x => x.id === "t_free")!;
    const add = (id: string) => t.parts.splice(insertIndex(kit, t, id), 0, id);
    add("auth_token"); add("ac_get"); add("file_download"); add("err_download_none"); add("err_auth_expired");
    expect(t.parts).toEqual(["feat", "story_sys", "flow", "ac_head", "auth_token", "file_download", "ac_get", "err_head", "err_download_none", "err_auth_expired", "test_unit", "deps", "refs"]);
  });
});
