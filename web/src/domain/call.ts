/* API呼び出しチケットの本文。外部・他システムのAPIを呼び出す処理の実装チケット。
   呼び出し先は制御できないので、異常時の挙動・テスト環境・外部仕様を明記させる(観点表に沿う)。
   処理フローは順序と分岐まで。異常時の挙動は受け入れ条件の表にだけ書き、処理フローでは参照する。

   チケットの入力値:
     title, feat_name, feat_part, feat_ref                         タイトル・対象のフィーチャー
     story_who, story_what, story_why                               ストーリー
     trigger, pre, pre_none, pre_ng, api_name, use, next, next_none 処理フロー
     mode, order, params[{name, source}], auth_none, auth_how, auth_what,
     ok_cond, res_use[{item, use}], kind, idem, errs{e4,e5,biz,timeout,format: {sys, msg}}, biz_cond, errs_extra[{kind, sys, msg}]
                                                                    機能要件
     t_conn, t_read, t_change, retry, retry_target, retry_count, retry_interval, retry_reason,
     perf_range, perf_cond, perf_sec, perf_freq, perf_rate, log_content, log_level, log_mask_item, log_mask_how, log_forbid,
     sec_store, sec_enc, hours, hours_none, monitor                 非機能要件・その他
     tests[{kind, cond, expect}]                                    完了の確認方法
     spec_method, spec_path, spec_ver, spec_headers[], spec_req[{name, type, need, desc}], spec_res[...], spec_codes[{code, meaning}], codes_none
                                                                    呼び出し先API仕様(抜粋)
     dep_common, dep_example, dep_target, test_env, stub_env, stub_how, url_setting,
     proc, proc_ticket, proc_none, pre_ticket, pre_ticket_no, pre_ticket_none, refs[{name, where}]
                                                                    依存関係・環境・参考情報 */
import { MISSING, type Genre } from "./genres";
import { toKoto } from "./impl";
import { headsOf, listItems, type Block, type Ticket, type Values } from "./ticket";

const t = (s: unknown) => (typeof s === "string" ? s : "").trim();
const arr = (x: unknown): Values[] => (Array.isArray(x) ? x : []);
const noEnd = (s: string) => s.replace(/[。．.]+$/, "");
const NONE = "なし";

/* 異常時の挙動の表の、決まった5行(観点表の最低限の5分類) */
export const ERR_ROWS: { id: string; label: string }[] = [
  { id: "e4", label: "4xx" },
  { id: "e5", label: "5xx" },
  { id: "biz", label: "業務エラー" },
  { id: "timeout", label: "タイムアウト・通信断" },
  { id: "format", label: "レスポンス形式不正" }
];
export const MODES = ["同期", "非同期"];
export const KINDS = ["参照系", "更新系"];
export const T_CHANGE: Record<string, string> = { "設定で変更できる": "設定で変更できるようにすること", "変更できない": "変更できないこと" };
export const RETRY = ["する", "しない"];
export const TEST_KINDS = ["正常系", "境界値", "異常系"];

