/* 実装チケット(部品の組み合わせ)。見本のチケット(ファイルアップロード機能の構築)を部品で組み立てて確かめる */
import { describe, expect, it } from "vitest";
import { COMPONENTS, NA } from "./components";
import { GENRES } from "./genres";
import { collectAc } from "./impl";
import { buildTicket, type Values } from "./ticket";
import { toImpl } from "../state/migrateImpl";

const be = (status = "", code = "") => ({ display: "表示しない", status, code });
const chk = (name: string, err = be(), detail = "") => ({ name, detail, err });
const sample: Values = {
  title: "ファイルアップロード機能の構築（BE）",
  story_goal: "口座開設審査に必要な書類をオンラインでアップロードできる機能を提供したい",
  story_scope: "本チケットでは書類をアップロードする基本的な機能を実装する",
  story_refs: ["機能AのアップロードAPIを参照する（PUT：/account/applications/documents/:documentType）"],
  proc_name: "ファイルアップロード",
  blocks: [
    { type: "check", name: "アップロードファイルの業務チェック", ac: "ミドルウェアでバリデーションチェックがされていること", items: [
      chk("0バイトファイルチェック", be("400", "I009-00022")),
      chk("ファイルサイズ超過チェック"),
      chk("ファイル形式チェック", be("400", "I009-00012"), "拡張子が「.pdf」かどうか"),
      chk("ファイル名の存在チェック", be("400", "E001-00002")),
      chk("ファイルデータの存在チェック", be("400", "E001-00002"))] },
    { type: "check", name: "リクエストバリデーションチェック", ac: "", items: [
      chk("パスパラメータBの存在チェック", be("400", "E001-00002")),
      chk("パスパラメータBの13桁チェック", be("400", "E001-00002")),
      chk("ファイル存在チェック", be("400", "I009-00014"))] },
    { type: "get", name: "Xをキーにステータスを取得", target: "申込", cond: "申込ID", zero: { mode: "text", text: "対象なしとして扱う" } },
    { type: "if", name: "ステータスを元に編集可否をチェック", ac: "ステータスによる編集可否のチェックがされていること", cases: [
      { cond: "編集可能", none: true, blocks: [] },
      { cond: "編集不可", blocks: [{ type: "error", err: be() }] }] }
  ],
  deps: ["正式資材受領は11/17予定\nデザイン対応計画リンク"],
  branch: "開発ブランチはX面\nブランチ反映予定リンク"
};

const expected = `## ストーリー

* 口座開設審査に必要な書類をオンラインでアップロードできる機能を提供したい
* 本チケットでは書類をアップロードする基本的な機能を実装する
   * 機能AのアップロードAPIを参照する（PUT：/account/applications/documents/:documentType）

## ファイルアップロード処理
### 処理の流れ

1. アップロードファイルの業務チェック
   * 0バイトファイルチェック
   * ファイルサイズ超過チェック
   * ファイル形式チェック
      * 拡張子が「.pdf」かどうか
   * ファイル名の存在チェック
   * ファイルデータの存在チェック
2. リクエストバリデーションチェック
   * パスパラメータBの存在チェック
   * パスパラメータBの13桁チェック
   * ファイル存在チェック
3. Xをキーにステータスを取得
   * 取得元：申込
   * 条件：申込ID
   * 0件の場合：対象なしとして扱う
4. ステータスを元に編集可否をチェック
   * 編集可能であれば何もしない
   * 編集不可であればエラーを返却

## 受け入れ条件

* ミドルウェアでバリデーションチェックがされていること
   * 0バイトファイルチェックに引っかかる場合
      * HTTPステータス：400
      * エラーコード：I009-00022
   * ファイルサイズ超過チェックに引っかかる場合
      * HTTPステータス：【未記入】
      * エラーコード：【未記入】
   * ファイル形式チェックに引っかかる場合
      * HTTPステータス：400
      * エラーコード：I009-00012
   * ファイル名の存在チェックに引っかかる場合
      * HTTPステータス：400
      * エラーコード：E001-00002
   * ファイルデータの存在チェックに引っかかる場合
      * HTTPステータス：400
      * エラーコード：E001-00002
* リクエストバリデーションチェックがされていること
   * パスパラメータBの存在チェックに引っかかる場合
      * HTTPステータス：400
      * エラーコード：E001-00002
   * パスパラメータBの13桁チェックに引っかかる場合
      * HTTPステータス：400
      * エラーコード：E001-00002
   * ファイル存在チェックに引っかかる場合
      * HTTPステータス：400
      * エラーコード：I009-00014
* ステータスによる編集可否のチェックがされていること
   * 編集不可の場合
      * HTTPステータス：【未記入】
      * エラーコード：【未記入】
* 正常に処理が完了した場合
   * HTTPステータス：【未記入】

## 制約事項・技術的補足
### 依存関係

* 正式資材受領は11/17予定
   * デザイン対応計画リンク

### ブランチ

* 開発ブランチはX面
   * ブランチ反映予定リンク`;

