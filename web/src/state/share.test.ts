/* チケット・切り分けの受け渡し: 書き出し、読み込み、同じものがあるときの上書きと別に追加 */
import { describe, expect, it } from "vitest";
import { newCell, newStCell, type Feature } from "../domain/feature";
import { conflictsOf, mergePack, packText, parsePack } from "./share";
import type { Data, Doc } from "./store";

let n = 0;
const key = () => "new" + n++;
const doc = (id: string, title: string, extra = {}): Doc => ({ id, genre: "impl", v: { _impl: 1, title, ...extra }, createdAt: 1, updatedAt: 1 });
const feat = (id: string, docId?: string): Feature => ({
  id, name: "住所変更", goal: "", createdAt: 1, updatedAt: 1, st: newStCell(),
  entries: [{ _k: "e", kind: "screen", name: "住所変更", events: [{ _k: "v", name: "初期表示", items: [], cells: { front: { ...newCell(), docId }, err: newCell() } }] }]
});
const data = (): Data => ({ docs: [doc("d1", "画面の実装", { feat_ref: { featureId: "f1", entry: "e", event: "v", layer: "front" } }), doc("d2", "別のチケット")],
  features: [feat("f1", "d1")], templates: {}, comps: {} });

describe("受け渡し", () => {
  it("切り分けを書き出すと、つながっているチケット本文も入る", () => {
    const p = parsePack(packText(data(), [], ["f1"]));
    expect(p.features.map(f => f.id)).toEqual(["f1"]);
    expect(p.docs.map(d => d.id)).toEqual(["d1"]);
  });
  it("同じものがなければ、そのまま足す", () => {
    const p = parsePack(packText(data(), ["d2"], []));
    const to: Data = { docs: [], features: [], templates: {}, comps: {} };
    expect(conflictsOf(to, p).docs).toEqual([]);
    expect(mergePack(to, p, {}, key)).toEqual({ docs: 1, features: 0 });
    expect(to.docs[0].id).toBe("d2");
  });
  it("別に追加すると新しいIDになり、切り分けとチケット本文のつながりも付け替える", () => {
    const d = data();
    const p = parsePack(packText(d, [], ["f1"]));
    expect(conflictsOf(d, p).features.map(f => f.id)).toEqual(["f1"]);
    mergePack(d, p, { f1: "copy", d1: "copy" }, key);
    expect(d.features).toHaveLength(2);
    const nf = d.features[0], nd = d.docs[0];
    expect(nf.id).not.toBe("f1");
    expect(nf.name).toBe("住所変更（読み込み）");
    expect(nf.entries[0].events[0].cells!.front!.docId).toBe(nd.id);
    expect(nd.v.feat_ref.featureId).toBe(nf.id);
    /* 元のものは変わらない */
    expect(d.features[1].entries[0].events[0].cells!.front!.docId).toBe("d1");
  });
  it("上書きすると、同じ場所で置き換える", () => {
    const d = data();
    const other = data();
    other.docs[1].v.title = "直したタイトル";
    const p = parsePack(packText(other, ["d2"], []));
    mergePack(d, p, { d2: "overwrite" }, key);
    expect(d.docs.map(x => x.id)).toEqual(["d1", "d2"]);
    expect(d.docs[1].v.title).toBe("直したタイトル");
  });
  it("チケットビルダーのファイルでなければ、理由を返す。まるごとの書き出しからも取り出せる", () => {
    expect(() => parsePack("{")).toThrow("形式が正しくありません");
    expect(() => parsePack(JSON.stringify({ a: 1 }))).toThrow("チケットビルダーのファイルではありません");
    const full = JSON.stringify({ app: "ticket-builder", version: 1, items: { "ticket-builder:v2": JSON.stringify({ docs: [doc("x", "t")], features: [] }) } });
    expect(parsePack(full).docs.map(d => d.id)).toEqual(["x"]);
  });
});
