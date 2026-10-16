/* 部品の移動。入れ子(条件分岐の場合・処理の中など)の中と外の間でも移せる */
import type { CompDef } from "./components";
import type { Values } from "./ticket";

export type Path = (string | number)[];
export interface Spot { path: Path; index: number }   /* 部品の並び(配列)の位置と、その中の番号 */

const startsWith = (a: Path, b: Path) => b.length <= a.length && b.every((x, i) => a[i] === x);
const same = (a: Path, b: Path) => a.length === b.length && startsWith(a, b);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const at = (v: any, p: Path): any => p.reduce((x, k) => (x == null ? undefined : x[k]), v);

/* to が from の部品自身の中なら true(自分の中へは移せない) */
export const isInside = (from: Spot, to: Path) => startsWith(to, [...from.path, from.index]);

/* 移せないときは理由を返す。動かないとき(同じ場所)は "" を返す。移せるときは null */
export function checkMove(v: Values, from: Spot, to: Spot, top: Path, defs: Record<string, CompDef>): string | null {
  const src = at(v, from.path), dst = at(v, to.path);
  const b = Array.isArray(src) ? src[from.index] : undefined;
  if (!b || (dst != null && !Array.isArray(dst))) return "";
  if (isInside(from, to.path)) return "部品を、その部品自身の中へは移せない";
  if (defs[b.type]?.container && !same(to.path, top)) return defs[b.type].name + "(入れ物)は、チケットの直下にだけ置ける";
  const i = Math.min(to.index, Array.isArray(dst) ? dst.length : 0);
  if (same(from.path, to.path) && (i === from.index || i === from.index + 1)) return "";
  return null;
}

/* 移す(v は書き換えてよい下書き)。checkMove が null のときだけ呼ぶ */
export function moveBlock(v: Values, from: Spot, to: Spot) {
  /* 先に移し先の配列を取っておく(元の配列から抜くと、移し先の位置の番号がずれることがあるため) */
  let dst = at(v, to.path);
  if (!Array.isArray(dst)) {
    const parent = at(v, to.path.slice(0, -1));
    parent[to.path[to.path.length - 1]] = [];
    dst = parent[to.path[to.path.length - 1]];
  }
  let i = Math.min(to.index, dst.length);
  const [b] = at(v, from.path).splice(from.index, 1);
  if (same(from.path, to.path) && from.index < i) i--;
  dst.splice(i, 0, b);
}
