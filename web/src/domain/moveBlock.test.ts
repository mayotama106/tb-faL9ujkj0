/* 部品の移動: 同じ並びの中、入れ子の中へ、入れ子の外へ */
import { describe, expect, it } from "vitest";
import { COMPONENTS } from "./components";
import { checkMove, moveBlock } from "./moveBlock";
import type { Values } from "./ticket";

const tree = (): Values => ({
  blocks: [
    { _k: "a", type: "do", name: "A" },
    { _k: "if", type: "if", name: "分岐", cases: [
      { _k: "c1", cond: "編集可能な", blocks: [{ _k: "b", type: "do", name: "B" }] },
      { _k: "c2", cond: "編集不可の", blocks: [] }] },
    { _k: "c", type: "do", name: "C" },
    { _k: "api", type: "api", name: "API" }
  ]
});
const names = (a: Values[]) => a.map(b => b._k);
const top = ["blocks"];

describe("部品の移動", () => {
  it("同じ並びの中で、前後に移す", () => {
    const v = tree();
    expect(checkMove(v, { path: top, index: 0 }, { path: top, index: 3 }, top, COMPONENTS)).toBeNull();
    moveBlock(v, { path: top, index: 0 }, { path: top, index: 3 });
    expect(names(v.blocks)).toEqual(["if", "c", "a", "api"]);
    moveBlock(v, { path: top, index: 2 }, { path: top, index: 0 });
    expect(names(v.blocks)).toEqual(["a", "if", "c", "api"]);
  });
  it("入れ子の中へ移す(空の場合にも入る)", () => {
    const v = tree();
    moveBlock(v, { path: top, index: 2 }, { path: ["blocks", 1, "cases", 1, "blocks"], index: 0 });
    expect(names(v.blocks)).toEqual(["a", "if", "api"]);
    expect(names(v.blocks[1].cases[1].blocks)).toEqual(["c"]);
    /* 前にある部品を、後ろの入れ子へ(抜いたぶん番号がずれても、正しい所に入る) */
    moveBlock(v, { path: top, index: 0 }, { path: ["blocks", 1, "cases", 0, "blocks"], index: 1 });
    expect(names(v.blocks)).toEqual(["if", "api"]);
    expect(names(v.blocks[0].cases[0].blocks)).toEqual(["b", "a"]);
  });
  it("入れ子の外へ移す", () => {
    const v = tree();
    moveBlock(v, { path: ["blocks", 1, "cases", 0, "blocks"], index: 0 }, { path: top, index: 0 });
    expect(names(v.blocks)).toEqual(["b", "a", "if", "c", "api"]);
    expect(v.blocks[2].cases[0].blocks).toEqual([]);
  });
  it("自分の中へは移せない。入れ物は直下にだけ置ける。同じ場所は何もしない", () => {
    const v = tree();
    expect(checkMove(v, { path: top, index: 1 }, { path: ["blocks", 1, "cases", 0, "blocks"], index: 0 }, top, COMPONENTS)).toMatch("自身の中");
    expect(checkMove(v, { path: top, index: 3 }, { path: ["blocks", 1, "cases", 1, "blocks"], index: 0 }, top, COMPONENTS)).toMatch("直下にだけ");
    expect(checkMove(v, { path: top, index: 1 }, { path: top, index: 2 }, top, COMPONENTS)).toBe("");
    /* 最後の部品を、同じ並びの末尾へ */
    expect(checkMove(v, { path: top, index: 3 }, { path: top, index: Number.MAX_SAFE_INTEGER }, top, COMPONENTS)).toBe("");
  });
});
