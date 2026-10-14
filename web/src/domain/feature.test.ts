/* フィーチャーの分解: 漏れ・ダブりの確認、チケット案、チケットビルダーのチケット */
import { describe, expect, it } from "vitest";
import { buildFeature, docValues, issuesOf, planTickets, unitsOf, type Feature } from "./feature";
import { GENRES } from "./genres";
import { buildTicket } from "./ticket";

let n = 0;
const key = () => "k" + n++;
const base = (): Feature => ({
  id: "f", name: "書類のオンライン提出", goal: "書類をオンラインで提出できるようにしたい", scope_in: ["アップロード"], scope_out: [],
  createdAt: 0, updatedAt: 0, tickets: [],
  entries: [
    { _k: "e1", kind: "screen", name: "書類提出", events: [
      { _k: "v1", name: "保存ボタン押下", items: [
        { _k: "i1", kind: "check", name: "ファイル形式チェック", err: "あり", errNote: "拡張子が.pdfでない" },
        { _k: "i2", kind: "logic", name: "書類の情報を登録", err: "あり" }] },
      { _k: "v2", name: "初期表示", items: [{ _k: "i3", kind: "logic", name: "提出済みの書類を取得", err: "なし" }] }] },
    { _k: "e2", kind: "batch", name: "審査ステータス更新バッチ", events: [
      { _k: "v3", name: "毎日0時に起動", items: [{ _k: "i4", kind: "logic", name: "審査結果を反映", err: "" }] }] }
  ]
});

describe("フィーチャーの分解", () => {
  it("割り当ての単位は、画面の表示と、チェック・ロジック1つずつ", () => {
    expect(unitsOf(base()).map(u => u.label)).toEqual([
      "書類提出画面の表示",
      "書類提出画面 / 保存ボタン押下 / チェック: ファイル形式チェック",
      "書類提出画面 / 保存ボタン押下 / ロジック: 書類の情報を登録",
      "書類提出画面 / 初期表示 / ロジック: 提出済みの書類を取得",
      "審査ステータス更新バッチ / 毎日0時に起動 / ロジック: 審査結果を反映"]);
  });
  it("エラーハンドリングの有無が未定のもの、未割当のものを確認事項にする", () => {
    const iss = issuesOf(base()).map(i => i.text);
    expect(iss).toContain("審査ステータス更新バッチ / 毎日0時に起動 / 審査結果を反映のエラーハンドリングの有無が未定");
    expect(iss.filter(x => x.startsWith("チケットに未割当"))).toHaveLength(5);
  });
  it("チケット案は、画面ごと・イベントごとに作り、STを1つ足す。全部が割り当て済みになる", () => {
    const f = planTickets(base(), key);
    expect(f.tickets.map(t => [t.title, t.kind])).toEqual([
      ["書類提出画面の作成", "impl"], ["書類提出画面 保存ボタン押下の処理", "impl"], ["書類提出画面 初期表示の処理", "impl"],
      ["審査ステータス更新バッチ 毎日0時に起動の処理", "impl"], ["書類のオンライン提出のST", "st"]]);
    expect(issuesOf(f).filter(i => i.part === "split")).toEqual([]);
    /* もう一度作っても、割り当て済みのものは変えない */
    expect(planTickets(f, key).tickets).toHaveLength(5);
  });
  it("チケット案からビルダーのチケットを作ると、構成要素が部品とスコープ内になる", () => {
    const f = planTickets(base(), key);
    const v = docValues(f, f.tickets[1], key);
    const text = buildTicket(GENRES.impl, v).text;
    expect(v.scope_in).toEqual(["書類提出画面 / 保存ボタン押下 / チェック: ファイル形式チェック", "書類提出画面 / 保存ボタン押下 / ロジック: 書類の情報を登録"]);
    expect(text).toContain(["## 保存ボタン押下処理", "### 処理の流れ", "", "1. 保存ボタン押下のチェック", "   * ファイル形式チェック",
      "      * 拡張子が.pdfでない", "2. 書類の情報を登録", "   1. 書類の情報を登録に失敗した場合はエラーを返却"].join("\n"));
    expect(text).toContain("* 保存ボタン押下のチェックがされていること\n   * ファイル形式チェックに引っかかる場合");
    const screen = buildTicket(GENRES.impl, docValues(f, f.tickets[0], key)).text;
    expect(screen).toContain("## 書類提出画面");
    expect(screen).toContain("* イベント\n   * 保存ボタン押下");
    expect(buildTicket(GENRES.st, docValues(f, f.tickets[4], key)).text).toContain("1. テストケース準備");
  });
  it("分解の結果に、構成要素の木とチケットごとの割り当てを出す", () => {
    const f = planTickets(base(), key);
    f.tickets[0].docId = "d1";
    const r = buildFeature(f, id => (id === "d1" ? 3 : null));
    expect(r.text).toContain("* [バッチ・定期実行] 審査ステータス更新バッチ\n   * 実行のきっかけ: 毎日0時に起動");
    expect(r.text).toContain("1. 書類提出画面の作成(実装・作成済み・未記入 3)\n   * 書類提出画面の表示");
    expect(r.blocks.map(b => b.key)).toEqual(["basic", "parts", "split"]);
  });
});