export function buildCallTicket(g: Genre, v: Values): Ticket {
  const h = headsOf(g);
  let missing = 0;
  const miss = () => { missing++; return MISSING; };
  const req = (s: unknown) => t(s) || miss();
  const b = (d: number, s: string) => " ".repeat(3 * d) + "* " + s;
  const code = (s: unknown) => (t(s) ? "`" + t(s) + "`" : "`" + miss() + "`");
  const cell = (s: unknown) => (t(s) || miss()).replace(/\|/g, "\\|").replace(/\n/g, "<br>");

  const blocks: Block[] = [];
  const block = (key: string, make: () => string[]) => {
    const before = missing;
    const lines = make();
    blocks.push({ key, lines, missing: missing - before });
  };

  /* 処理フローの手順。前処理と後続処理は「なし」にできる(番号は詰める) */
  const hasPre = !v.pre_none, hasNext = !v.next_none;
  const api = () => t(v.api_name) || MISSING;
  const callNo = hasPre ? 3 : 2;

  block("basic", () => {
    if (!t(v.title)) missing++;
    const why = noEnd(t(v.story_why));
    const story = noEnd(req(v.story_who)) + "として、" + noEnd(req(v.story_what)) + "。" +
      (why ? (/ためである$/.test(why) ? why : /ため$/.test(why) ? why + "である" : why + "ためである") : miss() + "ためである") + "。";
    return ["## " + h.feature, "", b(0, "フィーチャー：" + req(v.feat_name)), b(0, "対象：" + req(v.feat_part)),
      "", "## " + h.story, "", b(0, story)];
  });

  block("flow", () => {
    const steps: string[] = [noEnd(req(v.trigger))];
    if (hasPre) steps.push(noEnd(req(v.pre)) + "。NGの場合は" + noEnd(req(v.pre_ng)) + "して終了し、APIは呼ばない");
    steps.push(noEnd(req(v.api_name)) + "を呼び出す");
    /* 異常時はレスポンスを使う手順(次の手順)以降へ進まない。後続処理の文を「〜へ」につなげると不自然なので、手順の番号で指す */
    steps.push("レスポンスを判定する。異常時は受け入れ条件「" + h.callErr + "」の表に従い、" + (steps.length + 2) + "以降へは進まない");
    steps.push(noEnd(req(v.use)));
    if (hasNext) steps.push(noEnd(req(v.next)));
    return ["", "## " + h.callFlow, "", ...steps.map((s, i) => (i + 1) + ". " + s)];
  });

  block("func", () => {
    const out = ["", "## " + h.ac, "### " + h.func, ""];
    out.push(b(0, "処理フロー" + callNo + "で、" + api() + "を" + req(v.mode) + "で呼び出すこと"));
    if (t(v.order)) out.push(b(0, toKoto(t(v.order))));
    const params = arr(v.params).filter(p => t(p.name) || t(p.source));
    if (params.length) params.forEach(p => out.push(b(0, "リクエストの" + code(p.name) + "には、" + req(p.source) + "を設定すること")));
    else out.push(b(0, "リクエストの組み立て：" + miss()));
    if (v.auth_none) out.push(b(0, "認証情報は付与しないこと（呼び出し先は認証不要）"));
    else out.push(b(0, "認証ヘッダには、" + req(v.auth_how) + "で取得した" + req(v.auth_what) + "を付与すること"));
    out.push(b(0, noEnd(req(v.ok_cond)) + "の場合のみ正常とみなすこと"));
    const uses = arr(v.res_use).filter(r => t(r.item) || t(r.use));
    if (uses.length) uses.forEach(r => out.push(b(0, "レスポンスの" + code(r.item) + "を" + (t(r.use) ? toKoto(t(r.use)) : miss()))));
    else out.push(b(0, "レスポンスの使い方：" + miss()));
    if (!t(v.kind)) out.push(b(0, "参照系か更新系か：" + miss()));
    else if (v.kind === "更新系") out.push(b(0, t(v.idem) ? toKoto(t(v.idem)) : "二重送信の防止方法：" + miss()));
    out.push(b(0, h.callErr + "は以下のとおりとすること"), "", "| No | 異常 | システムの挙動 | 利用者への表示 |", "|---|---|---|---|");
    const errs: Values = v.errs || {};
    const rows = ERR_ROWS.map(r => ({ label: r.id === "biz" ? "業務エラー（" + (t(v.biz_cond) || miss()) + "）" : r.label, e: errs[r.id] || {} }))
      .concat(arr(v.errs_extra).filter(x => t(x.kind) || t(x.sys) || t(x.msg)).map(x => ({ label: t(x.kind) || miss(), e: x })));
    rows.forEach((r, i) => out.push("| " + (i + 1) + " | " + r.label + " | " + cell(r.e.sys) + " | " + cell(r.e.msg) + " |"));
    return out;
  });

  block("nonfunc", () => {
    const out = ["", "### " + h.nonfunc, ""];
    out.push(b(0, "タイムアウトは接続" + req(v.t_conn) + "秒・読み取り" + req(v.t_read) + "秒とし、" + (T_CHANGE[t(v.t_change)] || "設定変更の可否：" + miss())));
    if (v.retry === "しない") out.push(b(0, "リトライはしないこと" + (t(v.retry_reason) ? "（" + noEnd(t(v.retry_reason)) + "）" : "")));
    else if (v.retry === "する") out.push(b(0, "リトライは" + req(v.retry_target) + "に対して" + req(v.retry_count) + "回、間隔" + req(v.retry_interval) + "秒とすること"));
    else out.push(b(0, "リトライするか：" + miss()));
    out.push(b(0, req(v.perf_range) + "の応答時間は" + req(v.perf_cond) + "で" + req(v.perf_sec) + "秒以内とすること"));
    out.push(b(0, "呼び出し頻度は" + noEnd(req(v.perf_freq)) + "を想定すること"));
    if (t(v.perf_rate)) out.push(b(0, "呼び出し先のレート制限（" + noEnd(t(v.perf_rate)) + "）を超えないこと"));
    const log = req(v.log_content) + "を" + req(v.log_level) + "ログに出力";
    out.push(b(0, t(v.log_mask_item) ? log + "し、" + code(v.log_mask_item) + "は" + (t(v.log_mask_how) ? toKoto(t(v.log_mask_how)) : miss()) : log + "すること"));
    out.push(b(0, req(v.log_forbid) + "をログに出力しないこと"));
    out.push(b(0, "認証情報は" + req(v.sec_store) + "で管理すること"));
    out.push(b(0, "通信は" + req(v.sec_enc) + "で暗号化すること"));
    out.push("", "### " + h.other, "");
    const other: string[] = [];
    if (!v.hours_none) other.push(b(0, t(v.hours) || "呼び出し先の利用可能時間帯：" + miss()));
    if (t(v.monitor)) other.push(b(0, t(v.monitor)));
    out.push(...(other.length ? other : [b(0, NONE)]));
    return out;
  });

  block("done", () => {
    const out = ["", "## " + h.callDone, "", b(0, "以下に対応する単体テストを作成し、すべて成功すること")];
    const tests = arr(v.tests).filter(x => t(x.cond) || t(x.expect));
    if (!tests.some(x => x.kind === "正常系" || !t(x.kind))) out.push(b(1, "正常系：" + miss()));
    tests.forEach(x => out.push(b(1, (t(x.kind) || "正常系") + "：" + req(x.cond) + "の場合に" + noEnd(req(x.expect)))));
    const n = ERR_ROWS.length + arr(v.errs_extra).filter(x => t(x.kind) || t(x.sys) || t(x.msg)).length;
    out.push(b(1, h.callErr + " No.1〜" + n + " のそれぞれ"));
    if (hasPre) out.push(b(1, "前処理（" + (noEnd(t(v.pre)) || MISSING) + "）がNGの場合に、APIが呼ばれない"));
    const forbid = t(v.log_forbid) || MISSING;
    out.push(b(1, "ログ出力で、" + (t(v.log_mask_item) ? "`" + t(v.log_mask_item) + "`がマスキングされ、" : "") + forbid + "が出力されない"));
    out.push(b(0, "既存の単体テストがすべて成功すること"));
    return out;
  });

  block("spec", () => {
    const out = ["", "## " + h.callSpec, ""];
    out.push(b(0, "エンドポイント：`" + req(v.spec_method) + " " + req(v.spec_path) + "`（仕様書 " + req(v.spec_ver) + "）"));
    const hs = listItems(v.spec_headers);
    out.push(b(0, "リクエストヘッダ：" + (hs.length ? hs.map(x => "`" + x + "`").join("、") : miss())));
    const table = (label: string, rows: Values[]) => {
      out.push(b(0, label), "", "| 項目 | 型 | 必須 | 内容 |", "|---|---|---|---|");
      const rs = rows.filter(r => t(r.name) || t(r.type) || t(r.desc));
      (rs.length ? rs : [{}]).forEach(r => out.push("| " + code(r.name) + " | " + cell(r.type) + " | " + (r.need === "○" || r.need === "-" ? r.need : cell("")) + " | " + cell(r.desc) + " |"));
      out.push("");
    };
    table("リクエストパラメータ", arr(v.spec_req));
    table("レスポンス（正常時）", arr(v.spec_res));
    const codes = arr(v.spec_codes).filter(c => t(c.code) || t(c.meaning));
    out.push(b(0, "業務エラーコード：" + (v.codes_none ? NONE : codes.length ? codes.map(c => req(c.code) + "（" + req(c.meaning) + "）").join("、") : miss())));
    return out;
  });

  block("deps", () => {
    const out = ["", "## " + h.deps, "", b(0, "参照すべき既存実装")];
    out.push(b(1, "外部API呼び出しは" + req(v.dep_common) + "を使用し、独自のHTTPクライアントは作らない" + (t(v.dep_example) ? "。呼び出し例は`" + t(v.dep_example) + "`を参照" : "")));
    out.push(b(1, "組み込み先は" + code(v.dep_target)));
    out.push(b(0, "呼び出し先テスト環境：" + noEnd(req(v.test_env)) + "。" + req(v.stub_env) + "では" + req(v.stub_how) + "を使用する"));
    out.push(b(0, "接続先URL：" + req(v.url_setting) + "で切り替え"));
    out.push(b(0, "事前手続き：" + (v.proc_none ? NONE : noEnd(req(v.proc)) + (t(v.proc_ticket) ? "（" + t(v.proc_ticket) + "）" : "") + "の完了が前提")));
    out.push(b(0, "前提チケット：" + (v.pre_ticket_none ? NONE : req(v.pre_ticket) + (t(v.pre_ticket_no) ? "（" + t(v.pre_ticket_no) + "）" : ""))));
    const refs = arr(v.refs).filter(r => t(r.name) || t(r.where));
    out.push("", "## " + h.refs, "", ...(refs.length ? refs.map(r => b(0, (t(r.name) || MISSING) + (t(r.where) ? "（" + t(r.where) + "）" : ""))) : [b(0, NONE)]));
    return out;
  });

  return { text: blocks.flatMap(x => x.lines).join("\n"), missing, blocks };
}
