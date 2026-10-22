/* 実装チケットの入力画面。パートは タイトルとストーリー / 組み立て / 受け入れ条件 / 制約事項・技術的補足 */
import { useMemo } from "react";
import { allTickets, partOf, refOf, sameRef, type FeatRef } from "../domain/feature";
import { MOD, NEW, type Genre, type QNode } from "../domain/genres";
import { collectAc, scopeFromBlocks } from "../domain/impl";
import { headsOf, type Values } from "../domain/ticket";
import { defsOf, setValue, update, useStore } from "../state/store";
import { BlockList, CodeLists, ErrorEditor } from "./Blocks";
import { Chips, Field, useV } from "./Fields";
import { ListControl } from "./Steps";

const listNode = (id: string, label: string, ph: string): QNode => ({ id, q: label, label, type: "list", ph });

export function ImplPart({ g, partKey }: { g: Genre; partKey: string }) {
  const h = headsOf(g);
  const v = useV();
  const defs = useStore(s => defsOf(s.data));
  switch (partKey) {
    case "basic": return <>
      <Field path={["title"]} label="タイトル(Jiraの要約欄に入れる)" ph="例: ファイルアップロード機能の構築（BE）" />
      <FeaturePick />
      <Field path={["story_goal"]} label="何を提供したい？(誰に、どんな価値を)" ph="例: 口座開設審査に必要な書類をオンラインでアップロードできる機能を提供したい" />
      <div className="node">
        <div className="head"><div className="q">参照するものは？(APIや設計書。メソッドとパス)</div><span className="opt">任意</span></div>
        <ListControl node={listNode("story_refs", "参照するもの", "例: 機能AのアップロードAPIを参照する（PUT：/account/applications/documents/:documentType）")} />
      </div>
      <div className="node">
        <div className="q">{h.scopeIn}は？(本チケットで実装すること。1件ずつ)</div>
        <ListControl node={listNode("scope_in", h.scopeIn, "例: 書類をアップロードする基本的な機能")} />
        <ScopeFromBlocks />
      </div>
      <div className="node">
        <div className="q">{h.scopeOut}は？(本チケットでは実装しないこと。1件ずつ)</div>
        <ListControl node={listNode("scope_out", h.scopeOut, "例: アップロードした書類の削除(別チケット)")} />
        {!(Array.isArray(v.scope_out) ? v.scope_out : []).some((x: unknown) => typeof x === "string" && x.trim()) &&
          <div className="none-chip"><Chips path={["scope_out_none"]} label="スコープ外がない" options={["なし"]} /></div>}
      </div>
      <div className="node">
        <div className="q">新規作成か、既存改修か</div>
        <Chips path={["mod"]} label="作成区分" options={[NEW, MOD]} />
        {v.mod === MOD && <p className="hint">既存改修: 変更する欄だけ記入する。記入のない欄は本文に出ない。既存影響は必ず書く。</p>}
      </div>
    </>;
    case "build": {
      const hasSteps = (Array.isArray(v.blocks) ? v.blocks : []).some((b: Values) => defs[b.type] && !defs[b.type].container);
      return <>
        <CodeLists />
        <p className="hint">部品を上から足して組み立てる。入れ物(API・画面・DB)は本文の節になり、中に処理の部品を入れる。エラーハンドリングは、そのまま受け入れ条件になる。</p>
        {hasSteps && <Field path={["proc_name"]} label={"処理の名前は？(入れ物の外の部品の見出しが「〇〇" + h.flowSuffix + "」になる)"} ph="例: ファイルアップロード" />}
        <BlockList path={["blocks"]} top />
      </>;
    }
    case "ac": {
      const groups = collectAc(defs, v);
      return <>
        <CodeLists />
        <p className="hint">組み立ての部品ごとに自動で作る(部品1つにつき1件。その下に、エラーハンドリングと「〇〇場合」が並ぶ)。エラーの内容はここでまとめて記入できる(部品の側と同じ値)。文言は「テンプレートを編集」から部品ごとに変えられる。</p>
        {groups.length ? (
          <div className="ac-table">
            {groups.map((gr, i) => (
              <div key={i} className="ac-group">
                <div className="q">{gr.lead}</div>
                {gr.cases.map((c, j) => c.err && c.path ? (
                  <div key={c.path.join(".")} className="ac-case">
                    <span className="lbl">{c.label}</span>
                    <ErrorEditor path={c.path} />
                  </div>
                ) : <div key={"t" + j} className="ac-case plain">{c.label}</div>)}
              </div>
            ))}
          </div>
        ) : <p className="hint">組み立てで部品を足すと、ここに受け入れ条件ができる。</p>}
        <div className="node ac-ok">
          <div className="q">{h.okCase}は？</div>
          <Field path={["ok_status"]} label="HTTPステータス" ph="例: 200" />
          <Field path={["ok_body"]} label="返す内容は？(任意)" ph="例: アップロードした書類のID" />
        </div>
        <div className="node">
          <div className="head"><div className="q">追加の受け入れ条件は？</div><span className="opt">任意</span></div>
          <ListControl node={listNode("ac_extra", "追加の受け入れ条件", "例: アップロードした書類が審査画面で表示されること")} />
        </div>
      </>;
    }
    case "notes": return <>
      <div className="node">
        <div className="q">{h.deps}は？(1件ずつ。改行して2行目にリンク)</div>
        <ListControl node={listNode("deps", h.deps, "例: 正式資材受領は11/17予定\n(2行目) デザイン対応計画リンク")} />
        {!(Array.isArray(v.deps) ? v.deps : []).some((x: unknown) => typeof x === "string" && x.trim()) &&
          <div className="none-chip"><Chips path={["deps_none"]} label="依存関係がない" options={["なし"]} /></div>}
      </div>
      <Field path={["branch"]} label={h.branch + "は？(改行して2行目にリンク)"} ph={"例: 開発ブランチはX面\n(2行目) ブランチ反映予定リンク"} />
      <p className="hint">以下は任意。空なら本文に出さない(既存改修のときは既存影響を必ず書く)。</p>
      <Field path={["call"]} label={h.call + "は？(何を起因に、誰から、いつ呼び出される)"} />
      <Field path={["nonfunc"]} label={h.nonfunc + "は？(呼び出し頻度、タイムアウト、データ量の上限)"} />
      <Field path={["impact"]} label={h.impact + "は？(既存改修の場合。設計書やIFの書き直しの要否も)"} />
    </>;
  }
  return null;
}

