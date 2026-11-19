/* テンプレート集。チケットの中身はシステムに入れず、テンプレート(部品の組み合わせ)をコピーして、手元で【】を埋める。
   部品: 本文の一片(見出し、受け入れ条件の1行、エラーの1ケースなど)。分類(cat)ごとに並べる。
   テンプレート: 部品の並び。opt の部品は、はじめはオフ(必要なときだけ入れる)。
   本文の書式はチケットビルダーと同じ(見出し ##、箇条書き「* 」と3文字の字下げ、区切りは「：」)。埋める所は【〇〇】 */
import { KIT_PARTS, KIT_TEMPLATES } from "./kitDefaults";

export interface KPart { id: string; cat: string; name: string; body: string }
export interface KTpl { id: string; genre: string; name: string; desc: string; title: string; parts: string[]; opt: string[] }
export interface Kit { parts: KPart[]; tpls: KTpl[] }

export const KIT_GENRES = ["実装", "API呼び出し", "エラーハンドリング", "ST", "バグ", "その他"];
export const KIT_CATS = ["基本", "処理の流れ", "受け入れ条件", "エラー", "削除の観点", "外部API", "非機能", "確認", "依存・参考", "ST", "バグ"];

export const defaultKit = (): Kit => structuredClone({ parts: KIT_PARTS, tpls: KIT_TEMPLATES });

/* 本文を組み立てる。箇条書きの続きはそのままつなぎ、見出しの前後や箇条書きでない部品の前は1行空ける */
export function assemble(parts: KPart[]): string {
  const list = /^\s*([*-]|\d+\.) /;
  let out = "";
  parts.forEach(p => {
    const body = p.body.replace(/\s+$/, "");
    if (!body) return;
    const last = out.split("\n").pop() || "";
    out += out ? (list.test(body) && list.test(last) ? "\n" : "\n\n") + body : body;
  });
  return out;
}
/* テンプレートで使う部品(オフにしたものを除く)。消えた部品は飛ばす */
export function partsOf(kit: Kit, tpl: KTpl, off: string[]): KPart[] {
  return tpl.parts.filter(id => !off.includes(id)).map(id => kit.parts.find(p => p.id === id)).filter((p): p is KPart => !!p);
}
/* 埋める所(【〇〇】)の数 */
export const holesOf = (text: string) => (text.match(/【[^】]*】/g) || []).length;
/* 部品を使っているテンプレート */
export const usedBy = (kit: Kit, partId: string) => kit.tpls.filter(t => t.parts.includes(partId));

/* 保存されていた値を確かめる。形が違えば初期のものを使う */
export function normalizeKit(raw: unknown): Kit | null {
  const o = raw as Kit | null;
  if (!o || !Array.isArray(o.parts) || !Array.isArray(o.tpls)) return null;
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  const parts = o.parts.filter(p => p && typeof p.id === "string").map(p => ({ id: p.id, cat: s(p.cat) || "基本", name: s(p.name), body: s(p.body) }));
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []);
  const tpls = o.tpls.filter(t => t && typeof t.id === "string").map(t => ({ id: t.id, genre: s(t.genre) || "その他", name: s(t.name), desc: s(t.desc), title: s(t.title), parts: ids(t.parts), opt: ids(t.opt) }));
  return { parts, tpls };
}
