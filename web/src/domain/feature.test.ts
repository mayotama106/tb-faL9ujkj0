/* チケットの切り分け: 起点 → イベント → 開発領域ごとのチケット、実施状況、Excelの表 */
import { describe, expect, it } from "vitest";
import { buildFeature, cellsOf, compOf, errWhen, trigOf, newStCell, stValues, defaultCells, entryLabel, newItem, docValues, excelRows, EXCEL_HEADER, issuesOf, migrateFeature, newEntry, statusCount, ticketsOf, type Feature } from "./feature";
import { GENRES } from "./genres";
import { buildTicket, type Values } from "./ticket";
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
  it("チケットはイベント×開発領域。CLIENT・BFF は既定で1チケット。エラーハンドリングのチケットには、ありのものが入る", () => {
    const tks = ticketsOf(base());
    expect(tks.map(tk => tk.title)).toEqual([
      "【CLIENT・BFF】書類提出画面 保存ボタン押下の実装", "【BE】書類提出画面 保存ボタン押下の実装", "【エラーハンドリング】書類提出画面 保存ボタン押下の実装",
      "【CLIENT・BFF】書類提出画面 初期表示の実装", "【BE】書類提出画面 初期表示の実装", "【エラーハンドリング】書類提出画面 初期表示の実装",
      "【BE】審査ステータス更新バッチ 毎日0時に起動の実装", "【エラーハンドリング】審査ステータス更新バッチ 毎日0時に起動の実装"]);
    expect(tks[2].items.map(it => it.name)).toEqual(["ファイル形式チェック", "書類の情報を登録"]);
    expect(tks[0].items.map(it => it.name)).toEqual(["ファイル形式チェック"]);
  });
  it("CLIENTとBFFを分けると、BFFのチケットが別になる", () => {
    const f = base();
    f.entries[0].events[0].split = true;
    const tks = ticketsOf(f).slice(0, 4);
    expect(tks.map(tk => tk.lname)).toEqual(["CLIENT", "BFF", "BE", "エラーハンドリング"]);
    expect(tks[0].items).toEqual([]);
    expect(tks[1].items.map(it => it.name)).toEqual(["ファイル形式チェック"]);
  });
  it("領域のチケットがないもの、エラーハンドリングが未定のものを確認事項にする", () => {
    const f = base();
    f.entries[0].events[0].cells.client.on = false;
    const iss = issuesOf(f).map(i => i.text);
    expect(iss).toContain("「審査結果を反映」（審査ステータス更新バッチ / 毎日0時に起動）：エラーハンドリングの有無が未定");
    expect(iss).toContain("「ファイル形式チェック」（書類提出画面 / 保存ボタン押下）：CLIENT・BFFで実装するが、CLIENT・BFFのチケットがない");
  });
  it("実施状況を数え、Excelの表は1チケット1行", () => {
    const f = base();
    f.entries[0].events[0].cells.be.status = "完了";
    f.entries[0].events[0].cells.client.title = "書類提出画面の保存";
    expect(statusCount(cellsOf(f))).toEqual({ 未着手: 7, 進行中: 0, レビュー中: 0, 完了: 1 });
    const rows = excelRows([f]);
    expect(rows[0]).toEqual(EXCEL_HEADER);
    expect(rows).toHaveLength(9);
    expect(rows[1]).toEqual(["1", "書類のオンライン提出", "画面", "書類提出画面", "保存ボタン押下", "CLIENT・BFF", "書類提出画面の保存", "チェック：ファイル形式チェック", "未着手"]);
    expect(rows[3]).toEqual(["3", "書類のオンライン提出", "画面", "書類提出画面", "保存ボタン押下", "エラーハンドリング", "【エラーハンドリング】書類提出画面 保存ボタン押下の実装",
      "ファイル形式チェック：拡張子が.pdfでない\n書類の情報を登録", "未着手"]);
    expect(rows[2][8]).toBe("完了");
  });
  it("チケットからビルダーのチケットを作ると、チェック・ロジックが部品になる", () => {
    const f = base();
    const tks = ticketsOf(f);
    const front = buildTicket(GENRES.impl, docValues(f, tks[0], key)).text;
    expect(front).toContain("## 書類提出画面");
    expect(front).toContain("ファイル形式チェック");
    const err = buildTicket(GENRES.impl, docValues(f, tks[2], key)).text;
    expect(err).toContain("1. 拡張子が.pdfでない場合（ファイル形式チェック）はエラーを返却\n2. 書類の情報を登録でエラーになる場合はエラーを返却");
    /* エラーハンドリングの受け入れ条件の見出しは文にする */
    expect(err).toContain("* 保存ボタン押下処理のエラーハンドリングが行われていること\n   * 拡張子が.pdfでない場合（ファイル形式チェック）");
    /* チェックが1つならその名前がチェック群の名前になり、ロジックは名前から部品を選ぶ(登録 → 登録の部品) */
    const be = docValues(f, tks[1], key);
    expect(be.blocks.map((b: Values) => b.type)).toEqual(["create"]);
    expect(docValues(f, tks[0], key).blocks[0].events[0].steps[0].name).toBe("ファイル形式チェック");
  });
  it("作ったチケットには、フィーチャーのどの部分かが入る", () => {
    const f = base();
    const tk = ticketsOf(f)[1];
    const v = docValues(f, tk, key);
    expect([v.feat_name, v.feat_part]).toEqual(["書類のオンライン提出", "書類提出画面 / 保存ボタン押下 / BE"]);
    expect(v.feat_ref).toEqual({ featureId: "f", entry: "e1", event: "v1", layer: "be" });
    expect(v.scope_in).toEqual(["書類の情報を登録"]);
    expect(buildTicket(GENRES.impl, v).text).toContain("## 対象のフィーチャー\n\n* フィーチャー：書類のオンライン提出\n* 対象：書類提出画面 / 保存ボタン押下 / BE");
  });
  it("結果の本文に、洗い出しの木と、状況付きのチケット一覧を出す", () => {
    const f = base();
    f.entries[0].events[0].cells.client.docId = "d1";
    const r = buildFeature(f, id => (id === "d1" ? 3 : null));
    expect(r.blocks.map(b => b.key)).toEqual(["parts", "split"]);
    expect(r.text).toContain("* ［バッチ・定期実行］審査ステータス更新バッチ\n   * 実行のきっかけ：毎日0時に起動\n      * ロジック：審査結果を反映［BE／エラーハンドリング未定］");
    expect(r.text).toContain("チケット8件（未着手8・進行中0・レビュー中0・完了0）");
    expect(r.text).toContain("1. ［未着手］【CLIENT・BFF】書類提出画面 保存ボタン押下の実装（チケット本文：未記入3件）");
  });
  it("前の形のフィーチャーを読み込める", () => {
    const f = migrateFeature({ id: "x", name: "古い", tickets: [{ title: "a" }], scope_in: ["s"],
      entries: [{ _k: "e", kind: "api", name: "取得API", events: [{ _k: "v", name: "GET", items: [{ _k: "i", kind: "check", name: "入力", err: "あり" }] }] }] });
    expect(f.entries[0].events[0].cells.be.on).toBe(true);
    expect(f.entries[0].events[0].cells.client.on).toBe(false);
    expect(f.entries[0].events[0].items[0].layer).toBe("bff");
    expect(f.entries[0].events[0].split).toBe(false);
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
    expect(s).toContain('<autoFilter ref="A1:I9"/>');
    /* 終端レコード */
    const end = bytes.length - 22;
    expect(new DataView(bytes.buffer).getUint32(end, true)).toBe(0x06054b50);
  });
});

