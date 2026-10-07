/* 実装チケットの入力画面。パートは タイトルとストーリー / 組み立て / 受け入れ条件 / 制約事項・技術的補足 */
import { MOD, NEW, type Genre, type QNode } from "../domain/genres";
import { collectAc } from "../domain/impl";
import { headsOf, type Values } from "../domain/ticket";
import { defsOf, useStore } from "../state/store";
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
      <Field path={["story_goal"]} label="何を提供したい？(誰に、どんな価値を)" ph="例: 口座開設審査に必要な書類をオンラインでアップロードできる機能を提供したい" />
      <Field path={["story_scope"]} label="本チケットの範囲は？(何を実装するか)" ph="例: 本チケットでは書類をアップロードする基本的な機能を実装する" />
      <div className="node">
        <div className="head"><div className="q">参照するものは？(APIや設計書。メソッドとパス)</div><span className="opt">任意</span></div>
        <ListControl node={listNode("story_refs", "参照するもの", "例: 機能AのアップロードAPIを参照する（PUT：/account/applications/documents/:documentType）")} />
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
        <p className="hint">部品の中のエラーハンドリングから自動で作る。ここでまとめて記入できる(部品の側と同じ値)。</p>
        {groups.length ? (
          <div className="ac-table">
            {groups.map((gr, i) => (
              <div key={i} className="ac-group">
                <div className="q">{gr.lead}</div>
                {gr.cases.map(c => (
                  <div key={c.path.join(".")} className="ac-case">
                    <span className="lbl">{c.label}</span>
                    <ErrorEditor path={c.path} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : <p className="hint">組み立てでエラーハンドリングを足すと、ここに受け入れ条件ができる。</p>}
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
