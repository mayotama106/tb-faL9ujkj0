/* STチケットの入力画面。パートは タイトル・実施概要 / 実施手順 / 受け入れ条件 */
import { ST_GROUPS } from "../domain/components";
import type { Genre, QNode } from "../domain/genres";
import { stepAc } from "../domain/st";
import { headsOf } from "../domain/ticket";
import { defsOf, useStore } from "../state/store";
import { BlockList } from "./Blocks";
import { Field, useVAt } from "./Fields";
import { ListControl } from "./Steps";

const listNode = (id: string, label: string, ph: string): QNode => ({ id, q: label, label, type: "list", ph });

export function StPart({ g, partKey }: { g: Genre; partKey: string }) {
  const h = headsOf(g);
  const defs = useStore(s => defsOf(s.data));
  const steps = useVAt(["steps"]);
  switch (partKey) {
    case "basic": return <>
      <Field path={["title"]} label="タイトル(Jiraの要約欄に入れる)" ph="例: ファイルアップロード機能のST実施" />
      <Field path={["content"]} label={h.content + "は？(何をテストするか。1行ごとに箇条書きになる)"} ph="例: ファイルアップロード機能の正常系・異常系をテストする" />
      <Field path={["schedule"]} label={h.schedule + "は？(1行ごとに箇条書きになる)"} ph={"例: 準備 10/20〜10/21\n実施 10/22〜10/24"} />
    </>;
    case "steps": return <>
      <p className="hint">手順の部品を上から並べる。部品ごとに、受け入れ条件が自動でできる。よく使う手順は最初から入っている(不要なら × で消す)。</p>
      <BlockList path={["steps"]} top groups={ST_GROUPS} />
    </>;
    case "ac": {
      const acs = stepAc(defs, steps);
      return <>
        <div className="node">
          <div className="q">実施手順から作る受け入れ条件</div>
          {acs.length ? <ul className="ac-auto">{acs.map((a, i) => <li key={i}>{a}</li>)}</ul>
            : <p className="hint">実施手順に部品を足すと、ここに受け入れ条件ができる。</p>}
          <p className="hint">文言は「テンプレートを編集」から部品ごとに変えられる。</p>
        </div>
        <div className="node">
          <div className="head"><div className="q">追加の受け入れ条件は？(手順と1対1でないもの)</div><span className="opt">任意</span></div>
          <ListControl node={listNode("ac_extra", "追加の受け入れ条件", "例: 不具合が起票され、担当者が決まっていること")} />
        </div>
      </>;
    }
  }
  return null;
}
