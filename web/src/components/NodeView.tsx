/* 観点表の問い1つ分の入力。子の問いを持つ場合は入れ子で表示する */
import type { ReactNode } from "react";
import { ERR_KINDS, HAS, HAS_NOT, LOGIC_SRC, REF, type Genre, type QNode } from "../domain/genres";
import { etcId, kidsOf, valueOf } from "../domain/ticket";
import { AutoText, Chips, EtcField, Field, Kids, Toggle, useCollapsed, useV } from "./Fields";
import { ItemList, ListControl, StepList } from "./Steps";
import { setValue } from "../state/store";

export function NodeView({ node, g }: { node: QNode; g: Genre }) {
  const v = useV();
  const closed = useCollapsed(node.id);
  const kids: ReactNode[] = [];
  let control: ReactNode = null;
  let labelFor: string | null = null;
  const srcChooser = (src: string) => (
    <div className="node" key="src">
      <div className="q">{node.label}の{src}はある？</div>
      <Chips path={[node.id + "_src"]} label={node.label + "の記載方法"} options={[REF]} />
    </div>
  );

  if (node.type === "group") {
    if (node.refChildren) control = <Chips path={[node.id + "_src"]} label="項目と形式の記載方法" options={[REF]} />;
    if (node.refChildren && v[node.id + "_src"] === REF) {
      kids.push(<Field key="link" path={[node.id + "_link"]} label={(g.srcLabel || LOGIC_SRC) + "のリンクは？"} />);
      node.refChildren.forEach(k => kids.push(<NodeView key={k.id} node={k} g={g} />));
    } else {
      (node.children || []).forEach(k => kids.push(<NodeView key={k.id} node={k} g={g} />));
    }
    kids.push(<EtcField key="etc" id={node.id + "__etc"} />);
  } else if (node.type === "logic") {
    if (!node.noHas) control = <Chips path={[node.id + "_has"]} label={node.label} options={[HAS_NOT, HAS]} />;
    if (node.noHas || v[node.id + "_has"] === HAS) {
      const src = node.src || LOGIC_SRC;
      kids.push(srcChooser(src));
      if (v[node.id + "_src"] === REF) {
        kids.push(<Field key="link" path={[node.id + "_link"]} label={src + "のリンクは？"} />);
      } else {
        kids.push(<div className="node" key="flow"><div className="q">処理の順序は？</div><StepList path={[node.id + "_steps"]} /></div>);
      }
      kids.push(<EtcField key="etc" id={node.id + "__etc"} />);
    }
  } else if (node.type === "events" || node.type === "elements") {
    const src = node.src || LOGIC_SRC;
    kids.push(srcChooser(src));
    if (v[node.id + "_src"] === REF) kids.push(<Field key="link" path={[node.id + "_link"]} label={src + "のリンクは？"} />);
    else kids.push(<ItemList key="items" node={node} />);
    kids.push(<EtcField key="etc" id={node.id + "__etc"} />);
  } else if (node.type === "error") {
    control = <Chips path={[node.id + "_kind"]} label={node.label} options={ERR_KINDS} />;
    const kind = v[node.id + "_kind"];
    if (kind === "その他") kids.push(<Field key="f" path={[node.id + "_efree"]} label="どう対処する？" />);
    else if (kind) {
      kids.push(<Field key="i" path={[node.id + "_eid"]} label="エラーIDは？" />);
      kids.push(<Field key="m" path={[node.id + "_emsg"]} label="エラーメッセージは？" />);
      kids.push(<Field key="l" path={[node.id + "_elog"]} label="ログレベルは？" />);
      if (kind === "エラー画面") kids.push(<Field key="x" path={[node.id + "_eetc"]} label="その他(ボタン配置など)" />);
    }
  } else {
    if (node.type === "choice" || node.type === "multi") {
      control = <Chips path={[node.id]} label={node.label} options={node.options || []} multi={node.type === "multi"} />;
    } else if (node.type === "list") {
      control = <ListControl node={node} />;
    } else {
      labelFor = "f_" + node.id;
      control = <AutoText id={labelFor} value={typeof v[node.id] === "string" ? v[node.id] : ""} placeholder={node.ph}
        onChange={s => setValue([node.id], s)} />;
    }
    const val = valueOf(node, v);
    kidsOf(node, val).forEach(k => kids.push(<NodeView key={k.id} node={k} g={g} />));
    const eid = etcId(node, val);
    if (eid) kids.push(<EtcField key={eid} id={eid} />);
  }

  return (
    <div className={node.type === "group" ? "node group" : "node"}>
      <div className="head">
        {kids.length > 0 && <Toggle k={node.id} label={node.label} />}
        {labelFor ? <label className="q" htmlFor={labelFor}>{node.q}</label> : <div className="q">{node.q}</div>}
        {node.optional && <span className="opt">任意</span>}
      </div>
      {control}
      {kids.length > 0 && !closed && <Kids>{kids}</Kids>}
    </div>
  );
}
