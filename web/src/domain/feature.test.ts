/* チケットの切り分け: 画面・処理 → イベント → チェック・ロジック。チェック・ロジック1つにつき1チケット、画面1つにつき「画面の作成」1チケット */
import { describe, expect, it } from "vitest";
import {
  buildFeature, cellsOf, compOf, docValues, entryLabel, errWhen, excelRows, EXCEL_HEADER, issuesOf, migrateFeature, newCell, newEntry, newItem,
  newStCell, relinkDocs, statusCount, stValues, ticketsOf, trigOf, type Feature, type FItem
} from "./feature";
import { GENRES } from "./genres";
import { buildTicket, type Values } from "./ticket";
import { buildXlsx, colName } from "./xlsx";

let n = 0;
const key = () => "k" + n++;
const item = (k: string, kind: FItem["kind"], name: string, layer: FItem["layer"], err: FItem["err"], errNote = ""): FItem =>
  ({ _k: k, kind, name, layer, err, errNote, cell: newCell() });
const base = (): Feature => ({
  id: "f", name: "書類のオンライン提出", goal: "書類をオンラインで提出できるようにしたい", createdAt: 0, updatedAt: 0,
  entries: [
    { _k: "e1", kind: "screen", name: "書類提出", cell: newCell(), events: [
      { _k: "v1", name: "保存ボタン押下", items: [
        item("i1", "check", "ファイル形式チェック", "front", "あり", "拡張子が.pdfでない"),
        item("i2", "logic", "書類の情報を登録", "be", "あり")] },
      { _k: "v2", name: "初期表示", items: [item("i3", "logic", "提出済みの書類を取得", "be", "なし")] }] },
    { _k: "e2", kind: "batch", name: "審査ステータス更新バッチ", events: [
      { _k: "v3", name: "毎日0時に起動", items: [item("i4", "logic", "審査結果を反映", "be", "")] }] }
  ]
});

describe("チケットの切り分け", () => {
  it("画面を足すと初期表示のイベントと「画面の作成」のチケットができる。チェックは CLIENT・BFF から始める", () => {
    const e = newEntry("screen", key);
    expect(e.events.map(ev => ev.name)).toEqual(["初期表示"]);
    expect(e.cell).toEqual({ on: true, status: "未着手" });
    expect(newEntry("batch", key).cell).toBeUndefined();
    expect(newItem("check", key).layer).toBe("front");
    expect(newItem("check", key, "batch").layer).toBe("be");
    expect(newItem("logic", key).cell).toEqual({ on: true, status: "未着手" });
  });
  it("チェック・ロジック1つにつき1チケット、画面1つにつき「画面の作成」1チケット", () => {
    const tks = ticketsOf(base());
    expect(tks.map(tk => tk.title)).toEqual([
      "【CLIENT】書類提出画面の作成",
      "【CLIENT・BFF】書類提出画面 保存ボタン押下：ファイル形式チェック",
      "【BE】書類提出画面 保存ボタン押下：書類の情報を登録",
      "【BE】書類提出画面 初期表示：提出済みの書類を取得",
      "【BE】審査ステータス更新バッチ 毎日0時に起動：審査結果を反映"]);
    expect(tks.map(tk => tk.lname)).toEqual(["CLIENT", "CLIENT・BFF", "BE", "BE", "BE"]);
  });
  it("チケットを外すと数えず、洗い出しに「チケットなし」と出す", () => {
    const f = base();
    f.entries[0].events[0].items[1].cell!.on = false;
    expect(ticketsOf(f)).toHaveLength(4);
    expect(buildFeature(f).text).toContain("書類の情報を登録［BE／エラーハンドリングあり］（チケットなし）");
  });
  it("名前の未記入、エラーハンドリングの未定、画面以外のチェック・ロジックのないイベントを確認事項にする", () => {
    const f = base();
    f.entries[1].events.push({ _k: "v4", name: "月末", items: [] });
    const iss = issuesOf(f).map(i => i.text);
    expect(iss).toContain("「審査結果を反映」（審査ステータス更新バッチ / 毎日0時に起動）：エラーハンドリングの有無が未定");
    expect(iss).toContain("審査ステータス更新バッチ / 月末にチェック・ロジックが1つもない");
    expect(iss).toHaveLength(2);
  });
  it("実施状況を数え、Excelの表は1チケット1行", () => {
    const f = base();
    f.entries[0].events[0].items[1].cell!.status = "完了";
    f.entries[0].cell!.title = "書類提出画面を作る";
    expect(statusCount(cellsOf(f))).toEqual({ 未着手: 4, 進行中: 0, レビュー中: 0, 完了: 1 });
    const rows = excelRows([f]);
    expect(rows[0]).toEqual(EXCEL_HEADER);
    expect(rows).toHaveLength(6);
    expect(rows[1]).toEqual(["1", "書類のオンライン提出", "画面", "書類提出画面", "画面の作成", "CLIENT", "書類提出画面を作る", "画面の表示と、イベントの受け付け（保存ボタン押下、初期表示）", "未着手"]);
    expect(rows[2]).toEqual(["2", "書類のオンライン提出", "画面", "書類提出画面", "保存ボタン押下", "CLIENT・BFF", "【CLIENT・BFF】書類提出画面 保存ボタン押下：ファイル形式チェック",
      "チェック：ファイル形式チェック\nエラーハンドリング：あり（拡張子が.pdfでない）", "未着手"]);
    expect(rows[3][8]).toBe("完了");
  });
  it("結果の本文に、洗い出しの木と、状況付きのチケット一覧を出す", () => {
    const f = base();
    f.entries[0].events[0].items[0].cell!.docId = "d1";
    const r = buildFeature(f, id => (id === "d1" ? 3 : null));
    expect(r.blocks.map(b => b.key)).toEqual(["parts", "split"]);
    expect(r.text).toContain("* ［バッチ・定期実行］審査ステータス更新バッチ\n   * 実行のきっかけ：毎日0時に起動\n      * ロジック：審査結果を反映［BE／エラーハンドリング未定］");
    expect(r.text).toContain("チケット5件（未着手5・進行中0・レビュー中0・完了0）");
    expect(r.text).toContain("2. ［未着手］【CLIENT・BFF】書類提出画面 保存ボタン押下：ファイル形式チェック（チケット本文：未記入3件）\n   * チェック：ファイル形式チェック\n   * エラーハンドリング：あり（拡張子が.pdfでない）");
  });
});

