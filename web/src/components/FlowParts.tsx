/* 処理の流れの形式(ロジック作成)の入力画面。
   工程(チェック群・処理実行・条件分岐・エラーを返却)を足して処理の流れを作り、
   受け入れ条件はチェックとエラー返却から作る(domain/flow.ts) */
import type { ReactNode } from "react";
import type { Genre, QNode } from "../domain/genres";
import { NONE, collectAc } from "../domain/flow";
import { headsOf, type Values } from "../domain/ticket";
import { editDoc, getAt, newId, setAt, setValue, toast } from "../state/store";
import { Chips, Field, Kids, Toggle, focusLater, useCollapsed, useV, useVAt } from "./Fields";
import { SortableList, move } from "./Sortable";
import { ListControl } from "./Steps";

type Path = (string | number)[];
const KIND_NAMES: Record<string, string> = { checks: "チェック群", do: "処理実行", if: "条件分岐", error: "エラーを返却" };
const STATUSES = ["200", "201", "204", "400", "401", "403", "404", "409", "422", "500", "503"];
const listNode = (id: string, label: string, ph: string): QNode => ({ id, q: label, label, type: "list", ph });

function arrayAt(v: Values, path: Path): Values[] {
  let a = getAt(v, path);
  if (!Array.isArray(a)) { setAt(v, path, []); a = getAt(v, path); }
  return a;
}
const fid = (path: Path) => "f_" + path.join("_");

export function FlowPart({ g, partKey }: { g: Genre; partKey: string }) {
  const h = headsOf(g);
  const v = useV();
  /* 同じチケットで使ったHTTPステータスとエラーコードを、入力候補に出す */
  const codes = new Set<string>(), statuses = new Set<string>(STATUSES);
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      const o = x as Values;
      if (typeof o.code === "string" && o.code.trim()) codes.add(o.code.trim());
      if (typeof o.status === "string" && o.status.trim()) statuses.add(o.status.trim());
      Object.values(o).forEach(walk);
    }
  };
  walk(v.flow);
  const lists = <>
    <datalist id="dl-code">{[...codes].sort().map(c => <option key={c} value={c} />)}</datalist>
    <datalist id="dl-status">{[...statuses].sort().map(c => <option key={c} value={c} />)}</datalist>
  </>;

  switch (partKey) {
    case "basic": return <>
      <Field path={["title"]} label="タイトル(Jiraの要約欄に入れる)" ph="例: ファイルアップロード機能の構築（BE）" />
      <Field path={["story_goal"]} label="何を提供したい？(誰に、どんな価値を)" ph="例: 口座開設審査に必要な書類をオンラインでアップロードできる機能を提供したい" />
      <Field path={["story_scope"]} label="本チケットの範囲は？(何を実装するか)" ph="例: 本チケットでは書類をアップロードする基本的な機能を実装する" />
      <div className="node">
        <div className="head"><div className="q">参照するものは？(APIや設計書。メソッドとパス)</div><span className="opt">任意</span></div>
        <ListControl node={listNode("story_refs", "参照するもの", "例: 機能AのアップロードAPIを参照する（PUT：/account/applications/documents/:documentType）")} />
      </div>
    </>;
    case "flow": return <>
      {lists}
      <Field path={["proc_name"]} label={"処理の名前は？(見出しは「〇〇" + h.flowSuffix + "」になる)"} ph="例: ファイルアップロード" />
      <div className="guide">
        <div className="q">抜けやすい観点</div>
        <ul>
          <li>リクエストの各項目に、存在・形式・桁のチェックがあるか</li>
          <li>チェックをどこで行うか(ミドルウェアなど)を、受け入れ条件での書き方に書いたか</li>
          <li>取得・更新の対象が見つからない場合、0件の場合を、条件分岐とエラー返却にしたか</li>
          <li>保存や更新に失敗した場合を書いたか</li>
        </ul>
      </div>
      <div className="node">
        <div className="q">処理の流れは？(工程を上から足す)</div>
        <FlowList path={["flow"]} top />
      </div>
    </>;
    case "ac": return <>
      {lists}
      <p className="hint">処理の流れのチェックとエラー返却から自動で作る。HTTPステータスとエラーコードは、ここでまとめて記入できる(処理の流れの側と同じ値)。</p>
      <AcTable />
      <div className="node ac-ok">
        <div className="q">{h.okCase}は？</div>
        <div className="codes">
          <label>HTTPステータス<CodeInput path={["ok_status"]} kind="status" /></label>
        </div>
        <Field path={["ok_body"]} label="返す内容は？(任意)" ph="例: アップロードした書類のID" />
      </div>
      <div className="node">
        <div className="head"><div className="q">追加の受け入れ条件は？</div><span className="opt">任意</span></div>
        <ListControl node={listNode("ac_extra", "追加の受け入れ条件", "例: アップロードした書類が審査画面で表示されること")} />
      </div>
    </>;
    case "notes": return <>
      <div className="node">
        <div className="q">{h.deps}は？(1件ずつ。改行して2行目にリンク)</div>
        <ListControl node={listNode("deps", h.deps, "例: 正式資材受領は11/17予定\n(2行目) デザイン対応計画リンク")} />
        {!(Array.isArray(v.deps) ? v.deps : []).some((x: unknown) => typeof x === "string" && x.trim()) &&
          <div className="none-chip"><Chips path={["deps_none"]} label="依存関係がない" options={["なし"]} /></div>}
      </div>
      <Field path={["branch"]} label={h.branch + "は？(改行して2行目にリンク)"} ph={"例: 開発ブランチはX面\n(2行目) ブランチ反映予定リンク"} />
      <p className="hint">以下は任意。空なら本文に出さない。</p>
      <Field path={["call"]} label={h.call + "は？(何を起因に、誰から、いつ呼び出される)"} />
      <Field path={["nonfunc"]} label={h.nonfunc + "は？(呼び出し頻度、タイムアウト、データ量の上限)"} />
      <Field path={["impact"]} label={h.impact + "は？(既存改修の場合。設計書の書き直しの要否も)"} />
    </>;
  }
  return null;
}

