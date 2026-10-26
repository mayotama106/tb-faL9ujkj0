/* API呼び出しチケット: 観点表に沿った入力から、雛形どおりの本文を作る */
import { describe, expect, it } from "vitest";
import { GENRES } from "./genres";
import { buildTicket, type Values } from "./ticket";

export const sample: Values = {
  title: "住所変更時の基幹システム住所更新APIの呼び出し（BE）",
  feat_name: "会員情報の住所変更", feat_part: "住所変更画面 / 変更ボタン押下 / BE",
  story_who: "会員", story_what: "住所変更の内容を、即時に基幹システムへ反映したい", story_why: "夜間バッチを待たずに、郵送物の送付先を正しくする",
  trigger: "住所変更画面で変更ボタンが押され、会員テーブルの住所の更新が完了したとき",
  pre: "郵便番号と住所1の形式をチェックする", pre_ng: "入力エラーを画面に表示", api_name: "基幹システムの住所更新API",
  use: "レスポンスの更新日時を会員テーブルに保存する", next: "変更完了画面を表示する",
  mode: "同期", order: "会員テーブルの更新の後に呼び出す",
  params: [{ name: "memberId", source: "ログイン中の会員ID" }, { name: "postalCode", source: "画面で入力された郵便番号" }],
  auth_what: "アクセストークン", auth_how: "共通の認証部品",
  ok_cond: "HTTPステータスが200、かつ resultCode が「0」",
  res_use: [{ item: "updatedAt", use: "会員テーブルの基幹更新日時に保存する" }],
  kind: "更新系", idem: "リクエストIDを付与し、同じIDの再送は呼び出し先で無視させる",
  errs: {
    e4: { sys: "リトライせず、WARNログを出力", msg: "入力内容をご確認ください" },
    e5: { sys: "1回リトライし、失敗したらERRORログを出力", msg: "時間をおいて再度お試しください" },
    biz: { sys: "リトライせず、WARNログを出力", msg: "住所を変更できませんでした" },
    timeout: { sys: "リトライせず、ERRORログを出力。夜間バッチで反映", msg: "変更を受け付けました（反映に時間がかかる場合があります）" },
    format: { sys: "リトライせず、ERRORログを出力", msg: "時間をおいて再度お試しください" }
  },
  biz_cond: "resultCode が 0 以外",
  t_conn: "3", t_read: "10", t_change: "設定で変更できる",
  retry: "する", retry_target: "5xx", retry_count: "1", retry_interval: "2",
  perf_range: "変更ボタン押下から変更完了画面の表示まで", perf_cond: "通常時", perf_sec: "3", perf_freq: "1日あたり最大1,000回", perf_rate: "毎秒10回まで",
  log_content: "リクエストID・HTTPステータス・処理時間", log_level: "INFO", log_mask_item: "postalCode", log_mask_how: "先頭3桁以外を * に置き換える",
  log_forbid: "アクセストークン・住所", sec_store: "AWS Secrets Manager", sec_enc: "HTTPS（TLS1.2以上）",
  hours: "毎日2時〜4時は計画停止のため、この時間帯は呼び出さずに夜間バッチで反映すること", monitor: "5xx が5分間に10回以上で、運用チームに通知すること",
  tests: [{ kind: "正常系", cond: "resultCode が 0", expect: "更新日時が会員テーブルに保存される" }, { kind: "境界値", cond: "住所2が空", expect: "住所2を空文字で送信する" }],
  spec_method: "PUT", spec_path: "/core/members/{memberId}/address", spec_ver: "v1.3", spec_headers: ["Authorization: Bearer {token}", "X-Request-Id"],
  spec_req: [{ name: "postalCode", type: "string", need: "○", desc: "郵便番号（ハイフンなし7桁）" }, { name: "address2", type: "string", need: "-", desc: "建物名など" }],
  spec_res: [{ name: "resultCode", type: "string", need: "○", desc: "0: 正常" }, { name: "updatedAt", type: "string", need: "○", desc: "更新日時（ISO 8601）" }],
  spec_codes: [{ code: "E1001", meaning: "会員が存在しない" }],
  dep_common: "ExternalApiClient", dep_example: "CoreMemberApiCaller", dep_target: "AddressService#update",
  test_env: "ST環境のみ提供あり", stub_env: "単体テストとローカル環境", stub_how: "WireMock", url_setting: "application.yml の core.api.base-url",
  proc: "FW開放申請", proc_ticket: "INFRA-123", pre_ticket_none: true,
  refs: [{ name: "住所更新API仕様書", where: "Confluence / 基幹連携 / API仕様" }]
};