describe("名前と部品の推定", () => {
  it("画面の名前に「画面」が付いていても重ねない", () => {
    expect(entryLabel({ _k: "e", kind: "screen", name: "住所変更画面", events: [] })).toBe("住所変更画面");
    expect(entryLabel({ _k: "e", kind: "screen", name: "住所変更", events: [] })).toBe("住所変更画面");
  });
  it("ロジックの名前から部品を選ぶ", () => {
    expect(["住所を更新", "履歴を登録", "住所を検索", "書類を削除", "メールを送信"].map(compOf)).toEqual(["update", "create", "get", "delete", "do"]);
  });
  it("画面を介さない処理のチェックは BE から始める", () => {
    expect(newItem("check", key, "batch").layer).toBe("be");
    expect(newItem("check", key).layer).toBe("bff");
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
  it("前の形のフィーチャーには、STのチケットを足す", () => {
    expect(migrateFeature({ id: "x", name: "a", entries: [] }).st).toEqual({ on: true, status: "未着手" });
  });
  it("バグチケットの対象のフィーチャーは任意。書いてあれば先頭に出す", () => {
    expect(buildTicket(GENRES.bug, {}).text).toMatch(/^## 概要/);
    expect(buildTicket(GENRES.bug, { feat_name: "住所変更", feat_part: "住所変更画面 / 変更ボタン押下 / BE" }).text)
      .toMatch(/^## 対象のフィーチャー\n\n\* フィーチャー：住所変更\n\* 対象：住所変更画面 \/ 変更ボタン押下 \/ BE\n\n## 概要/);
  });
});

describe("切り分けから作るチケット本文", () => {
  it("画面のチケット: きっかけはイベント名から入り、チェック1つなら名前を重ねない。正常時のHTTPステータスは任意", () => {
    const f = base();
    const v = docValues(f, ticketsOf(f)[0], key);   /* 保存ボタン押下(最初のイベント)の CLIENT・BFF */
    const text = buildTicket(GENRES.impl, v).text;
    expect(text).toContain("      * きっかけ：クリック\n      * 処理\n         1. ファイル形式チェック\n\n");
    expect(text).not.toContain("正常に処理が完了した場合");
    expect(text).toContain("* 書類提出画面が表示されること");
  });
  it("初期表示のチケットは、処理を画面の初期表示に入れ、イベントは任意にする", () => {
    const f = base();
    f.entries[0].events[1].items[0].layer = "client";
    const tk = ticketsOf(f).find(x => x.event.name === "初期表示" && x.layer === "client")!;
    const r = buildTicket(GENRES.impl, docValues(f, tk, key));
    expect(r.text).toContain("### 初期表示\n\n1. 提出済みの書類を取得");
    expect(r.text).not.toContain("* イベント");
    expect(r.text).toContain("* 書類提出画面が表示されること");
  });
  it("最初のイベント以外の画面のチケットは、画面全体の仕様を任意にし、画面の受け入れ条件を作らない", () => {
    const f = base();
    f.entries[0].events.reverse();   /* 初期表示を先に、保存ボタン押下を2つ目に */
    const tk = ticketsOf(f).find(x => x.event.name === "保存ボタン押下" && x.layer === "client")!;
    const r = buildTicket(GENRES.impl, docValues(f, tk, key));
    expect(r.text).not.toContain("画面ID");
    expect(r.text).not.toContain("画面が表示されること");
    expect(r.text).toContain("   * 保存ボタン押下\n      * きっかけ：クリック");
  });
  it("エラーの「どんな場合？」と、きっかけの決め方", () => {
    expect(errWhen({ _k: "i", kind: "check", name: "必須チェック", layer: "be", errNote: "未入力の項目がある" })).toBe("未入力の項目がある場合（必須チェック）");
    expect(errWhen({ _k: "i", kind: "check", name: "必須チェック", layer: "be", errNote: "締め処理中のとき" })).toBe("締め処理中のとき（必須チェック）");
    expect(errWhen({ _k: "i", kind: "logic", name: "住所を更新", layer: "be" })).toBe("住所を更新でエラーになる場合");
    expect(["変更ボタン押下", "初期表示", "郵便番号の入力", "毎日2時"].map(trigOf)).toEqual(["クリック", "画面の表示", "入力", "毎日2時"]);
  });
});
