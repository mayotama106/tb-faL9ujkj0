/* STチケット。受け入れ条件は実施手順と1対1で自動で作る */
import { describe, expect, it } from "vitest";
import { COMPONENTS, newBlock } from "./components";
import { GENRES } from "./genres";
import { buildTicket, type Values } from "./ticket";

let n = 0;
const key = () => "k" + n++;
const step = (type: string, extra: Values = {}) => ({ ...newBlock(COMPONENTS[type], key), ...extra });

const v: Values = {
  title: "ファイルアップロード機能のST",
  content: "ファイルアップロード機能の正常系・異常系をテストする",
  schedule: "準備 10/20〜10/21\n実施 10/22〜10/24",
  env: "ST環境",
  steps: [
    step("st_case", { scenario: "シナリオのリンク", store: "テストケースのリンク" }),
    step("st_account", { store: "アカウント情報のリンク" }),
    step("st_exec", { cases: "テストケースのリンク", proof: "証跡のリンク" })
  ],
  ac_extra: ["検出した不具合が起票されていること"]
};

const expected = `## 実施概要
### 内容

* ファイルアップロード機能の正常系・異常系をテストする

### スケジュール

* 準備 10/20〜10/21
* 実施 10/22〜10/24

### 実施環境

* ST環境

## 実施手順

1. テストケース準備
   * テストシナリオ：シナリオのリンク
   * テストケース格納先：テストケースのリンク
2. アカウント準備
   * アカウント情報格納先：アカウント情報のリンク
3. テストケースに沿った打鍵
   * テストケース：テストケースのリンク
   * 証跡格納先：証跡のリンク

## 受け入れ条件

* テストケースが準備され、格納されていること
* テスト用のアカウントが準備され、アカウント情報が格納されていること
* テストケースに沿った打鍵が完了し、証跡が格納されていること
* 検出した不具合が起票されていること`;

describe("STチケット", () => {
  it("実施概要・実施手順・受け入れ条件を出し、受け入れ条件は手順から作る", () => {
    const r = buildTicket(GENRES.st, v);
    expect(r.text).toBe(expected);
    expect(r.missing).toBe(0);
    expect(r.blocks.map(b => b.key)).toEqual(["basic", "steps", "ac"]);
  });
  it("リンクが空なら未記入。打鍵の手順を2つにすると、受け入れ条件も手順の名前ごとに2つになる", () => {
    const r = buildTicket(GENRES.st, { ...v, steps: [step("st_exec", { name: "正常系の打鍵" }), step("st_exec", { name: "異常系の打鍵", cases: "c", proof: "p" })] });
    expect(r.text).toContain("1. 正常系の打鍵\n   * テストケース：【未記入】\n   * 証跡格納先：【未記入】");
    expect(r.text).toContain("* 正常系の打鍵が完了し、証跡が格納されていること\n* 異常系の打鍵が完了し、証跡が格納されていること");
    expect(r.blocks.find(b => b.key === "steps")!.missing).toBe(2);
  });
  it("部品の受け入れ条件の文言を編集すると、本文に反映される", () => {
    const defs = { ...COMPONENTS, st_account: { ...COMPONENTS.st_account, ac: ["アカウントが払い出されていること"] } };
    expect(buildTicket(GENRES.st, v, defs).text).toContain("* アカウントが払い出されていること");
  });
  it("その他の手順は、受け入れ条件の欄に書けばそれを使い、空なら「〇〇が完了していること」にする", () => {
    const r = buildTicket(GENRES.st, { ...v, ac_extra: [], steps: [
      step("st_prep_other", { name: "テストデータ投入", detail: "100件投入する", link: "手順書" }),
      step("st_exec_other", { name: "性能測定", ac: "応答が3秒以内であること" })] });
    expect(r.text).toContain("1. テストデータ投入\n   * 100件投入する\n   * リンク：手順書\n2. 性能測定\n\n## 受け入れ条件");
    expect(r.text).toContain("* テストデータ投入が完了していること\n* 応答が3秒以内であること");
    expect(r.missing).toBe(0);
  });
  it("空のチケットでは各節に未記入を出す", () => {
    const r = buildTicket(GENRES.st, {});
    expect(r.blocks.every(b => b.missing > 0)).toBe(true);
  });
});
