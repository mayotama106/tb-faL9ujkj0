/* チケットの切り分け: 起点 → イベント → 開発領域ごとのチケット、実施状況、Excelの表 */
import { describe, expect, it } from "vitest";
import { buildFeature, defaultCells, docValues, excelRows, EXCEL_HEADER, issuesOf, migrateFeature, newEntry, statusCount, ticketsOf, type Feature } from "./feature";
import { GENRES } from "./genres";
import { buildTicket } from "./ticket";
import { buildXlsx, colName } from "./xlsx";

let n = 0;
const key = () => "k" + n++;
const base = (): Feature => ({
  id: "f", name: "書類のオンライン提出", goal: "書類をオンラインで提出できるようにしたい", createdAt: 0, updatedAt: 0,
  entries: [
    { _k: "e1", kind: "screen", name: "書類提出", events: [
      { _k: "v1", name: "保存ボタン押下", cells: defaultCells("screen"), items: [
        { _k: "i1", kind: "check", name: "ファイル形式チェック", layer: "bff", err: "あり", errNote: "拡張子が.pdfでない" },
        { _k: "i2", kind: "logic", name: "書類の情報を登録", layer: "be", err: "あり" }] },
      { _k: "v2", name: "初期表示", cells: defaultCells("screen"), items: [{ _k: "i3", kind: "logic", name: "提出済みの書類を取得", layer: "be", err: "なし" }] }] },
    { _k: "e2", kind: "batch", name: "審査ステータス更新バッチ", events: [
      { _k: "v3", name: "毎日0時に起動", cells: defaultCells("batch"), items: [{ _k: "i4", kind: "logic", name: "審査結果を反映", layer: "be", err: "" }] }] }
  ]
});

describe("チケットの切り分け", () => {
  it("画面を足すと初期表示のイベントができ、CLIENT/BFF/BE/エラーハンドリングのチケットがそろう", () => {
    const e = newEntry("screen", key);
    expect(e.events.map(ev => ev.name)).toEqual(["初期表示"]);
    expect(Object.values(e.events[0].cells).every(c => c.on)).toBe(true);
    const b = newEntry("batch", key);
    expect(b.events[0].name).toBe("");
    expect(Object.entries(b.events[0].cells).filter(([, c]) => c.on).map(([l]) => l)).toEqual(["be", "err"]);
  });
  it("チケットはイベント×開発領域。エラーハンドリングのチケットには、ありのものが入る", () => {
    const tks = ticketsOf(base());
    expect(tks.map(tk => tk.title)).toEqual([
      "書類提出画面 保存ボタン押下(CLIENT)", "書類提出画面 保存ボタン押下(BFF)", "書類提出画面 保存ボタン押下(BE)", "書類提出画面 保存ボタン押下(エラーハンドリング)",
      "書類提出画面 初期表示(CLIENT)", "書類提出画面 初期表示(BFF)", "書類提出画面 初期表示(BE)", "書類提出画面 初期表示(エラーハンドリング)",
      "審査ステータス更新バッチ 毎日0時に起動(BE)", "審査ステータス更新バッチ 毎日0時に起動(エラーハンドリング)"]);
    expect(tks[3].items.map(it => it.name)).toEqual(["ファイル形式チェック", "書類の情報を登録"]);
    expect(tks[1].items.map(it => it.name)).toEqual(["ファイル形式チェック"]);
  });
  it("領域のチケットがないもの、エラーハンドリングが未定のものを確認事項にする", () => {
    const f = base();
    f.entries[0].events[0].cells.bff.on = false;
    const iss = issuesOf(f).map(i => i.text);
    expect(iss).toContain("審査ステータス更新バッチ / 毎日0時に起動 / 審査結果を反映のエラーハンドリングの有無が未定");
    expect(iss).toContain("書類提出画面 / 保存ボタン押下 / ファイル形式チェックはBFFで実装するが、BFFのチケットがない");
  });
  it("実施状況を数え、Excelの表は1チケット1行", () => {
    const f = base();
    f.entries[0].events[0].cells.be.status = "完了";
    f.entries[0].events[0].cells.client.title = "書類提出画面の保存";
    expect(statusCount(ticketsOf(f))).toEqual({ 未着手: 9, 進行中: 0, レビュー中: 0, 完了: 1 });
    const rows = excelRows([f]);
    expect(rows[0]).toEqual(EXCEL_HEADER);
    expect(rows).toHaveLength(11);
    expect(rows[1]).toEqual(["1", "書類のオンライン提出", "画面", "書類提出画面", "保存ボタン押下", "CLIENT", "書類提出画面の保存", "", "未着手"]);
    expect(rows[4]).toEqual(["4", "書類のオンライン提出", "画面", "書類提出画面", "保存ボタン押下", "エラーハンドリング", "書類提出画面 保存ボタン押下(エラーハンドリング)",
      "ファイル形式チェック: 拡張子が.pdfでない\n書類の情報を登録", "未着手"]);
    expect(rows[3][8]).toBe("完了");
  });
  it("チケットからビルダーのチケットを作ると、チェック・ロジックが部品になる", () => {
    const f = base();
    const tks = ticketsOf(f);
    const bff = buildTicket(GENRES.impl, docValues(f, tks[1], key)).text;
    expect(bff).toContain("保存ボタン押下のチェック");
    expect(bff).toContain("ファイル形式チェック");
    const client = buildTicket(GENRES.impl, docValues(f, tks[0], key)).text;
    expect(client).toContain("## 書類提出画面");
    const err = buildTicket(GENRES.impl, docValues(f, tks[3], key)).text;
    expect(err).toContain("ファイル形式チェック(拡張子が.pdfでない)の場合");
  });
  it("結果の本文に、洗い出しの木と、状況付きのチケット一覧を出す", () => {
    const f = base();
    f.entries[0].events[0].cells.client.docId = "d1";
    const r = buildFeature(f, id => (id === "d1" ? 3 : null));
    expect(r.blocks.map(b => b.key)).toEqual(["parts", "split"]);
    expect(r.text).toContain("* [バッチ・定期実行] 審査ステータス更新バッチ");
    expect(r.text).toContain("1. [未着手] 書類提出画面 保存ボタン押下(CLIENT)(ビルダー: 未記入 3)");
  });
  it("前の形のフィーチャーを読み込める", () => {
    const f = migrateFeature({ id: "x", name: "古い", tickets: [{ title: "a" }], scope_in: ["s"],
      entries: [{ _k: "e", kind: "api", name: "取得API", events: [{ _k: "v", name: "GET", items: [{ _k: "i", kind: "check", name: "入力", err: "あり" }] }] }] });
    expect(f.entries[0].events[0].cells.be.on).toBe(true);
    expect(f.entries[0].events[0].cells.client.on).toBe(false);
    expect(f.entries[0].events[0].items[0].layer).toBe("bff");
    expect("tickets" in f).toBe(false);
  });
});

describe("Excel", () => {
  it("列の名前", () => {
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });
  it("zipとして読める形で、シートと見出しが入る", () => {
    const bytes = buildXlsx(excelRows([base()]));
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    const s = new TextDecoder().decode(bytes);
    expect(s).toContain("xl/worksheets/sheet1.xml");
    expect(s).toContain("チケットタイトル");
    expect(s).toContain('<autoFilter ref="A1:I11"/>');
    /* 終端レコード */
    const end = bytes.length - 22;
    expect(new DataView(bytes.buffer).getUint32(end, true)).toBe(0x06054b50);
  });
});
