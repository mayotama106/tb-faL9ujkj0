/* 部品の中身のエディタ: Markdown と行の並びの行き来 */
import { describe, expect, it } from "vitest";
import { KIT_PARTS } from "./kitDefaults";
import { parseLines, toMarkdown, type Line } from "./lines";

describe("行の並びと Markdown", () => {
  it("初期の部品は、読んで書き戻すと同じ Markdown になる", () => {
    KIT_PARTS.forEach(p => expect(toMarkdown(parseLines(p.body)), p.id).toBe(p.body));
  });
  it("見出し・箇条書き・番号付きの書式で書き戻す。番号は振り直し、空の本文の行は書かない", () => {
    const ls: Line[] = [
      { kind: "h2", level: 0, text: "受け入れ条件" },
      { kind: "bullet", level: 0, text: "【対象】を取得できること" },
      { kind: "bullet", level: 1, text: "条件：【キー】" },
      { kind: "num", level: 1, text: "取得する" },
      { kind: "num", level: 1, text: "返す" },
      { kind: "text", level: 0, text: "" },
      { kind: "h3", level: 0, text: "補足" },
      { kind: "text", level: 0, text: "文" }
    ];
    expect(toMarkdown(ls)).toBe("## 受け入れ条件\n\n* 【対象】を取得できること\n   * 条件：【キー】\n   1. 取得する\n   2. 返す\n\n### 補足\n\n文");
  });
  it("「- 」の箇条書きや字下げのずれも読める", () => {
    expect(parseLines("- a\n  - b\n#### 見出し\n|a|b|")).toEqual([
      { kind: "bullet", level: 0, text: "a" }, { kind: "bullet", level: 1, text: "b" },
      { kind: "h4", level: 0, text: "見出し" }, { kind: "table", level: 0, text: "|a|b|" }]);
  });
});
