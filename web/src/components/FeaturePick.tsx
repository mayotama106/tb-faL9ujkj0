/* 対象のフィーチャー。切り分けのチケットから選ぶと、フィーチャー名と対象の部分が入り、切り分けの側からもこのチケットを開ける。
   impl は開発のチケット(実装チケット・バグチケット)、st はフィーチャー全体のST(STチケット) */
import { useMemo } from "react";
import { pickOptions, sameRef, type FeatRef } from "../domain/feature";
import { update, useStore } from "../state/store";
import { Field, useV } from "./Fields";

export function FeaturePick({ kind, optional }: { kind: "impl" | "st"; optional?: boolean }) {
  const v = useV();
  const features = useStore(s => s.data.features);
  const docId = useStore(s => s.ui.currentId);
  const opts = useMemo(() => pickOptions(features, kind), [features, kind]);
  const ref = v.feat_ref as FeatRef | undefined;
  const cur = opts.findIndex(o => sameRef(ref, o.ref));
  const pick = (i: number) => {
    const o = opts[i];
    if (!docId) return;
    update(d => {
      const doc = d.docs.find(x => x.id === docId);
      if (!doc) return;
      /* 前につながっていた切り分けのチケットからは、つながりを外す */
      if (ref) {
        const old = pickOptions(d.features, kind).find(x => sameRef(ref, x.ref));
        if (old && old.cell.docId === docId) delete old.cell.docId;
      }
      if (!o) { delete doc.v.feat_ref; doc.updatedAt = Date.now(); return; }
      doc.v.feat_name = o.name;
      doc.v.feat_part = o.part;
      doc.v.feat_ref = o.ref;
      if (!String(doc.v.title || "").trim()) doc.v.title = o.title;
      doc.v.feat_title = o.title;
      const now = pickOptions(d.features, kind).find(x => sameRef(o.ref, x.ref));
      if (now) now.cell.docId = docId;
      doc.updatedAt = Date.now();
    });
  };
  /* 切り分けの側で名前(フィーチャー・画面・イベント・タイトル)が変わったら、反映できるようにする。
     タイトルは、切り分けから入ったまま書き換えていないときだけ反映する */
  const o = cur >= 0 ? opts[cur] : null;
  const tt = (x: unknown) => String(x || "").trim();
  const titleFollows = !!o && tt(v.feat_title) !== "" && tt(v.title) === tt(v.feat_title);
  const stale = !!o && (o.name !== tt(v.feat_name) || (kind === "impl" && o.part !== tt(v.feat_part)) || (titleFollows && o.title !== tt(v.title)));
  const sync = () => update(d => {
    const doc = d.docs.find(x => x.id === docId);
    if (!doc || !o) return;
    doc.v.feat_name = o.name;
    if (kind === "impl") doc.v.feat_part = o.part;
    if (titleFollows) { doc.v.title = o.title; doc.v.feat_title = o.title; }
    doc.updatedAt = Date.now();
  });
  const what = kind === "st" ? "このSTで確かめるフィーチャーは？" : "このチケットで扱うのは、フィーチャーのどの部分か";
  return (
    <div className="node">
      <div className="head"><div className="q">対象のフィーチャーは？({what})</div>{optional && <span className="opt">任意</span>}</div>
      {opts.length > 0 && (
        <select className="feat-pick" value={cur} aria-label="切り分けのチケットから選ぶ" onChange={e => pick(Number(e.target.value))}>
          <option value={-1}>{cur < 0 ? "切り分けのチケットから選ぶ（選ぶと下の欄が入ります）" : "つながりを外す"}</option>
          {opts.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
        </select>
      )}
      {cur >= 0 && !stale && <p className="hint">切り分けのチケットとつながっています。実施状況は「切り分け」の画面で付けます。</p>}
      {stale && o && (
        <div className="feat-stale">
          <span>切り分けの名前が変わりました：{[o.name !== tt(v.feat_name) && o.name, kind === "impl" && o.part !== tt(v.feat_part) && o.part, titleFollows && o.title !== tt(v.title) && "タイトル「" + o.title + "」"].filter(Boolean).join("／")}</span>
          <button type="button" className="primary small" onClick={sync}>反映する</button>
        </div>
      )}
      <Field path={["feat_name"]} label="フィーチャー" ph="例: 会員情報の住所変更" />
      {kind === "impl" && <Field path={["feat_part"]} label="対象の部分(画面・処理 / イベント / 開発領域)" ph="例: 住所変更画面 / 変更ボタン押下 / BE" />}
    </div>
  );
}