/* 対象のフィーチャー。切り分けのチケットから選ぶと、フィーチャー名と対象の部分が入り、切り分けの側からもこのチケットを開ける */
function FeaturePick() {
  const v = useV();
  const features = useStore(s => s.data.features);
  const docId = useStore(s => s.ui.currentId);
  const opts = useMemo(() => allTickets(features), [features]);
  const ref = v.feat_ref as FeatRef | undefined;
  const cur = opts.findIndex(o => sameRef(ref, refOf(o.f, o.tk)));
  const pick = (i: number) => {
    const o = opts[i];
    if (!docId) return;
    update(d => {
      const doc = d.docs.find(x => x.id === docId);
      if (!doc) return;
      /* 前につながっていた切り分けのチケットからは、つながりを外す */
      if (ref) {
        const old = allTickets(d.features).find(x => sameRef(ref, refOf(x.f, x.tk)));
        if (old && old.tk.cell.docId === docId) delete old.tk.cell.docId;
      }
      if (!o) { delete doc.v.feat_ref; doc.updatedAt = Date.now(); return; }
      doc.v.feat_name = o.f.name.trim();
      doc.v.feat_part = partOf(o.tk);
      doc.v.feat_ref = refOf(o.f, o.tk);
      const now = allTickets(d.features).find(x => sameRef(doc.v.feat_ref, refOf(x.f, x.tk)));
      if (now) now.tk.cell.docId = docId;
      doc.updatedAt = Date.now();
    });
  };
  return (
    <div className="node">
      <div className="q">対象のフィーチャーは？(このチケットで実装するのは、フィーチャーのどの部分か)</div>
      {opts.length > 0 && (
        <select className="feat-pick" value={cur} aria-label="切り分けのチケットから選ぶ" onChange={e => pick(Number(e.target.value))}>
          <option value={-1}>{cur < 0 ? "切り分けのチケットから選ぶ(選ぶと下の2つが入る)" : "つながりを外す"}</option>
          {opts.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
        </select>
      )}
      {cur >= 0 && <p className="hint">切り分けのチケットとつながっている。実施状況は「フィーチャー」の切り分けで付ける。</p>}
      <Field path={["feat_name"]} label="フィーチャー" ph="例: 書類のオンライン提出" />
      <Field path={["feat_part"]} label="対象の部分(起点 / イベント / 開発領域)" ph="例: 書類提出画面 / 保存ボタン押下 / BE" />
    </div>
  );
}

/* 組み立てを直したあと、スコープ内を部品の見出しに合わせて作り直す */
function ScopeFromBlocks() {
  const v = useV();
  const defs = useStore(s => defsOf(s.data));
  const next = scopeFromBlocks(defs, v);
  const cur = (Array.isArray(v.scope_in) ? v.scope_in : []).map((x: unknown) => String(x).trim()).filter(Boolean);
  if (!next.length || next.join("\n") === cur.join("\n")) return null;
  return (
    <div className="scope-sync">
      <span className="hint">組み立ての部品と、スコープ内が合っていません。</span>
      <button type="button" className="plain small-btn" onClick={() => setValue(["scope_in"], next, false)}>組み立ての部品から作り直す（{next.join("、")}）</button>
    </div>
  );
}
