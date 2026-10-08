/* 旧形式の API作成・画面作成・ロジック作成のチケットを、実装チケット(部品の組み合わせ)に移す。
   部品に移せない値は「処理実行」の詳細に残す */
import { NO_DISPLAY, type CaseVal, type ErrVal } from "../domain/components";
import { HAS, REF } from "../domain/genres";
import type { Values } from "../domain/ticket";

export const OLD_IMPL_GENRES = ["api", "logic", "screen"];

let seq = 0;
const key = () => "m" + Date.now().toString(36) + (seq++).toString(36);
const s = (x: unknown) => (typeof x === "string" ? x.trim() : "");
const lines = (x: unknown) => (Array.isArray(x) ? x : String(x || "").split("\n")).map(v => String(v).trim()).filter(Boolean);
const arr = (x: unknown): Values[] => (Array.isArray(x) ? x : []);
const joinLines = (...xs: unknown[]) => xs.map(s).filter(Boolean).join("\n");

const DISPLAY_OF: Record<string, string> = { "エラーモーダル": "モーダル", "エラー画面": "全画面", "その他": "その他" };

/* 旧形式のエラー(種類・エラーID・メッセージ・ログレベル) */
function oldErr(o: Values): ErrVal {
  const kind = s(o.ek);
  return {
    display: DISPLAY_OF[kind] || "",
    status: "",
    code: s(o.eid),
    message: s(o.emsg),
    note: joinLines(kind === "その他" ? o.efree : "", s(o.elog) ? "ログレベル: " + s(o.elog) : "", o.eetc)
  };
}
/* 観点表のエラーの問い(値は id_kind, id_eid … に入っている) */
function nodeErr(v: Values, id: string): ErrVal {
  return oldErr({ ek: v[id + "_kind"], eid: v[id + "_eid"], emsg: v[id + "_emsg"], elog: v[id + "_elog"], efree: v[id + "_efree"], eetc: v[id + "_eetc"] });
}
function nodeCase(v: Values, id: string): CaseVal {
  const kind = s(v[id + "_kind"]);
  if (!kind) return { mode: "" };
  if (kind === "その他") return { mode: "text", text: s(v[id + "_efree"]) };
  return { mode: "error", err: nodeErr(v, id) };
}

/* 旧形式の工程(処理実行・条件分岐・エラーハンドリング) */
function oldSteps(steps: unknown): Values[] {
  return arr(steps).map(st => {
    if (st.kind === "if") return { _k: key(), type: "if", name: joinLines(st.text, st.note), ac: "", cases: [
      { _k: key(), cond: "満たす場合", blocks: oldSteps(st.then) },
      { _k: key(), cond: "満たさない場合", blocks: oldSteps(st.else) }] };
    if (st.kind === "err") {
      const e = oldErr(st); e.note = joinLines(e.note, st.note);
      return { _k: key(), type: "error", when: "", err: e };
    }
    const kids = arr(st.kids);
    const block: Values = { _k: key(), type: "do", name: s(st.text), detail: s(st.note) };
    /* 子の工程は、処理実行の詳細に1行ずつ残す */
    if (kids.length) block.detail = joinLines(block.detail, ...flatTexts(kids));
    return block;
  });
}
function flatTexts(steps: Values[]): string[] {
  return steps.flatMap(st => [s(st.text), ...flatTexts(arr(st.kids)), ...flatTexts(arr(st.then)), ...flatTexts(arr(st.else))]).filter(Boolean);
}