describe("実装チケット", () => {
  it("見本のチケットを部品で組み立てると、見本と同じ形の本文になり、抜けを未記入として数える", () => {
    const r = buildTicket(GENRES.impl, sample);
    expect(r.text).toBe(expected);
    /* サイズ超過の2件、編集不可の2件、正常時のステータス1件 */
    expect(r.missing).toBe(5);
    expect(r.blocks.map(b => [b.key, b.missing])).toEqual([["basic", 0], ["build", 0], ["ac", 5], ["notes", 0]]);
  });

  it("空のチケットでは、各節に未記入を出す", () => {
    const r = buildTicket(GENRES.impl, {});
    expect(r.blocks.every(b => b.missing > 0)).toBe(true);
  });

  it("入れ物の部品は節になり、中の部品のエラーハンドリングが受け入れ条件になる", () => {
    const v: Values = { blocks: [{ type: "api", name: "書類アップロード", method: "PUT", endpoint: "/docs/:type", caller: "画面から",
      req_ref: true, req_link: "IF定義書", res_items: ["id: string"], res_need: ["id: 必須"],
      flow: [
        { type: "auth", name: "ログイン中か確認", how: "トークン", unauth: { display: "表示しない", status: "401", code: "E401", message: "" } },
        { type: "create", name: "書類を登録", target: "書類", items: ["種類", "ファイル"],
          dup: { mode: "text", text: "上書きする" }, fail: { mode: "error", err: { display: "モーダル", status: "500", code: "E500", message: "保存できません" } } }
      ] }] };
    const r = buildTicket(GENRES.impl, v);
    expect(r.text).toContain(["## 書類アップロードAPI", "### 仕様", "", "* メソッド：PUT", "* エンドポイント：/docs/:type", "* 呼び出しの起因・呼び出し元・タイミング：画面から",
      "* リクエストパラメータ", "   * 原典：IF定義書", "* レスポンス(正常時)", "   * 項目と型", "      * id: string"].join("\n"));
    expect(r.text).toContain(["### 処理の流れ", "", "1. ログイン中か確認", "   * 確認の方法：トークン", "2. 書類を登録", "   * 保存先：書類",
      "   * 保存する項目", "      * 種類", "      * ファイル", "   * 同じリクエストが届いた場合：上書きする", "   * 保存に失敗した場合：エラーモーダルを表示"].join("\n"));
    expect(r.text).toContain(["* ログイン中か確認", "   * 認証できない場合", "      * HTTPステータス：401", "      * エラーコード：E401",
      "* 書類を登録", "   * 保存に失敗した場合", "      * 表示：モーダル", "      * HTTPステータス：500", "      * エラーコード：E500", "      * エラーメッセージ：保存できません"].join("\n"));
    /* 任意の「権限がない場合」は空なので受け入れ条件に出さない */
    expect(r.text).not.toContain("権限がない場合");
  });

  it("「なし」の欄は出さず、画面の要素の入力不正は行の名前で受け入れ条件になる", () => {
    const v: Values = { blocks: [{ type: "screen", name: "書類提出", elements: [
      { name: "メールアドレス", kind: "入力", style: "標準", type: "文字列", cond: "常に", bad: { display: "その他", status: NA, code: NA, message: "形式が正しくありません", note: "欄の下に赤字" } }] }] };
    const ac = collectAc(COMPONENTS, v);
    expect(ac[0].lead).toBe("書類提出画面");
    expect(ac[0].cases[0].label).toBe("メールアドレスの入力が不正な場合");
    const r = buildTicket(GENRES.impl, v);
    expect(r.text).toContain(["   * メールアドレスの入力が不正な場合", "      * 表示：その他", "      * エラーメッセージ：形式が正しくありません", "      * 補足：欄の下に赤字"].join("\n"));
  });

  it("条件分岐の中の部品が複数なら入れ子にし、エラーハンドリングは場合の条件で受け入れ条件になる", () => {
    const r = buildTicket(GENRES.impl, { proc_name: "引き落とし", blocks: [{ type: "if", name: "残高を確認", cases: [
      { cond: "足りる", blocks: [{ type: "do", name: "引き落とす" }, { type: "do", name: "履歴を残す", detail: "取引IDを付ける" }] },
      { cond: "足りない", blocks: [{ type: "error", err: { display: "表示しない", status: "409", code: "E002-00001" } }] }] }] });
    expect(r.text).toContain(["1. 残高を確認", "   * 足りるであれば", "      * 引き落とす", "      * 履歴を残す",
      "         * 取引IDを付ける", "   * 足りないであればエラーを返却"].join("\n"));
    expect(r.text).toContain(["* 残高を確認", "   * 足りないの場合", "      * HTTPステータス：409"].join("\n"));
  });

  it("部品の定義を編集すると、本文の表記が変わる", () => {
    const defs = { ...COMPONENTS, get: { ...COMPONENTS.get, fields: COMPONENTS.get.fields.map(f => f.id === "target" ? { ...f, label: "参照テーブル" } : f) } };
    const r = buildTicket(GENRES.impl, { proc_name: "x", blocks: [{ type: "get", name: "取得", target: "申込" }] }, defs);
    expect(r.text).toContain("   * 参照テーブル：申込");
  });
});

