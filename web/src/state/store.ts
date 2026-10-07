/* アプリの状態。
   data(チケットとテンプレート)は取り消しの対象で、ブラウザ内に自動保存する。
   ui(開いているチケット、表示中のパートなど)は取り消しの対象外 */
import { produce, type Draft } from "immer";
import { useSyncExternalStore } from "react";
import { COMPONENTS, type CompDef } from "../domain/components";
import { GENRES, type Genre } from "../domain/genres";
import type { Values } from "../domain/ticket";
import { loadInitial, persist } from "./persist";

export interface Doc { id: string; genre: string; v: Values; createdAt: number; updatedAt: number }
export interface Data {
  docs: Doc[];
  templates: Record<string, Genre>;   /* 編集したテンプレート。初期状態と同じジャンルは持たない */
  comps: Record<string, CompDef>;     /* 編集した部品の定義。初期の定義と同じ部品は持たない */
}
export interface Toast { id: number; text: string; undo: boolean }
export interface UI {
  currentId: string | null;
  part: Record<string, string>;   /* チケットごとの表示中のパート */
  collapsed: string[];            /* 閉じている階層 */
  openEtc: string[];              /* 開いている「その他」欄 */
  editing: boolean;               /* テンプレートの編集中 */
  editGenre: string;
  query: string;
  filter: string;
  sidebar: boolean;               /* 狭い画面でのチケット一覧の表示 */
  toast: Toast | null;
}
export interface State { data: Data; ui: UI; past: Data[]; future: Data[] }

const init = loadInitial();
let state: State = {
  data: init.data,
  ui: {
    currentId: init.currentId, part: {}, collapsed: init.collapsed, openEtc: [], editing: false,
    editGenre: "impl", query: "", filter: "", sidebar: false, toast: null
  },
  past: [], future: []
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}
export const getState = () => state;

/* 続けて同じ欄に入力した分は、取り消しの1単位にまとめる */
let lastKey = "", lastAt = 0;
const MAX_UNDO = 200;

export interface UpdateOpts { coalesce?: string; undoable?: boolean }
export function update(recipe: (d: Draft<Data>) => void, opts: UpdateOpts = {}) {
  const next = produce(state.data, recipe);
  if (next === state.data) return;
  const now = Date.now();
  let past = state.past, future = state.future;
  if (opts.undoable !== false) {
    const merge = !!opts.coalesce && opts.coalesce === lastKey && now - lastAt < 1500;
    if (!merge) past = past.concat([state.data]).slice(-MAX_UNDO);
    future = [];
    lastKey = opts.coalesce || ""; lastAt = now;
  }
  state = { ...state, data: next, past, future };
  persist(state);
  emit();
}
export function undo() {
  if (!state.past.length) return false;
  const prev = state.past[state.past.length - 1];
  state = { ...state, data: prev, past: state.past.slice(0, -1), future: [state.data].concat(state.future) };
  lastKey = "";
  fixCurrent(); persist(state); emit();
  return true;
}
export function redo() {
  if (!state.future.length) return false;
  const next = state.future[0];
  state = { ...state, data: next, past: state.past.concat([state.data]), future: state.future.slice(1) };
  lastKey = "";
  fixCurrent(); persist(state); emit();
  return true;
}
/* 取り消しで開いていたチケットが消えた場合に備える */
function fixCurrent() {
  const { docs } = state.data;
  if (state.ui.currentId && !docs.some(d => d.id === state.ui.currentId))
    state = { ...state, ui: { ...state.ui, currentId: docs[0] ? docs[0].id : null } };
}

export function setUI(patch: Partial<UI> | ((ui: UI) => Partial<UI>)) {
  const p = typeof patch === "function" ? patch(state.ui) : patch;
  state = { ...state, ui: { ...state.ui, ...p } };
  if ("collapsed" in p || "currentId" in p) persist(state);
  emit();
}

let toastSeq = 0;
export function toast(text: string, undoable = false) {
  const id = ++toastSeq;
  setUI({ toast: { id, text, undo: undoable } });
  setTimeout(() => { if (state.ui.toast && state.ui.toast.id === id) setUI({ toast: null }); }, 6000);
}

/* ===== 便利な関数 ===== */
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const genreOf = (data: Data, key: string): Genre => data.templates[key] || GENRES[key];
/* 部品の定義(編集を反映したもの)。同じ data なら同じオブジェクトを返す */
let defsCache: { comps: Data["comps"]; defs: Record<string, CompDef> } | null = null;
export const defsOf = (data: Data): Record<string, CompDef> => {
  if (!defsCache || defsCache.comps !== data.comps) defsCache = { comps: data.comps, defs: { ...COMPONENTS, ...data.comps } };
  return defsCache.defs;
};
export const currentDoc = (s: State): Doc | null => s.data.docs.find(d => d.id === s.ui.currentId) || null;

type Path = (string | number)[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAt(o: any, path: Path): any {
  return path.reduce((x, k) => (x == null ? undefined : x[k]), o);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setAt(o: any, path: Path, value: unknown) {
  let x = o;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (x[k] == null || typeof x[k] !== "object") x[k] = typeof path[i + 1] === "number" ? [] : {};
    x = x[k];
  }
  x[path[path.length - 1]] = value;
}

/* 開いているチケットの入力値を変える */
export function editDoc(fn: (v: Draft<Values>) => void, opts: UpdateOpts = {}) {
  const id = state.ui.currentId;
  if (!id) return;
  update(d => {
    const doc = d.docs.find(x => x.id === id);
    if (!doc) return;
    fn(doc.v);
    doc.updatedAt = Date.now();
  }, opts);
}
export function setValue(path: Path, value: unknown, coalesce = true) {
  editDoc(v => setAt(v, path, value), { coalesce: coalesce ? "v:" + state.ui.currentId + ":" + path.join(".") : undefined });
}
