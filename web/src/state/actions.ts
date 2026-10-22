/* チケットの作成・複製・削除など、一覧と画面から呼ぶ操作 */
import { COMPONENTS, newBlock } from "../domain/components";
import { GENRES } from "../domain/genres";
import type { Values } from "../domain/ticket";
import { getState, newId, setUI, toast, update, type Doc } from "./store";
import { ensureKeys } from "./persist";

/* 新しいチケットの初期値。STチケットは、よく使う手順(テストケース準備・アカウント準備・打鍵)を入れておく */
export function initialValues(genre: string): Values {
  if (GENRES[genre].impl) return { _impl: 1 };
  if (GENRES[genre].st) return { steps: ["st_case", "st_account", "st_exec"].map(t => newBlock(COMPONENTS[t], newId)) };
  return {};
}

export function openDoc(id: string) {
  setUI({ currentId: id, editing: false, sidebar: false });
  window.scrollTo(0, 0);
}
export function goPart(docId: string, key: string) {
  setUI(ui => ({ part: { ...ui.part, [docId]: key } }));
  window.scrollTo(0, 0);
}
export function createDoc(genre: string) {
  const now = Date.now();
  const doc: Doc = { id: newId(), genre, v: initialValues(genre), createdAt: now, updatedAt: now };
  update(d => { d.docs.unshift(doc); });
  openDoc(doc.id);
}
export function duplicateDoc(id: string) {
  const src = getState().data.docs.find(d => d.id === id);
  if (!src) return;
  const v = JSON.parse(JSON.stringify(src.v));
  v.title = ((v.title || "").trim() + "(コピー)").trim();
  delete v.feat_ref;   /* 切り分けのチケットとのつながりは、元のチケットにだけ残す */
  ensureKeys(v);
  const now = Date.now();
  const doc: Doc = { id: newId(), genre: src.genre, v, createdAt: now, updatedAt: now };
  update(d => { d.docs.unshift(doc); });
  openDoc(doc.id);
  toast("複製しました。複製したチケットを開いています");
}
export function deleteDoc(id: string) {
  const { data, ui } = getState();
  const rest = data.docs.filter(d => d.id !== id);
  update(d => { d.docs = d.docs.filter(x => x.id !== id); });
  if (ui.currentId === id) setUI({ currentId: rest[0] ? rest[0].id : null });
  toast("チケットを削除しました", true);
}
export function clearDoc(id: string) {
  update(d => {
    const doc = d.docs.find(x => x.id === id);
    if (doc) { doc.v = initialValues(doc.genre); doc.updatedAt = Date.now(); }
  });
  setUI(ui => ({ part: { ...ui.part, [id]: "basic" } }));
  toast("入力を消去しました", true);
}
