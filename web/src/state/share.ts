/* チケットと切り分けの受け渡し。選んだものをファイル(.json)に書き出し、別の人・別のブラウザで読み込んで足す。
   今の内容は消さない。同じもの(同じID)があれば、1件ずつ「上書き」か「別に追加」を選ぶ。
   切り分けは、つながっているチケット本文もいっしょに書き出し、読み込んだあともつながりを保つ */
import { allCells, migrateFeature, type Feature } from "../domain/feature";
import { normalizeDoc } from "./persist";
import type { Data, Doc } from "./store";

export interface Pack { docs: Doc[]; features: Feature[] }
export type Choice = "overwrite" | "copy";

const linkedDocIds = (f: Feature) => allCells(f).map(c => c.docId).filter((x): x is string => !!x);

/* 書き出すファイルの中身。切り分けにつながっているチケット本文も入れる */
export function packText(data: Data, docIds: string[], featureIds: string[]): string {
  const features = data.features.filter(f => featureIds.includes(f.id));
  const ids = new Set(docIds.concat(features.flatMap(linkedDocIds)));
  const docs = data.docs.filter(d => ids.has(d.id));
  return JSON.stringify({ app: "ticket-builder", kind: "share", version: 1, exportedAt: new Date().toISOString(), docs, features }, null, 1);
}

/* 読み込んだファイルを確かめる。受け渡し用のファイルのほか、まるごとの書き出し(データを書き出す)からも取り出せる */
export function parsePack(text: string): Pack {
  let o: Record<string, unknown>;
  try { o = JSON.parse(text); } catch { throw new Error("ファイルの形式が正しくありません"); }
  if (!o || o.app !== "ticket-builder") throw new Error("チケットビルダーのファイルではありません");
  let raw: { docs?: unknown; features?: unknown } = o;
  if (o.kind !== "share") {
    const items = (o.items || {}) as Record<string, string>;
    try { raw = JSON.parse(items["ticket-builder:v2"] || "{}"); } catch { raw = {}; }
  }
  const docs = (Array.isArray(raw.docs) ? raw.docs : []).map(normalizeDoc).filter((d): d is Doc => !!d);
  const features = (Array.isArray(raw.features) ? raw.features : []).filter(f => f && typeof f === "object" && typeof (f as Feature).id === "string").map(migrateFeature);
  if (!docs.length && !features.length) throw new Error("読み込めるチケット・切り分けがありません");
  return { docs, features };
}

/* すでにあるもの(同じID) */
export function conflictsOf(data: Data, pack: Pack) {
  return {
    docs: pack.docs.filter(d => data.docs.some(x => x.id === d.id)),
    features: pack.features.filter(f => data.features.some(x => x.id === f.id))
  };
}

/* 読み込んだものを足す。choices は ID ごとの選択(同じものがあるときだけ使う。なければ別に追加)。
   別に追加するものは新しいIDにし、切り分けとチケット本文のつながりを新しいIDに付け替える */
export function mergePack(data: Data, pack: Pack, choices: Record<string, Choice>, newId: () => string): { docs: number; features: number } {
  const docMap = new Map<string, string>(), featMap = new Map<string, string>();
  const docs = pack.docs.map(d => {
    const exists = data.docs.some(x => x.id === d.id);
    if (exists && choices[d.id] !== "overwrite") { const id = newId(); docMap.set(d.id, id); return { ...d, id }; }
    return d;
  });
  const features = pack.features.map(f => {
    const exists = data.features.some(x => x.id === f.id);
    if (exists && choices[f.id] !== "overwrite") { const id = newId(); featMap.set(f.id, id); return { ...f, id, name: f.name + "（読み込み）" }; }
    return f;
  });
  /* つながりの付け替え */
  docs.forEach(d => {
    const ref = d.v.feat_ref;
    if (ref && featMap.has(ref.featureId)) d.v = { ...d.v, feat_ref: { ...ref, featureId: featMap.get(ref.featureId) } };
  });
  const relink = (id?: string) => (id && docMap.has(id) ? docMap.get(id) : id);
  features.forEach(f => {
    allCells(f).forEach(c => { if (c.docId) c.docId = relink(c.docId); });
  });
  /* 上書きはその場で置き換え、追加は先頭に入れる */
  const put = <T extends { id: string }>(list: T[], items: T[]) => items.slice().reverse().forEach(x => {
    const i = list.findIndex(y => y.id === x.id);
    if (i >= 0) list[i] = x; else list.unshift(x);
  });
  put(data.docs, docs);
  put(data.features, features);
  return { docs: docs.length, features: features.length };
}
