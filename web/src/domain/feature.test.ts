/* チケットの切り分け: 画面・処理 → イベント → チェック・ロジック。チェック・ロジック1つにつき1チケット、エラーハンドリングはイベントに1チケット */
import { describe, expect, it } from "vitest";
import {
  buildFeature, cellsOf, compOf, contentOf, docValues, entryLabel, errWhen, eventCells, excelRows, EXCEL_HEADER, issuesOf, migrateFeature, newCell, newEntry, newItem,
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
    { _k: "e1", kind: "screen", name: "書類提出", events: [
      { _k: "v1", name: "保存ボタン押下", cells: eventCells("screen"), items: [
        item("i1", "check", "ファイル形式チェック", "front", "あり", "拡張子が.pdfでない"),
        item("i2", "logic", "書類の情報を登録", "be", "あり"),
        item("i5", "logic", "書類の保存APIを作成", "be", "なし")] },
      { _k: "v2", name: "初期表示", cells: eventCells("screen"), items: [item("i3", "logic", "提出済みの書類を取得", "be", "なし")] }] },
    { _k: "e2", kind: "batch", name: "審査ステータス更新バッチ", events: [
      { _k: "v3", name: "毎日0時に起動", cells: eventCells("batch"), items: [item("i4", "logic", "審査結果を反映", "be", "")] }] }
  ]
});

describe("チケットの切り分け", () => {
  it("画面を足すと初期表示のイベントができ、エラーハンドリングのチケットが付く", () => {
    const e = newEntry("screen", key);
    expect(e.events.map(ev => ev.name)).toEqual(["初期表示"]);
    expect(Object.keys(e.events[0].cells!)).toEqual(["err"]);
    expect(Object.keys(newEntry("batch", key).events[0].cells!)).toEqual(["err"]);
    expect(newItem("check", key).layer).toBe("front");
    expect(newItem("check", key, "batch").layer).toBe("be");
  });
  it("チェック・ロジック1つにつき1枚(CLIENT・BFF も BE も「〇〇の△△処理の実装」)、エラーハンドリングはイベントに1枚", () => {
    const tks = ticketsOf(base());
    expect(tks.map(tk => tk.title)).toEqual([
      "【CLIENT・BFF】書類提出画面 保存ボタン押下のファイル形式チェック処理の実装",
      "【BE】書類提出画面 保存ボタン押下の書類の情報を登録処理の実装",
      "【BE】書類提出画面 保存ボタン押下の書類の保存APIを作成処理の実装",
      "【エラーハンドリング】書類提出画面 保存ボタン押下",
      "【BE】書類提出画面 初期表示の提出済みの書類を取得処理の実装",
      "【エラーハンドリング】書類提出画面 初期表示",
      "【BE】審査ステータス更新バッチ 毎日0時に起動の審査結果を反映処理の実装",
      "【エラーハンドリング】審査ステータス更新バッチ 毎日0時に起動"]);
    expect(tks[0].lname).toBe("CLIENT・BFF");
    expect(tks[3].items.map(it => it.name)).toEqual(["ファイル形式チェック", "書類の情報を登録"]);
    expect(contentOf(tks[3])).toEqual(["ファイル形式チェック（CLIENT・BFF）：拡張子が.pdfでない", "書類の情報を登録（BE）"]);
    /* チェック・ロジックのチケットには「ロジック：〇〇」を書かない。エラーハンドリングありだけ添える */
    expect(contentOf(tks[2])).toEqual([]);
    expect(contentOf(tks[0])).toEqual(["エラーハンドリング：あり（拡張子が.pdfでない）。エラーハンドリングのチケットで扱う"]);
  });
  it("名前が「〜処理」で終わるなら「処理」を重ねない", () => {
    const f = base();
    f.entries[0].events[1].items[0].name = "ああああ処理";
    expect(ticketsOf(f)[4].title).toBe("【BE】書類提出画面 初期表示のああああ処理の実装");
  });
  it("チケットを外すと数えない。エラーハンドリングのチケットがないものは確認事項にする", () => {
    const f = base();
    f.entries[0].events[0].items[2].cell!.on = false;
    f.entries[0].events[0].items[0].cell!.on = false;
    f.entries[0].events[0].cells!.err!.on = false;
    expect(ticketsOf(f)).toHaveLength(5);
    const iss = issuesOf(f).map(i => i.text);
    expect(iss).toContain("「書類の情報を登録」（書類提出画面 / 保存ボタン押下）：エラーハンドリングありだが、エラーハンドリングのチケットがない");
    expect(iss).toContain("「審査結果を反映」（審査ステータス更新バッチ / 毎日0時に起動）：エラーハンドリングの有無が未定");
  });
  it("実施状況を数え、Excelの表は1チケット1行", () => {
    const f = base();
    f.entries[0].events[0].items[1].cell!.status = "完了";
    f.entries[0].events[0].items[0].cell!.title = "保存ボタンの画面側";
    expect(statusCount(cellsOf(f))).toEqual({ 未着手: 7, 進行中: 0, レビュー中: 0, 完了: 1 });
    const rows = excelRows([f]);
    expect(rows[0]).toEqual(EXCEL_HEADER);
    expect(rows).toHaveLength(9);
    expect(rows[1]).toEqual(["1", "書類のオンライン提出", "画面", "書類提出画面", "保存ボタン押下", "CLIENT・BFF", "保存ボタンの画面側",
      "エラーハンドリング：あり（拡張子が.pdfでない）。エラーハンドリングのチケットで扱う", "未着手"]);
    expect(rows[2]).toEqual(["2", "書類のオンライン提出", "画面", "書類提出画面", "保存ボタン押下", "BE", "【BE】書類提出画面 保存ボタン押下の書類の情報を登録処理の実装",
      "エラーハンドリング：あり。エラーハンドリングのチケットで扱う", "完了"]);
    expect(rows[3][7]).toBe("");
    expect(rows[4][5]).toBe("エラーハンドリング");
    expect(rows[4][7]).toBe("ファイル形式チェック（CLIENT・BFF）：拡張子が.pdfでない\n書類の情報を登録（BE）");
  });
  it("結果の本文に、洗い出しの木と、状況付きのチケット一覧を出す", () => {
    const f = base();
    f.entries[0].events[0].items[1].cell!.docId = "d1";
    const r = buildFeature(f, id => (id === "d1" ? 3 : null));
    expect(r.blocks.map(b => b.key)).toEqual(["parts", "split"]);
    expect(r.text).toContain("* ［バッチ・定期実行］審査ステータス更新バッチ\n   * 実行のきっかけ：毎日0時に起動\n      * ロジック：審査結果を反映［BE／エラーハンドリング未定］");
    expect(r.text).toContain("チケット8件（未着手8・進行中0・レビュー中0・完了0）");
    expect(r.text).toContain("2. ［未着手］【BE】書類提出画面 保存ボタン押下の書類の情報を登録処理の実装（チケット本文：未記入3件）");
  });
});