describe("切り分けから作るチケット本文", () => {
  const tk = (f: Feature, title: string) => ticketsOf(f).find(x => x.title.endsWith(title))!;
  it("ロジック1つのチケット: 名前から部品を選び、エラーハンドリングありならそのチケットの中でエラーも扱う", () => {
    const f = base();
    const v = docValues(f, tk(f, "書類の情報を登録"), key);
    expect(v.blocks.map((b: Values) => b.type)).toEqual(["create", "error"]);
    expect([v.feat_name, v.feat_part, v.scope_in]).toEqual(["書類のオンライン提出", "書類提出画面 / 保存ボタン押下 / 書類の情報を登録 / BE", ["書類の情報を登録"]]);
    expect(v.feat_ref).toEqual({ featureId: "f", entry: "e1", event: "v1", layer: "item", item: "i2" });
    const text = buildTicket(GENRES.impl, v).text;
    expect(text).toContain("## 保存ボタン押下処理\n### 処理の流れ\n\n1. 書類の情報を登録");
    expect(text).toContain("2. 書類の情報を登録でエラーになる場合はエラーを返却");
    expect(text).toContain("* 書類の情報を登録できること");
  });
  it("画面側のチェック1つのチケット: 画面作成のイベントの処理に入れ、画面全体の仕様は任意にする", () => {
    const f = base();
    const v = docValues(f, tk(f, "ファイル形式チェック"), key);
    const text = buildTicket(GENRES.impl, v).text;
    expect(text).toContain("   * 保存ボタン押下\n      * きっかけ：クリック\n      * 処理\n         1. ファイル形式チェック\n            * 拡張子が.pdfでない");
    expect(text).not.toContain("画面ID");
    expect(text).not.toContain("画面が表示されること");
    expect(text).not.toContain("正常に処理が完了した場合");
  });
  it("「画面の作成」のチケット: 初期表示以外のイベントを受け付けとして並べ、画面が表示されることを受け入れ条件にする", () => {
    const f = base();
    const text = buildTicket(GENRES.impl, docValues(f, tk(f, "書類提出画面の作成"), key)).text;
    expect(text).toContain("* 画面ID：【未記入】");
    expect(text).toContain("* イベント\n   * 保存ボタン押下\n      * きっかけ：クリック");
    expect(text).toContain("* 書類提出画面が表示されること");
  });
  it("エラーの「どんな場合？」と、きっかけの決め方、部品の選び方", () => {
    expect(errWhen({ _k: "i", kind: "check", name: "必須チェック", layer: "be", errNote: "未入力の項目がある" })).toBe("未入力の項目がある場合（必須チェック）");
    expect(errWhen({ _k: "i", kind: "check", name: "必須チェック", layer: "be", errNote: "締め処理中のとき" })).toBe("締め処理中のとき（必須チェック）");
    expect(errWhen({ _k: "i", kind: "logic", name: "住所を更新", layer: "be" })).toBe("住所を更新でエラーになる場合");
    expect(["変更ボタン押下", "初期表示", "郵便番号の入力", "毎日2時"].map(trigOf)).toEqual(["クリック", "画面の表示", "入力", "毎日2時"]);
    expect(["住所を更新", "履歴を登録", "住所を検索", "書類を削除", "メールを送信"].map(compOf)).toEqual(["update", "create", "get", "delete", "do"]);
  });
  it("画面の名前に「画面」が付いていても重ねない", () => {
    expect(entryLabel({ _k: "e", kind: "screen", name: "住所変更画面", events: [] })).toBe("住所変更画面");
    expect(entryLabel({ _k: "e", kind: "screen", name: "住所変更", events: [] })).toBe("住所変更画面");
  });
});

