/* ブラウザ内(localStorage)への保存と、旧版のデータの引き継ぎ */
import { COMPONENTS, type CompDef } from "../domain/components";
import { GENRES, type Genre } from "../domain/genres";
import { OLD_IMPL_GENRES, toImpl } from "./migrateImpl";
import type { Values } from "../domain/ticket";
import type { Data, Doc, State } from "./store";

const KEY = "ticket-builder:v2";
/* 旧版のキー。読むだけで、書き換えも削除もしない(旧版に戻した場合にそのまま使える) */
const V1_KEY = "ticket-builder:v1";
const V1_SAVED_KEY = "ticket-builder:saved:v1";
/* テンプレートは旧版と同じキー・同じ形式で持つ */
const TPL_KEY = "ticket-builder:templates:v1";
/* 部品の編集済みの定義。初期の定義と異なる部品だけを持つ */
const COMP_KEY = "ticket-builder:components:v1";
/* 実装チケットに移す前の内容の控え */
const BACKUP_KEY = "ticket-builder:v2:before-impl";
const known = (g: string) => !!GENRES[g] || OLD_IMPL_GENRES.includes(g);

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
    if (!known(it.genre) || !it.v) return;
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
      if (!known(genre) || !w || !hasContent(w)) return;
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

export function loadInitial(): { data: Data; currentId: string | null; collapsed: string[] } {
  const stored = read<Stored>(KEY) || migrateV1();
  const docs = (stored.docs || []).filter(d => known(d.genre));
  /* 旧形式の API作成・画面作成・ロジック作成は、実装チケットに移す。移す前の内容は控えに残す */
  if (docs.some(d => OLD_IMPL_GENRES.includes(d.genre))) {
    try { if (!localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, JSON.stringify(stored)); } catch { /* 何もしない */ }
    docs.forEach(d => { if (OLD_IMPL_GENRES.includes(d.genre)) { d.v = toImpl(d.genre, d.v); d.genre = "impl"; } });
  }
  docs.forEach(d => ensureKeys(d.v));
  const templates: Record<string, Genre> = {};
  const t = read<Record<string, Genre>>(TPL_KEY) || {};
  Object.keys(t).forEach(k => { if (GENRES[k] && !GENRES[k].impl === !t[k].impl) templates[k] = t[k]; });
  const comps: Record<string, CompDef> = {};
  const c = read<Record<string, CompDef>>(COMP_KEY) || {};
  Object.keys(c).forEach(k => { if (COMPONENTS[k] && c[k] && Array.isArray(c[k].fields)) comps[k] = c[k]; });
  const currentId = docs.some(d => d.id === stored.currentId) ? stored.currentId : (docs[0] ? docs[0].id : null);
  return { data: { docs, templates, comps }, currentId, collapsed: stored.collapsed || [] };
}

let lastTpl = "", lastComp = "";
export function persist(s: State) {
  try {
    const stored: Stored = { docs: s.data.docs, currentId: s.ui.currentId, collapsed: s.ui.collapsed };
    localStorage.setItem(KEY, JSON.stringify(stored));
    const tpl = JSON.stringify(s.data.templates);
    if (tpl !== lastTpl) { localStorage.setItem(TPL_KEY, tpl); lastTpl = tpl; }
    const comp = JSON.stringify(s.data.comps);
    if (comp !== lastComp) { localStorage.setItem(COMP_KEY, comp); lastComp = comp; }
  } catch { /* 保存領域が使えない環境では保存なしで動く */ }
}