/* 処理の流れの形式(チェック群・処理実行・条件分岐・エラーを返却)の工程 */
function flowSteps(steps: unknown): Values[] {
  const e = (o: Values): ErrVal => ({ display: NO_DISPLAY, status: s(o.status), code: s(o.code), note: s(o.detail) });
  return arr(steps).map(st => {
    if (st.kind === "checks") return { _k: key(), type: "check", name: s(st.text), ac: s(st.ac),
      items: arr(st.items).map(it => ({ _k: key(), name: s(it.name), detail: s(it.detail), err: { display: NO_DISPLAY, status: s(it.status), code: s(it.code) } })) };
    if (st.kind === "if") return { _k: key(), type: "if", name: s(st.text), ac: s(st.ac), cases: [
      { _k: key(), cond: s(st.yes), none: !!st.thenNone, blocks: flowSteps(st.then) },
      { _k: key(), cond: s(st.no), none: !!st.elseNone, blocks: flowSteps(st.else) }] };
    if (st.kind === "error") return { _k: key(), type: "error", when: "", err: e(st) };
    return { _k: key(), type: "do", name: s(st.text), detail: s(st.detail) };
  });
}

/* 原典参照(id_src が REF)なら、原典を見る処理実行にする */
function logicBlocks(v: Values, id: string, noHas: boolean): Values[] {
  if (!noHas && v[id + "_has"] !== HAS) return [];   /* ロジックが「ない」か未選択 */
  if (v[id + "_src"] === REF) return [{ _k: key(), type: "do", name: "原典を参照する", detail: s(v[id + "_link"]) }];
  return oldSteps(v[id + "_steps"]);
}

/* 「その他」欄(id__etc)の記載を集める */
function etcLines(v: Values): string[] {
  return Object.keys(v).filter(k => k.endsWith("__etc") && s(v[k])).map(k => s(v[k]));
}

function common(v: Values): Values {
  const n: Values = { _impl: 1, title: v.title || "", mod: v.mod || "" };
  n.story_goal = v.story_goal || v.story || "";
  n.scope_in = scopeIn(v);
  n.story_refs = Array.isArray(v.story_refs) ? v.story_refs : lines(v.refs);
  n.deps = Array.isArray(v.deps) ? v.deps : s(v.deps) ? [s(v.deps)] : [];
  ["deps_none", "branch", "call", "nonfunc", "impact", "ok_status", "ok_body", "ac_extra", "proc_name"].forEach(k => { if (v[k] != null) n[k] = v[k]; });
  const nf = [["呼び出し頻度", v.nf_freq], ["タイムアウト時間", v.nf_timeout], ["データ量の上限", v.nf_volume], ["対応ブラウザ・画面幅", v.nf_env]]
    .filter(([, x]) => s(x)).map(([l, x]) => l + ": " + s(x));
  if (nf.length && !s(n.nonfunc)) n.nonfunc = nf.join("\n");
  const impact = joinLines(v.mod_impact, s(v.mod_if) ? "IFの書き直し要否: " + s(v.mod_if) : "", s(v.mod_doc) ? "設計書の書き直し要否: " + s(v.mod_doc) : "");
  if (impact && !s(n.impact)) n.impact = impact;
  return n;
}
function leftovers(v: Values, blocks: Values[]) {
  const etc = etcLines(v);
  if (etc.length) blocks.push({ _k: key(), type: "do", name: "その他(旧形式の記載)", detail: etc.join("\n") });
}

/* データ操作の見出し。旧形式は見出しを持たないので、DB名から作る */
const opName = (db: unknown, verb: string) => (s(db) ? s(db) + verb : "");

