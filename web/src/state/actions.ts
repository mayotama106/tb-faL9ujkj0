/* チケットの作成・複製・削除など、一覧と画面から呼ぶ操作 */
import { GENRES } from "../domain/genres";
import { getState, newId, setUI, toast, update, type Doc } from "./store";
import { ensureKeys } from "./persist";

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
  const doc: Doc = { id: newId(), genre, v: GENRES[genre].impl ? { _impl: 1 } : {}, createdAt: now, updatedAt: now };
  update(d => { d.docs.unshift(doc); });
  openDoc(doc.id);
}
export function duplicateDoc(id: string) {
  const src = getState().data.docs.find(d => d.id === id);
  if (!src) return;
  const v = JSON.parse(JSON.stringify(src.v));
  v.title = ((v.title || "").trim() + "(コピー)").trim();
  ensureKeys(v);
  const now = Date.now();
  const doc: Doc = { id: newId(), genre: src.genre, v, createdAt: now, updatedAt: now };
  update(d => { d.docs.unshift(doc); });
  openDoc(doc.id);
  toast("複製した。複製したチケットを開いている");
}
export function deleteDoc(id: string) {
  const { data, ui } = getState();
  const rest = data.docs.filter(d => d.id !== id);
  update(d => { d.docs = d.docs.filter(x => x.id !== id); });
  if (ui.currentId === id) setUI({ currentId: rest[0] ? rest[0].id : null });
  toast("チケットを削除した", true);
}
export function clearDoc(id: string) {
  update(d => {
    const doc = d.docs.find(x => x.id === id);
    if (doc) { doc.v = GENRES[doc.genre].impl ? { _impl: 1 } : {}; doc.updatedAt = Date.now(); }
  });
  setUI(ui => ({ part: { ...ui.part, [id]: "basic" } }));
  toast("入力を消去した", true);
}