describe("切り分けから作るチケット本文", () => {
  const tk = (f: Feature, title: string) => ticketsOf(f).find(x => x.title === title)!;
  it("BE のチケット: そのロジック1つを、名前から選んだ部品にする", () => {
    const f = base();
    const v = docValues(f, tk(f, "【BE】書類提出画面 保存ボタン押下の書類の情報を登録処理の実装"), key);
    expect(v.blocks.map((b: Values) => b.type)).toEqual(["create"]);
    expect(v.feat_part).toBe("書類提出画面 / 保存ボタン押下 / 書類の情報を登録 / BE");
    expect(v.feat_ref).toEqual({ featureId: "f", entry: "e1", event: "v1", layer: "item", item: "i2" });
    expect(buildTicket(GENRES.impl, v).text).toContain("* 書類の情報を登録できること\n   * 処理の流れ\n      1. 書類の情報を登録");
  });
  it("CLIENT・BFF のチケット: そのチェック・ロジック1つを画面作成の部品のイベントに入れる。最初のイベントは画面全体の仕様も書く", () => {
    const f = base();
    const v = docValues(f, tk(f, "【CLIENT・BFF】書類提出画面 保存ボタン押下のファイル形式チェック処理の実装"), key);
    expect(v.feat_part).toBe("書類提出画面 / 保存ボタン押下 / ファイル形式チェック / CLIENT・BFF");
    const text = buildTicket(GENRES.impl, v).text;
    expect(text).toContain("* 画面ID：【未記入】");
    expect(text).toContain("* イベント\n   * 保存ボタン押下\n      * きっかけ：クリック");
    expect(text).toContain("* ファイル形式チェックが行われていること\n   * 処理の流れ\n      1. ファイル形式チェック");
    expect(text).not.toContain("正常に処理が完了した場合");
  });
  it("初期表示の CLIENT・BFF のチケットは、処理を画面の初期表示に入れる", () => {
    const f = base();
    f.entries[0].events[1].items.push(item("i6", "check", "閲覧権限のチェック", "front", "なし"));
    const text = buildTicket(GENRES.impl, docValues(f, tk(f, "【CLIENT・BFF】書類提出画面 初期表示の閲覧権限のチェック処理の実装"), key)).text;
    expect(text).not.toContain("* イベント");
    expect(text).toContain("* 閲覧権限のチェックが行われていること\n   * 処理の流れ\n      1. 閲覧権限のチェック");
  });
  it("エラーハンドリングのチケット: ありのものを1つずつエラーハンドリングの部品にする", () => {
    const f = base();
    const text = buildTicket(GENRES.impl, docValues(f, tk(f, "【エラーハンドリング】書類提出画面 保存ボタン押下"), key)).text;
    expect(text).toContain("* 保存ボタン押下処理のエラーハンドリングが行われていること\n   * 拡張子が.pdfでない場合（ファイル形式チェック）");
    expect(text).toContain("   * 書類の情報を登録でエラーになる場合");
  });
  it("エラーの「どんな場合？」と、きっかけの決め方、部品の選び方", () => {
    expect(errWhen({ _k: "i", kind: "check", name: "必須チェック", layer: "be", errNote: "未入力の項目がある" })).toBe("未入力の項目がある場合（必須チェック）");
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
  it("イベント×開発領域の形から: エラーハンドリングは引き継ぎ、CLIENT・BFF と BE はチェック・ロジックごとに分けて状況を引き継ぐ", () => {
    const f = migrateFeature({ id: "f", name: "古い", entries: [{ _k: "e", kind: "screen", name: "住所変更", events: [{ _k: "v", name: "変更ボタン押下",
      cells: { client: { on: true, status: "進行中", docId: "d1" }, bff: { on: false }, be: { on: true, status: "完了", docId: "d2" }, err: { on: true, status: "レビュー中" } },
      items: [{ _k: "a", kind: "check", name: "必須チェック", layer: "bff", err: "あり" }, { _k: "b", kind: "logic", name: "住所を更新", layer: "be", err: "なし" },
        { _k: "c", kind: "logic", name: "メールを送信", layer: "be", err: "なし" }] }] }] });
    const ev = f.entries[0].events[0];
    expect(ev.cells).toEqual({ err: { on: true, status: "レビュー中" } });
    expect(ev.items.map(i => [i.layer, i.cell!.status, i.cell!.docId])).toEqual([["front", "進行中", "d1"], ["be", "完了", "d2"], ["be", "完了", undefined]]);
    const docs = [{ id: "d1", v: { feat_ref: { featureId: "f", entry: "e", event: "v", layer: "client" } } }, { id: "d2", v: { feat_ref: { featureId: "f", entry: "e", event: "v", layer: "be" } } }];
    relinkDocs([f], docs);
    expect(docs[0].v.feat_ref).toEqual({ featureId: "f", entry: "e", event: "v", layer: "item", item: "a" });
    expect(docs[1].v.feat_ref).toEqual({ featureId: "f", entry: "e", event: "v", layer: "item", item: "b" });
  });
  it("イベントの CLIENT・BFF の形から: CLIENT・BFF のチェック・ロジックそれぞれに移す。チケット本文は最初のものにだけ", () => {
    const f = migrateFeature({ id: "f", name: "古い", entries: [{ _k: "e", kind: "screen", name: "住所変更", events: [{ _k: "v", name: "変更ボタン押下",
      cells: { front: { on: true, status: "レビュー中", docId: "d1", title: "画面側" }, err: { on: true } },
      items: [{ _k: "a", kind: "check", name: "必須チェック", layer: "front", err: "なし", cell: { on: true } },
        { _k: "b", kind: "logic", name: "入力内容の保持", layer: "front", err: "なし", cell: { on: true } },
        { _k: "c", kind: "logic", name: "住所を更新", layer: "be", err: "なし", cell: { on: true, status: "完了", docId: "d2" } }] }] }] });
    const ev = f.entries[0].events[0];
    expect(ev.cells).toEqual({ err: { on: true, status: "未着手" } });
    expect(ev.items.map(i => i.cell)).toEqual([{ on: true, status: "レビュー中", docId: "d1" }, { on: true, status: "レビュー中" }, { on: true, status: "完了", docId: "d2" }]);
  });
  it("チェック・ロジックごとの形から: そのまま引き継ぐ", () => {
    const f = migrateFeature({ id: "f", name: "古い", entries: [{ _k: "e", kind: "screen", name: "住所変更", cell: { on: true, status: "完了" }, events: [{ _k: "v", name: "変更ボタン押下",
      items: [{ _k: "a", kind: "check", name: "必須チェック", layer: "client", err: "あり", cell: { on: true, status: "進行中", docId: "d1" } },
        { _k: "b", kind: "logic", name: "住所を更新", layer: "be", err: "なし", cell: { on: true, status: "完了" } }] }] }] });
    const ev = f.entries[0].events[0];
    expect(ev.items.map(i => [i.layer, i.cell!.status, i.cell!.docId])).toEqual([["front", "進行中", "d1"], ["be", "完了", undefined]]);
    expect("cell" in f.entries[0]).toBe(false);
  });
});

describe("フィーチャー全体のST", () => {
  it("STのチケットは数に入り、Excelの最後の行になる。STチケットの入力値には画面・処理の一覧が入る", () => {
    const f = { ...base(), st: { ...newStCell(), status: "進行中" as const } };
    expect(cellsOf(f)).toHaveLength(9);
    const rows = excelRows([f]);
    expect(rows[rows.length - 1]).toEqual(["9", "書類のオンライン提出", "フィーチャー全体", "", "", "ST", "【ST】書類のオンライン提出のST実施", "", "進行中"]);
    const v = stValues(f);
    expect(v.content).toBe("書類提出画面（保存ボタン押下、初期表示）\n審査ステータス更新バッチ（毎日0時に起動）");
    expect(buildTicket(GENRES.st, v).text).toMatch(/^## 対象のフィーチャー\n\n\* フィーチャー：書類のオンライン提出\n\n## 実施概要/);
    expect(buildFeature(f).text).toContain("9. ［進行中］【ST】書類のオンライン提出のST実施");
  });
  it("バグチケットの対象のフィーチャーは任意。書いてあれば先頭に出す", () => {
    expect(buildTicket(GENRES.bug, {}).text).toMatch(/^## 概要/);
    expect(buildTicket(GENRES.bug, { feat_name: "住所変更", feat_part: "住所変更画面 / 変更ボタン押下 / BE" }).text)
      .toMatch(/^## 対象のフィーチャー\n\n\* フィーチャー：住所変更\n\* 対象：住所変更画面 \/ 変更ボタン押下 \/ BE\n\n## 概要/);
  });
});

describe("Excel", () => {
  it("欠けたデータ(null)のある切り分けも読み込めて、書き出せる", () => {
    const f = migrateFeature({ id: "x", name: "欠け", entries: [{ kind: "screen", name: "画面", events: [{ name: "押下", items: [{ name: "a" }, null] }, null] }, null, 3] });
    expect(f.entries).toHaveLength(1);
    expect(f.entries[0].events[0].items.map(i => i.name)).toEqual(["a"]);
    const bytes = buildXlsx(excelRows([f]));
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });
  it("文字列でない値があっても、書き出せる", () => {
    const s = new TextDecoder().decode(buildXlsx([["a", "b"], [1 as unknown as string, undefined as unknown as string]]));
    expect(s).toContain('<t xml:space="preserve">1</t>');
  });
  it("列の名前", () => {
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });
  it("zipとして読める形で、シートと見出しが入る", () => {
    const bytes = buildXlsx(excelRows([base()]));
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    const s = new TextDecoder().decode(bytes);
    expect(s).toContain("xl/worksheets/sheet1.xml");
    expect(s).toContain("チケットタイトル");
    expect(s).toContain('<autoFilter ref="A1:I9"/>');
    const end = bytes.length - 22;
    expect(new DataView(bytes.buffer).getUint32(end, true)).toBe(0x06054b50);
  });
});
