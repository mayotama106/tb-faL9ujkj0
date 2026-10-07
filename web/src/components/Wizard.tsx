/* チケットの入力画面。チケットをパートに分け、1パートずつ埋めていく */
import { useState, type ReactNode } from "react";
import { MOD, NEW, type Genre } from "../domain/genres";
import { headsOf, type Ticket } from "../domain/ticket";
import { clearDoc, duplicateDoc, goPart } from "../state/actions";
import { FINAL, partsOf, type Part } from "../state/parts";
import type { Doc } from "../state/store";
import { copyText, downloadMd, titleOf } from "../utils";
import { Chips, EtcField, Field } from "./Fields";
import { FlowPart } from "./FlowParts";
import { NodeView } from "./NodeView";

export function Wizard({ doc, g, ticket, partKey }: { doc: Doc; g: Genre; ticket: Ticket; partKey: string }) {
  const parts = partsOf(g);
  const idx = Math.max(0, parts.findIndex(p => p.key === partKey));
  const part = parts[idx];
  const missingOf = (key: string) => ticket.blocks.filter(b => b.key === key).reduce((n, b) => n + b.missing, 0);
  const prev = parts[idx - 1], next = parts[idx + 1];
  return (
    <div className="wizard">
      <nav className="stepper" aria-label="パート">
        {parts.map((p, i) => {
          const m = p.key === FINAL ? ticket.missing : missingOf(p.key);
          return (
            <button key={p.key} type="button" className={"step-tab" + (i === idx ? " cur" : "")}
              aria-current={i === idx ? "step" : undefined} onClick={() => goPart(doc.id, p.key)}>
              <span className="num">{i + 1}</span>
              <span className="t">{p.title}</span>
              {p.key !== FINAL && <span className={m ? "st miss" : "st done"}>{m ? m : "✓"}</span>}
            </button>
          );
        })}
      </nav>
      <section className="card part" key={doc.id + part.key}>
        <h2><span className="pnum">{idx + 1} / {parts.length}</span>{part.title}</h2>
        <PartBody doc={doc} g={g} part={part} parts={parts} ticket={ticket} missingOf={missingOf} />
      </section>
      <div className="pager">
        {prev ? <button type="button" className="plain" onClick={() => goPart(doc.id, prev.key)}>← {prev.title}</button> : <span />}
        {next && <button type="button" className="primary" onClick={() => goPart(doc.id, next.key)}>次へ: {next.title} →</button>}
      </div>
    </div>
  );
}

function PartBody({ doc, g, part, parts, ticket, missingOf }: {
  doc: Doc; g: Genre; part: Part; parts: Part[]; ticket: Ticket; missingOf: (k: string) => number;
}) {
  const v = doc.v;
  const isMod = v.mod === MOD;
  const nodes = (list: Genre["func"]) => (list || []).map(n => <NodeView key={n.id} node={n} g={g} />);
  const modNote = isMod && <p className="hint">既存改修: 変更点だけ記入する。記入のない項目は本文に出ない。</p>;
  if (g.flow && part.key !== FINAL) return <FlowPart g={g} partKey={part.key} />;
  switch (part.key) {
    case "basic": return <>
      <Field path={["title"]} label="タイトル(Jiraの要約欄に入れる)" />
      <Field path={["story"]} label={g.sections ? g.storyLabel || "概要" : headsOf(g).story}
        ph={g.sections ? g.storyHint : "誰が、何を、なぜ必要としているか"} />
    </>;
    case "kind": return <>
      <Field path={["api_name"]} label={g.noun + "の名前は？"} ph={g.example} />
      <div className="node"><div className="q">新規作成か、既存改修か</div><Chips path={["mod"]} label="作成区分" options={[NEW, MOD]} /></div>
    </>;
    case "func": return <>{modNote}{nodes(g.func)}<EtcField id="func__etc" /></>;
    case "nonfunc": return <>{modNote}{nodes(g.nonfunc)}<EtcField id="nonfunc__etc" /></>;
    case "other": return <>
      {isMod ? nodes(g.modOnly) : <p className="hint">作成区分で「既存改修」を選ぶと、既存影響などの問いが出る。</p>}
      <EtcField id="other__etc" />
    </>;
    case "refs": return <>
      <Field path={["deps"]} label={headsOf(g).deps} ph="先行チケット、他チームの成果物、対象環境" />
      <Field path={["refs"]} label={headsOf(g).refs} ph={g.sections ? "関連チケット、設計書などのリンク" : "設計書やIF定義などのリンク"} />
    </>;
    case FINAL: return <Final doc={doc} g={g} parts={parts} ticket={ticket} missingOf={missingOf} />;
  }
  const sec = (g.sections || []).find(s => "sec:" + s.key === part.key);
  if (!sec) return null;
  return <>
    {sec.lead && <p className="hint">1行目は固定: {sec.lead}</p>}
    {nodes(sec.nodes)}
    <EtcField id={sec.key + "__etc"} />
  </>;
}

/* 仕上げ: パートごとの未記入の確認と、書き出し */
function Final({ doc, g, parts, ticket, missingOf }: { doc: Doc; g: Genre; parts: Part[]; ticket: Ticket; missingOf: (k: string) => number }) {
  return <>
    <p className="hint">{ticket.missing ? "未記入が " + ticket.missing + " 件ある。埋めるパートを選ぶ。" : "未記入はない。本文をコピーしてJiraに貼る。"}</p>
    <ul className="review">
      {parts.filter(p => p.key !== FINAL).map(p => {
        const m = missingOf(p.key);
        return (
          <li key={p.key}>
            <span className={m ? "st miss" : "st done"}>{m ? m : "✓"}</span>
            <button type="button" className="link" onClick={() => goPart(doc.id, p.key)}>{p.title}</button>
            <span className="meta">{m ? "未記入 " + m + " 件" : "記入済み"}</span>
          </li>
        );
      })}
    </ul>
    <div className="actions">
      <CopyButton className="primary" text={() => ticket.text} done="本文をコピーした">本文をコピー</CopyButton>
      <CopyButton className="plain" text={() => titleOf(doc.v)} done="タイトルをコピーした">タイトルをコピー</CopyButton>
      <button type="button" className="plain" onClick={() => downloadMd(g, doc.v)}>Markdownで書き出す</button>
      <span className="spacer" />
      <button type="button" className="plain" onClick={() => duplicateDoc(doc.id)}>複製して新しく作る</button>
      <button type="button" className="plain" onClick={() => clearDoc(doc.id)}>入力を消去</button>
    </div>
  </>;
}

export function CopyButton({ text, done, className, children }: { text: () => string; done: string; className: string; children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  return (
    <button type="button" className={className} onClick={async () => {
      const ok = await copyText(text());
      setLabel(ok ? done : "コピーできなかった");
      setTimeout(() => setLabel(null), 1800);
    }}>{label || children}</button>
  );
}
