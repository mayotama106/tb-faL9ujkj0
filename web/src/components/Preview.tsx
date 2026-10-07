/* チケット本文のプレビュー。表示中のパートに当たる部分を強調し、押すとそのパートへ移る */
import { useEffect, useRef } from "react";
import type { Genre } from "../domain/genres";
import type { Ticket, Values } from "../domain/ticket";
import { downloadMd, titleOf } from "../utils";
import { defsOf, useStore } from "../state/store";
import { CopyButton } from "./Wizard";

export function Preview({ g, v, ticket, partKey, onGo }: {
  g: Genre; v: Values; ticket: Ticket; partKey?: string; onGo?: (key: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const defs = useStore(s => defsOf(s.data));
  useEffect(() => {
    const b = box.current; if (!b) return;
    const cur = b.querySelector<HTMLElement>(".blk.cur");
    if (cur) b.scrollTo({ top: Math.max(0, cur.offsetTop - b.offsetTop - 12), behavior: "smooth" });
  }, [partKey]);
  return (
    <section className="preview" aria-label="チケット本文">
      <div className="bar">
        <h2>チケット本文</h2>
        <span className={ticket.missing ? "count" : "count done"}>{ticket.missing ? "未記入 " + ticket.missing + " 件" : "未記入なし"}</span>
      </div>
      <div className="out" ref={box}>
        {ticket.blocks.filter(b => b.lines.length).map((b, i) => (
          <div key={b.key + i} className={"blk" + (b.key === partKey ? " cur" : "") + (onGo ? " go" : "")}
            onClick={onGo ? () => { if (!String(window.getSelection() || "")) onGo(b.key); } : undefined}
            title={onGo ? "押すと、このパートの入力へ移る" : undefined}>
            {b.lines.join("\n")}
          </div>
        ))}
      </div>
      <div className="actions">
        <CopyButton className="primary" text={() => ticket.text} done="本文をコピーした">本文をコピー</CopyButton>
        <CopyButton className="plain" text={() => titleOf(v)} done="タイトルをコピーした">タイトルをコピー</CopyButton>
        <button type="button" className="plain" onClick={() => downloadMd(g, v, defs)}>Markdownで書き出す</button>
      </div>
      <p className="note">入力はこのブラウザ内に自動保存され、外部には送信されない。</p>
    </section>
  );
}