const expected = `## 対象のフィーチャー

* フィーチャー：会員情報の住所変更
* 対象：住所変更画面 / 変更ボタン押下 / BE

## ストーリー

* 会員として、住所変更の内容を、即時に基幹システムへ反映したい。夜間バッチを待たずに、郵送物の送付先を正しくするためである。

## 処理フロー

1. 住所変更画面で変更ボタンが押され、会員テーブルの住所の更新が完了したとき
2. 郵便番号と住所1の形式をチェックする。NGの場合は入力エラーを画面に表示して終了し、APIは呼ばない
3. 基幹システムの住所更新APIを呼び出す
4. レスポンスを判定する。異常時は受け入れ条件「異常時の挙動」の表に従い、5以降へは進まない
5. レスポンスの更新日時を会員テーブルに保存する
6. 変更完了画面を表示する

## 受け入れ条件
### 機能要件

* 処理フロー3で、基幹システムの住所更新APIを同期で呼び出すこと
* 会員テーブルの更新の後に呼び出すこと
* リクエストの\`memberId\`には、ログイン中の会員IDを設定すること
* リクエストの\`postalCode\`には、画面で入力された郵便番号を設定すること
* 認証ヘッダには、共通の認証部品で取得したアクセストークンを付与すること
* HTTPステータスが200、かつ resultCode が「0」の場合のみ正常とみなすこと
* レスポンスの\`updatedAt\`を会員テーブルの基幹更新日時に保存すること
* リクエストIDを付与し、同じIDの再送は呼び出し先で無視させること
* 異常時の挙動は以下のとおりとすること

| No | 異常 | システムの挙動 | 利用者への表示 |
|---|---|---|---|
| 1 | 4xx | リトライせず、WARNログを出力 | 入力内容をご確認ください |
| 2 | 5xx | 1回リトライし、失敗したらERRORログを出力 | 時間をおいて再度お試しください |
| 3 | 業務エラー（resultCode が 0 以外） | リトライせず、WARNログを出力 | 住所を変更できませんでした |
| 4 | タイムアウト・通信断 | リトライせず、ERRORログを出力。夜間バッチで反映 | 変更を受け付けました（反映に時間がかかる場合があります） |
| 5 | レスポンス形式不正 | リトライせず、ERRORログを出力 | 時間をおいて再度お試しください |

### 非機能要件

* タイムアウトは接続3秒・読み取り10秒とし、設定で変更できるようにすること
* リトライは5xxに対して1回、間隔2秒とすること
* 変更ボタン押下から変更完了画面の表示までの応答時間は通常時で3秒以内とすること
* 呼び出し頻度は1日あたり最大1,000回を想定すること
* 呼び出し先のレート制限（毎秒10回まで）を超えないこと
* リクエストID・HTTPステータス・処理時間をINFOログに出力し、\`postalCode\`は先頭3桁以外を * に置き換えること
* アクセストークン・住所をログに出力しないこと
* 認証情報はAWS Secrets Managerで管理すること
* 通信はHTTPS（TLS1.2以上）で暗号化すること

### その他

* 毎日2時〜4時は計画停止のため、この時間帯は呼び出さずに夜間バッチで反映すること
* 5xx が5分間に10回以上で、運用チームに通知すること

## 完了の確認方法

* 以下に対応する単体テストを作成し、すべて成功すること
   * 正常系：resultCode が 0の場合に更新日時が会員テーブルに保存される
   * 境界値：住所2が空の場合に住所2を空文字で送信する
   * 異常時の挙動 No.1〜5 のそれぞれ
   * 前処理（郵便番号と住所1の形式をチェックする）がNGの場合に、APIが呼ばれない
   * ログ出力で、\`postalCode\`がマスキングされ、アクセストークン・住所が出力されない
* 既存の単体テストがすべて成功すること

## 呼び出し先API仕様（抜粋）

* エンドポイント：\`PUT /core/members/{memberId}/address\`（仕様書 v1.3）
* リクエストヘッダ：\`Authorization: Bearer {token}\`、\`X-Request-Id\`
* リクエストパラメータ

| 項目 | 型 | 必須 | 内容 |
|---|---|---|---|
| \`postalCode\` | string | ○ | 郵便番号（ハイフンなし7桁） |
| \`address2\` | string | - | 建物名など |

* レスポンス（正常時）

| 項目 | 型 | 必須 | 内容 |
|---|---|---|---|
| \`resultCode\` | string | ○ | 0: 正常 |
| \`updatedAt\` | string | ○ | 更新日時（ISO 8601） |

* 業務エラーコード：E1001（会員が存在しない）

## 依存関係・環境

* 参照すべき既存実装
   * 外部API呼び出しはExternalApiClientを使用し、独自のHTTPクライアントは作らない。呼び出し例は\`CoreMemberApiCaller\`を参照
   * 組み込み先は\`AddressService#update\`
* 呼び出し先テスト環境：ST環境のみ提供あり。単体テストとローカル環境ではWireMockを使用する
* 接続先URL：application.yml の core.api.base-urlで切り替え
* 事前手続き：FW開放申請（INFRA-123）の完了が前提
* 前提チケット：なし

## 参考情報

* 住所更新API仕様書（Confluence / 基幹連携 / API仕様）`;