function fromApi(v: Values): Values {
  const n = common(v);
  const flow: Values[] = [];
  /* リクエストの形式・必須のエラーは、チェックの部品にする */
  const reqErr = [["req_fmt", "形式チェック"], ["req_miss", "必須チェック"]].filter(([id]) => s(v[id + "_kind"]));
  if (reqErr.length) flow.push({ _k: key(), type: "check", name: "リクエストバリデーションチェック", ac: "",
    items: reqErr.map(([id, name]) => ({ _k: key(), name, detail: "", err: nodeErr(v, id) })) });
  const m = s(v.method);
  if (m === "GET") flow.push({ _k: key(), type: "get", name: opName(v.get_db, "から取得"), target: s(v.get_db), cond: s(v.get_cond), zero: nodeCase(v, "get_zero") });
  if (m === "POST") flow.push({ _k: key(), type: "create", name: opName(v.post_db, "に登録"), target: s(v.post_db), items: [], dup: nodeCase(v, "post_dup"), fail: nodeCase(v, "post_fail") });
  if (m === "PUT") flow.push({ _k: key(), type: "update", name: opName(v.put_db, "を更新"), target: s(v.put_db), cond: s(v.put_cond), items: [], none: nodeCase(v, "put_none"), part: nodeCase(v, "put_part") });
  if (m === "DELETE") flow.push({ _k: key(), type: "delete", name: opName(v.del_db, "から削除"), target: s(v.del_db), cond: s(v.del_cond), how: s(v.del_kind), rel: s(v.del_rel),
    none: nodeCase(v, "del_none"), cant: nodeCase(v, "del_cant") });
  flow.push(...logicBlocks(v, "logic", false));
  if (s(v.res_ng_kind)) flow.push({ _k: key(), type: "error", when: "異常の場合", err: nodeErr(v, "res_ng") });
  leftovers(v, flow);
  n.blocks = [{
    _k: key(), type: "api", name: s(v.api_name).replace(/API$/i, ""), method: m, endpoint: s(v.endpoint), caller: s(v.trigger),
    req_ref: v.req_src === REF, req_link: s(v.req_link), req_place: Array.isArray(v.req_place) ? v.req_place : [],
    req_items: lines(v.req_items), req_need: lines(v.req_need),
    res_ref: v.res_ok_src === REF, res_link: s(v.res_ok_link), res_items: lines(v.res_items), res_need: lines(v.res_need),
    flow
  }];
  return n;
}

function fromScreen(v: Values): Values {
  const n = common(v);
  const init = logicBlocks(v, "init", true);
  leftovers(v, init);
  n.blocks = [{
    _k: key(), type: "screen", name: s(v.api_name).replace(/画面$/, ""), screen_id: s(v.screen_id), from: s(v.from), from_data: s(v.from_data),
    elements_ref: v.el_src === REF, elements_link: s(v.el_link),
    elements: arr(v.el).map(e => ({ _k: key(), name: s(e.name), kind: s(e.kind), style: s(e.style), type: s(e.type), bad: oldErr(e.bad || {}), cond: s(e.cond) })),
    init,
    events_ref: v.events_src === REF, events_link: s(v.events_link),
    events: arr(v.events).map(ev => ({ _k: key(), name: s(ev.name), trig: s(ev.trig), steps: oldSteps(ev.steps) })),
    env: ""
  }];
  return n;
}

function fromLogic(v: Values): Values {
  const n = common(v);
  /* 処理の流れの形式なら工程をそのまま移す。それより前の観点表の形式なら、ロジックの工程を移す */
  const blocks = v._flow ? flowSteps(v.flow) : logicBlocks(v, "logic", true);
  if (!v._flow) leftovers(v, blocks);
  n.blocks = blocks;
  if (!s(n.proc_name) && s(v.api_name)) n.proc_name = s(v.api_name).replace(/ロジック$/, "");
  if (!s(n.call) && s(v.trigger)) n.call = s(v.trigger);
  return n;
}

export function toImpl(genre: string, v: Values): Values {
  if (genre === "api") return fromApi(v);
  if (genre === "screen") return fromScreen(v);
  return fromLogic(v);
}

/* 旧形式の「本チケットの範囲」(1つの文)を、スコープ内の1件にする */
function scopeIn(v: Values): string[] {
  if (Array.isArray(v.scope_in)) return v.scope_in;
  return s(v.story_scope) ? [s(v.story_scope)] : [];
}
/* 実装チケットの入力を、今の形に合わせる(スコープ内・スコープ外の追加) */
export function upgradeImpl(v: Values): Values {
  if (Array.isArray(v.scope_in) || !s(v.story_scope)) return v;
  const n: Values = { ...v, scope_in: scopeIn(v) };
  delete n.story_scope;
  return n;
}
