/* ブラウザ内(localStorage)への保存と、旧版のデータの引き継ぎ */
import { GENRES, type Genre } from "../domain/genres";
import type { Values } from "../domain/ticket";
import type { Data, Doc, State } from "./store";

const KEY = "ticket-builder:v2";
/* 旧版のキー。読むだけで、書き換えも削除もしない(旧版に戻した場合にそのまま使える) */
const V1_KEY = "ticket-builder:v1";
const V1_SAVED_KEY = "ticket-builder:saved:v1";
/* テンプレートは旧版と同じキー・同じ形式で持つ */
const TPL_KEY = "ticket-builder:templates:v1";

interface Stored { docs: Doc[]; currentId: string | null; collapsed: string[] }

function read<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

/* 並べ替えに使う、配列の中のオブジェクトの識別子(_k)を付ける */
export function ensureKeys(o: unknown): void {
  if (Array.isArray(o)) o.forEach(x => {
    if (x && typeof x === "object" && !Array.isArray(x) && !(x as Values)._k) (x as Values)._k = Math.random().toString(36).slice(2, 10);
    ensureKeys(x);
  });
  else if (o && typeof o === "object") Object.values(o).forEach(ensureKeys);
}

/* 記入のある入力か(空のチケットは引き継がない) */
function hasContent(v: Values): boolean {
  return Object.keys(v).some(k => {
    if (k.startsWith("_")) return false;
    const x = v[k];
    if (typeof x === "string") return x.trim() !== "";
    if (Array.isArray(x)) return x.some(i => typeof i === "string" ? i.trim() !== "" : !!i);
    return false;
  });
}

function parseStamp(s: string): number {
  const t = Date.parse((s || "").replace(" ", "T"));
  return isNaN(t) ? Date.now() : t;
}

function migrateV1(): Stored {
  const docs: Doc[] = [];
  const saved = read<{ id: string; genre: string; title: string; at: string; v: Values }[]>(V1_SAVED_KEY) || [];
  saved.forEach(it => {
    if (!GENRES[it.genre] || !it.v) return;
    const v = { ...it.v }; delete v._sid;
    const t = parseStamp(it.at);
    docs.push({ id: it.id, genre: it.genre, v, createdAt: t, updatedAt: t });
  });
  const v1 = read<{ genre?: string; all?: Record<string, Values>; v?: Values; c?: string[] }>(V1_KEY);
  let currentId: string | null = null;
  if (v1) {
    const all = v1.all || (v1.v ? { api: v1.v } : {});
    Object.keys(all).forEach(genre => {
      const w = all[genre];
      if (!GENRES[genre] || !w || !hasContent(w)) return;
      const v = { ...w }; const sid = v._sid; delete v._sid;
      /* 保存済みのチケットを開いて編集していた場合は、編集中の内容を新しい方として使う */
      const same = sid ? docs.find(d => d.id === sid) : undefined;
      if (same) { same.v = v; same.updatedAt = Date.now(); if (genre === v1.genre) currentId = same.id; return; }
      const id = "w" + genre + Date.now().toString(36);
      docs.push({ id, genre, v, createdAt: Date.now(), updatedAt: Date.now() });
      if (genre === v1.genre) currentId = id;
    });
  }
  docs.sort((a, b) => b.updatedAt - a.updatedAt);
  return { docs, currentId: currentId || (docs[0] ? docs[0].id : null), collapsed: (v1 && v1.c) || [] };
}

/* 旧形式(観点表)のロジック作成の入力を、処理の流れの形式に移す。元の値も残す */
export function migrateFlow(v: Values): Values {
  if (v._flow) return v;
  const n: Values = { ...v, _flow: 1 };
  const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const lines = (x: unknown) => (Array.isArray(x) ? x : String(x || "").split("\n")).map(s => String(s).trim()).filter(Boolean);
  if (str(v.story) && !n.story_goal) n.story_goal = v.story;
  if (str(v.trigger) && !n.call) n.call = v.trigger;
  if (str(v.mod_impact) && !n.impact) n.impact = v.mod_impact;
  const nf = [["呼び出し頻度", v.nf_freq], ["タイムアウト時間", v.nf_timeout], ["データ量の上限", v.nf_volume]]
    .filter(([, x]) => str(x)).map(([l, x]) => l + ": " + str(x));
  if (nf.length && !n.nonfunc) n.nonfunc = nf.join("\n");
  if (typeof v.deps === "string") n.deps = lines(v.deps);
  if (str(v.refs) && !n.story_refs) n.story_refs = lines(v.refs);
  /* 旧形式の工程: 処理実行(子の工程は詳細へ)、条件分岐、エラーハンドリング(エラー返却へ) */
  const conv = (arr: unknown): Values[] => (Array.isArray(arr) ? arr : []).map((s: Values) => {
    if (s.kind === "if") return { _k: s._k, kind: "if", text: s.text || "", ac: "", yes: "", no: "", then: conv(s.then), else: conv(s.else) };
    if (s.kind === "err") return { _k: s._k, kind: "error", status: "", code: str(s.eid),
      detail: [s.ek, s.emsg, s.note].map(str).filter(Boolean).join("\n") };
    const kids = (Array.isArray(s.kids) ? s.kids : []).map((k: Values) => str(k.text)).filter(Boolean);
    return { _k: s._k, kind: "do", text: s.text || "", detail: [str(s.note), ...kids].filter(Boolean).join("\n") };
  });
  if (Array.isArray(v.logic_steps) && !n.flow) n.flow = conv(v.logic_steps);
  return n;
}

export function loadInitial(): { data: Data; currentId: string | null; collapsed: string[] } {
  const stored = read<Stored>(KEY) || migrateV1();
  const docs = (stored.docs || []).filter(d => GENRES[d.genre]);
  docs.forEach(d => {
    if (GENRES[d.genre].flow) d.v = migrateFlow(d.v);
    ensureKeys(d.v);
  });
  const templates: Record<string, Genre> = {};
  const t = read<Record<string, Genre>>(TPL_KEY) || {};
  /* 形式が変わったジャンル(観点表から処理の流れへ)の、旧形式の編集済みテンプレートは使わない */
  Object.keys(t).forEach(k => { if (GENRES[k] && !!GENRES[k].flow === !!t[k].flow) templates[k] = t[k]; });
  const currentId = docs.some(d => d.id === stored.currentId) ? stored.currentId : (docs[0] ? docs[0].id : null);
  return { data: { docs, templates }, currentId, collapsed: stored.collapsed || [] };
}

let lastTpl = "";
export function persist(s: State) {
  try {
    const stored: Stored = { docs: s.data.docs, currentId: s.ui.currentId, collapsed: s.ui.collapsed };
    localStorage.setItem(KEY, JSON.stringify(stored));
    const tpl = JSON.stringify(s.data.templates);
    if (tpl !== lastTpl) { localStorage.setItem(TPL_KEY, tpl); lastTpl = tpl; }
  } catch { /* 保存領域が使えない環境では保存なしで動く */ }
}