describe("API呼び出しチケット", () => {
  it("観点表の要素をすべて埋めると、雛形どおりの本文になり、未記入はない", () => {
    const r = buildTicket(GENRES.call, sample);
    expect(r.text).toBe(expected);
    expect(r.missing).toBe(0);
    expect(r.blocks.map(b => b.key)).toEqual(["basic", "flow", "func", "nonfunc", "done", "spec", "deps"]);
  });
  it("前処理・後続処理がなければ手順を詰め、APIを呼ぶ手順の番号もずらす", () => {
    const text = buildTicket(GENRES.call, { ...sample, pre_none: true, next_none: true }).text;
    expect(text).toContain("1. 住所変更画面で変更ボタンが押され、会員テーブルの住所の更新が完了したとき\n2. 基幹システムの住所更新APIを呼び出す\n3. レスポンスを判定する。異常時は受け入れ条件「異常時の挙動」の表に従い、4以降へは進まない\n4. レスポンスの更新日時を会員テーブルに保存する\n\n");
    expect(text).toContain("* 処理フロー2で、");
    expect(text).not.toContain("前処理（");
  });
  it("空なら必須の要素を未記入として数え、該当しないものは「なし」と書く", () => {
    const r = buildTicket(GENRES.call, {});
    expect(r.blocks.every(b => b.missing > 0)).toBe(true);
    const n = buildTicket(GENRES.call, { ...sample, hours: "", hours_none: true, monitor: "", codes_none: true, proc_none: true, retry: "しない", retry_reason: "更新系で二重更新のおそれがあるため", kind: "参照系" });
    expect(n.text).toContain("### その他\n\n* なし");
    expect(n.text).toContain("* 業務エラーコード：なし");
    expect(n.text).toContain("* リトライはしないこと（更新系で二重更新のおそれがあるため）");
    expect(n.text).not.toContain("二重送信");
    expect(n.missing).toBe(0);
  });
});
