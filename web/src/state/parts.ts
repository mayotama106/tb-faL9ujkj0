/* チケットを分けたパート(入力画面の1ページ)。key は本文のブロック(ticket.ts)と対応する */
import type { Genre } from "../domain/genres";
import { headsOf } from "../domain/ticket";

export interface Part { key: string; title: string }
export const FINAL = "final";

export function partsOf(g: Genre): Part[] {
  const h = headsOf(g);
  if (g.impl) return [
    { key: "basic", title: "タイトルと" + h.story },
    { key: "build", title: "組み立て" },
    { key: "ac", title: h.ac },
    { key: "notes", title: h.notes },
    { key: FINAL, title: "仕上げ" }
  ];
  if (g.sections) return [
    { key: "basic", title: "タイトルと" + (g.storyLabel || "概要") },
    ...g.sections.map(s => ({ key: "sec:" + s.key, title: s.title })),
    { key: "refs", title: h.deps + "・" + h.refs },
    { key: FINAL, title: "仕上げ" }
  ];
  return [
    { key: "basic", title: "タイトルと" + h.story },
    { key: "kind", title: "作成区分" },
    { key: "func", title: h.func },
    { key: "nonfunc", title: h.nonfunc },
    { key: "other", title: h.other },
    { key: "refs", title: h.deps + "・" + h.refs },
    { key: FINAL, title: "仕上げ" }
  ];
}