describe("前の形からの移し替え", () => {
  /* 前の形: イベント×開発領域で1チケット(ev.cells)。CLIENT と BFF はまとめていた */
  const old = {
    id: "f", name: "古い", entries: [{ _k: "e", kind: "screen", name: "住所変更", events: [{ _k: "v", name: "変更ボタン押下",
      cells: { client: { on: true, status: "進行中", docId: "d1" }, bff: { on: false }, be: { on: true, status: "完了", docId: "d2" }, err: { on: true } },
      items: [{ _k: "a", kind: "check", name: "必須チェック", layer: "bff", err: "あり" }, { _k: "b", kind: "logic", name: "住所を更新", layer: "be", err: "なし" },
        { _k: "c", kind: "logic", name: "メールを送信", layer: "be", err: "なし" }] }] }]
  };
  it("チェック・ロジックごとのチケットに移し、実施状況を引き継ぐ。チケット本文のつながりは最初の1つに移す", () => {
    const f = migrateFeature(old);
    const items = f.entries[0].events[0].items;
    expect(items.map(i => [i.layer, i.cell!.status, i.cell!.docId])).toEqual([["front", "進行中", "d1"], ["be", "完了", "d2"], ["be", "完了", undefined]]);
    expect(f.entries[0].cell).toEqual({ on: true, status: "未着手" });
    expect("cells" in f.entries[0].events[0]).toBe(false);
    expect(f.st).toEqual(newStCell());
  });
  it("チケット本文の側のつながりも、今の形に合わせる", () => {
    const f = migrateFeature(old);
    const docs = [{ id: "d1", v: { feat_ref: { featureId: "f", entry: "e", event: "v", layer: "client" } } }];
    relinkDocs([f], docs);
    expect(docs[0].v.feat_ref).toEqual({ featureId: "f", entry: "e", event: "v", layer: "item", item: "a" });
  });
});

describe("フィーチャー全体のST", () => {
  it("STのチケットは数に入り、Excelの最後の行になる。STチケットの入力値には画面・処理の一覧が入る", () => {
    const f = { ...base(), st: { ...newStCell(), status: "進行中" as const } };
    expect(cellsOf(f)).toHaveLength(6);
    const rows = excelRows([f]);
    expect(rows[rows.length - 1]).toEqual(["6", "書類のオンライン提出", "フィーチャー全体", "", "", "ST", "【ST】書類のオンライン提出のST実施", "", "進行中"]);
    const v = stValues(f);
    expect(v.content).toBe("書類提出画面（保存ボタン押下、初期表示）\n審査ステータス更新バッチ（毎日0時に起動）");
    expect(buildTicket(GENRES.st, v).text).toMatch(/^## 対象のフィーチャー\n\n\* フィーチャー：書類のオンライン提出\n\n## 実施概要/);
    expect(buildFeature(f).text).toContain("6. ［進行中］【ST】書類のオンライン提出のST実施");
  });
  it("バグチケットの対象のフィーチャーは任意。書いてあれば先頭に出す", () => {
    expect(buildTicket(GENRES.bug, {}).text).toMatch(/^## 概要/);
    expect(buildTicket(GENRES.bug, { feat_name: "住所変更", feat_part: "住所変更画面 / 変更ボタン押下 / BE" }).text)
      .toMatch(/^## 対象のフィーチャー\n\n\* フィーチャー：住所変更\n\* 対象：住所変更画面 \/ 変更ボタン押下 \/ BE\n\n## 概要/);
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
    expect(s).toContain('<autoFilter ref="A1:I6"/>');
    const end = bytes.length - 22;
    expect(new DataView(bytes.buffer).getUint32(end, true)).toBe(0x06054b50);
  });
});