/* HTTPステータスとエラーコードの入力欄。同じチケットで使った値を候補に出す */
function CodeInput({ path, kind }: { path: Path; kind: "status" | "code" }) {
  const val = useVAt(path);
  const s = typeof val === "string" ? val : "";
  return (
    <input type="text" id={fid(path)} list={"dl-" + kind} value={s} className={s.trim() ? "code" : "code empty"}
      placeholder="未記入" aria-label={kind === "status" ? "HTTPステータス" : "エラーコード"}
      onChange={e => setValue(path, e.target.value)} />
  );
}
function Codes({ path }: { path: Path }) {
  return (
    <div className="codes">
      <label>HTTPステータス<CodeInput path={[...path, "status"]} kind="status" /></label>
      <label>エラーコード<CodeInput path={[...path, "code"]} kind="code" /></label>
    </div>
  );
}

/* 受け入れ条件の一覧。チェックとエラー返却ごとに、HTTPステータスとエラーコードを記入する */
function AcTable() {
  const flow = useVAt(["flow"]);
  const groups = collectAc(flow);
  if (!groups.length) return <p className="hint">処理の流れにチェック群やエラー返却を足すと、ここに受け入れ条件ができる。</p>;
  return (
    <div className="ac-table">
      {groups.map((gr, i) => (
        <div key={i} className="ac-group">
          <div className="q">{gr.lead}</div>
          {gr.cases.map(c => (
            <div key={c.path.join(".")} className="ac-case">
              <span className="lbl">{c.label}</span>
              <Codes path={c.path} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Del({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="del" aria-label={label} title="削除" onClick={onClick}>×</button>;
}

/* 工程の一覧。top は処理の流れの直下(番号付き)。エラー返却は条件分岐の中にだけ足せる */
function FlowList({ path, top }: { path: Path; top?: boolean }) {
  const arr: Values[] = useVAt(path) || [];
  const ids = arr.map((s, i) => s._k || "i" + i);
  const kinds = ["checks", "do", "if"].concat(top ? [] : ["error"]);
  const add = (kind: string) => {
    const _k = newId();
    const st: Values = kind === "checks" ? { _k, kind, text: "", ac: "", items: [{ _k: newId(), name: "", detail: "", status: "", code: "" }] }
      : kind === "if" ? { _k, kind, text: "", ac: "", yes: "", no: "", then: [], else: [] }
      : kind === "error" ? { _k, kind, status: "", code: "", detail: "" }
      : { _k, kind, text: "", detail: "" };
    focusLater(fid([...path, arr.length, kind === "error" ? "status" : "text"]));
    editDoc(v => { arrayAt(v, path).push(st); });
  };
  return (
    <div className="steps">
      <SortableList ids={ids} onMove={(f, t) => editDoc(v => move(arrayAt(v, path), f, t))}>
        {(_id, i, handle) => <FlowStep path={path} index={i} top={!!top} handle={handle} />}
      </SortableList>
      <div className="links">
        {kinds.map(k => <button key={k} type="button" className="etc-btn" onClick={() => add(k)}>＋ {KIND_NAMES[k]}</button>)}
      </div>
    </div>
  );
}

function FlowStep({ path, index, top, handle }: { path: Path; index: number; top: boolean; handle: ReactNode }) {
  const me = [...path, index];
  const st: Values | undefined = useVAt(me);
  const closed = useCollapsed("k:" + (st && st._k));
  if (!st) return null;
  const name = KIND_NAMES[st.kind] || "工程";
  const summary = closed && (st.text || "").trim() ? ": " + (st.text || "").trim().split("\n")[0] : "";
  const badge = st.kind === "if" ? "badge if" : st.kind === "error" ? "badge err" : st.kind === "checks" ? "badge chk" : "badge";
  return (
    <div className="step">
      <div className="step-head">
        <Toggle k={"k:" + st._k} label={name + " " + (index + 1)} />
        {handle}
        <span className={badge}>{top ? index + 1 + ". " : ""}{name}{summary}</span>
        <span className="spacer" />
        <Del label={name + " " + (index + 1) + " を削除"} onClick={() => {
          editDoc(v => { arrayAt(v, path).splice(index, 1); });
          toast(name + "を削除した", true);
        }} />
      </div>
      {!closed && <Kids><StepBody me={me} st={st} /></Kids>}
    </div>
  );
}

function StepBody({ me, st }: { me: Path; st: Values }) {
  if (st.kind === "checks") return <>
    <Field path={[...me, "text"]} label="チェック群の名前は？" ph="例: アップロードファイルの業務チェック" />
    <Field path={[...me, "ac"]} label="受け入れ条件での書き方は？(任意)"
      ph={"例: ミドルウェアでバリデーションチェックがされていること\n空なら「" + ((st.text || "").trim() || "チェック群の名前") + "がされていること」"} />
    <div className="node"><div className="q">チェックは？(1つずつ足す)</div><CheckItems path={[...me, "items"]} /></div>
  </>;
  if (st.kind === "error") return <>
    <Codes path={me} />
    <Field path={[...me, "detail"]} label="補足(任意)" />
  </>;
  if (st.kind === "if") return <>
    <Field path={[...me, "text"]} label="何を確認する？" ph="例: ステータスを元に編集可否をチェック" />
    <Field path={[...me, "ac"]} label="受け入れ条件での書き方は？(任意。中にエラー返却がある場合に使う)"
      ph={"例: ステータスによる編集可否のチェックがされていること"} />
    {([["yes", "then", "thenNone", "満たす場合", "例: 編集可能"], ["no", "else", "elseNone", "満たさない場合", "例: 編集不可"]] as const)
      .map(([lab, key, none, title, ph]) => (
        <div className="branch-box" key={key}>
          <Field path={[...me, lab]} label={title + "は？(「〇〇であれば」の〇〇)"} ph={ph} />
          <Chips path={[...me, none]} label={title + "の処理"} options={[NONE]} />
          {!st[none] && <FlowList path={[...me, key]} />}
        </div>
      ))}
  </>;
  return <>
    <Field path={[...me, "text"]} label="何をする？" ph="例: Xをキーにステータスを取得" />
    <Field path={[...me, "detail"]} label="詳細(任意。1行ごとに箇条書きになる)" />
  </>;
}

/* チェック群の中のチェック。名前、詳細、引っかかる場合のHTTPステータスとエラーコードを持つ */
function CheckItems({ path }: { path: Path }) {
  const arr: Values[] = useVAt(path) || [];
  const ids = arr.map((s, i) => s._k || "i" + i);
  return <>
    <SortableList ids={ids} onMove={(f, t) => editDoc(v => move(arrayAt(v, path), f, t))}>
      {(_id, i, handle) => (
        <div className="check-item">
          <div className="row">
            {handle}
            <div className="grow"><Field path={[...path, i, "name"]} label={"チェック " + (i + 1)} ph="例: ０バイトファイルチェック" /></div>
            <Del label={"チェック " + (i + 1) + " を削除"} onClick={() => {
              editDoc(v => { arrayAt(v, path).splice(i, 1); });
              toast("チェックを削除した", true);
            }} />
          </div>
          <Field path={[...path, i, "detail"]} label="詳細(任意)" ph="例: 拡張子が「.pdf」かどうか" />
          <div className="node"><div className="q small">引っかかる場合</div><Codes path={[...path, i]} /></div>
        </div>
      )}
    </SortableList>
    <button type="button" className="etc-btn" onClick={() => {
      focusLater(fid([...path, arr.length, "name"]));
      editDoc(v => { arrayAt(v, path).push({ _k: newId(), name: "", detail: "", status: "", code: "" }); });
    }}>＋ チェックを追加</button>
  </>;
}
