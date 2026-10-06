import type { Genre } from "./domain/genres";
import { buildTicket, type Values } from "./domain/ticket";

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const t = document.createElement("textarea");
    t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.append(t); t.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* 何もしない */ }
    t.remove();
    return ok;
  }
}

export const titleOf = (v: Values) => (v.title || "").trim().replace(/\s*\n\s*/g, " ");

/* タイトルを見出しにし、本文を続けたMarkdownファイルを保存させる */
export function downloadMd(g: Genre, v: Values) {
  const title = titleOf(v);
  const text = "# " + (title || "(タイトルなし)") + "\n\n" + buildTicket(g, v).text + "\n";
  const name = (title || g.name).replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 80) + ".md";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const pad = (n: number) => String(n).padStart(2, "0");
export function stamp(ms: number) {
  const d = new Date(ms), now = new Date();
  const hm = pad(d.getHours()) + ":" + pad(d.getMinutes());
  if (d.toDateString() === now.toDateString()) return "今日 " + hm;
  if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + "/" + d.getDate() + " " + hm;
  return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate();
}