describe("旧形式からの引き継ぎ", () => {
  it("処理の流れの形式(ロジック作成)を部品に移すと、同じ本文になる", () => {
    const old: Values = { _flow: 1, title: "t", story_goal: "g", proc_name: "p", flow: [
      { kind: "checks", text: "チェック", ac: "", items: [{ name: "a", detail: "", status: "400", code: "E1" }] },
      { kind: "if", text: "分岐", yes: "可", no: "不可", thenNone: true, then: [], else: [{ kind: "error", status: "403", code: "E2" }] }] };
    const r = buildTicket(GENRES.impl, toImpl("logic", old));
    expect(r.text).toContain(["1. チェック", "   * a", "2. 分岐", "   * 可であれば何もしない", "   * 不可であればエラーを返却"].join("\n"));
    expect(r.text).toContain(["* チェックがされていること", "   * aに引っかかる場合", "      * HTTPステータス：400", "      * エラーコード：E1"].join("\n"));
  });
  it("API作成の観点表を、API作成の部品とデータ操作の部品に移す", () => {
    const n = toImpl("api", { api_name: "振込先登録API", method: "POST", endpoint: "/payees", post_db: "振込先", post_dup_kind: "エラーモーダル",
      post_dup_eid: "E9", req_fmt_kind: "エラー画面", story: "s", nf_freq: "1日1回", func__etc: "メモ" });
    const api = n.blocks[0];
    expect([api.type, api.name, api.method, api.endpoint]).toEqual(["api", "振込先登録", "POST", "/payees"]);
    expect(api.flow.map((b: Values) => b.type)).toEqual(["check", "create", "do"]);
    expect(api.flow[1].dup).toEqual({ mode: "error", err: { display: "モーダル", status: "", code: "E9", message: "", note: "" } });
    expect([n.story_goal, n.nonfunc]).toEqual(["s", "呼び出し頻度: 1日1回"]);
  });
});
