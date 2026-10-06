/* 入れ子を持つ入力: 項目の一覧、工程、画面の要素、イベント */
import type { ReactNode } from "react";
import { EL_KINDS, ERR_KINDS, type QNode } from "../domain/genres";
import type { Values } from "../domain/ticket";
import { editDoc, getAt, newId, setAt, setValue, toast } from "../state/store";
import { AutoText, Chips, Field, Kids, Toggle, focusLater, useCollapsed, useVAt } from "./Fields";
import { SortableList, move } from "./Sortable";

type Path = (string | number)[];

/* 配列を取り出す。なければ作る(immer の下書きの中で使う) */
function arrayAt(v: Values, path: Path): Values[] {
  let a = getAt(v, path);
  if (!Array.isArray(a)) { setAt(v, path, []); a = getAt(v, path); }
  return a;
}
function removeAt(path: Path, i: number, what: string) {
  editDoc(v => { arrayAt(v, path).splice(i, 1); });
  toast(what + "を削除した", true);
}
function moveAt(path: Path) {
  return (from: number, to: number) => editDoc(v => move(arrayAt(v, path), from, to));
}
function Del({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="del" aria-label={label} title="削除" onClick={onClick}>×</button>;
}

/* ===== 1項目1入力欄の一覧。Enter は改行、Ctrl+Enter(MacはCommand+Enter)で項目を足す ===== */
export function ListControl({ node }: { node: QNode }) {
  const raw = useVAt([node.id]);
  let items: string[] = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split("\n") : [];
  if (!items.length) items = [""];
  /* 旧形式(改行区切りの文字列)や空の値は、書き換えるときに配列にする */
  const edit = (fn: (a: string[]) => void, coalesce?: string) => editDoc(v => {
    if (!Array.isArray(v[node.id]) || !v[node.id].length) v[node.id] = items.slice();
    fn(v[node.id]);
  }, { coalesce: coalesce ? "list:" + node.id + ":" + coalesce : undefined });
  const add = () => { focusLater("f_" + node.id + "_" + items.length); edit(a => { a.push(""); }); };
  const ids = items.map((_, i) => node.id + "#" + i);
  return (
    <div className="rows" role="group" aria-label={node.label}>
      <SortableList ids={ids} onMove={(f, t) => edit(a => move(a, f, t))}>
        {(id, i, handle) => (
          <div className="row" key={id}>
            {items.length > 1 && handle}
            <AutoText id={"f_" + node.id + "_" + i} value={items[i]} placeholder={node.ph} label={node.label + " " + (i + 1)}
              onChange={s => edit(a => { a[i] = s; }, String(i))}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
            <Del label={node.label + " " + (i + 1) + " を削除"} onClick={() => {
              edit(a => { a.splice(i, 1); });
              if (items[i].trim()) toast("項目を削除した", true);
            }} />
          </div>
        )}
      </SortableList>
      <button type="button" className="etc-btn" onClick={add} title="Ctrl+Enter でも足せる">＋ 項目を追加</button>
    </div>
  );
}

/* ===== ロジックの工程 ===== */
export function StepList({ path, isChild }: { path: Path; isChild?: boolean }) {
  const arr: Values[] = useVAt(path) || [];
  const ids = arr.map((s, i) => s._k || "i" + i);
  const kinds: [string, string][] = [["do", "＋ 処理実行"], ["if", "＋ 条件分岐"]];
  if (isChild) kinds.push(["err", "＋ エラーハンドリング"]);   /* 子の工程にだけ足せる */
  return (
    <div className="steps">
      <SortableList ids={ids} onMove={moveAt(path)}>
        {(_id, i, handle) => <Step path={path} index={i} handle={handle} />}
      </SortableList>
      <div className="links">
        {kinds.map(([kind, label]) => (
          <button key={kind} type="button" className="etc-btn" onClick={() => {
            const _k = newId();
            focusLater("s_" + _k);
            editDoc(v => {
              arrayAt(v, path).push(kind === "if" ? { _k, kind, text: "", then: [], else: [] }
                : kind === "err" ? { _k, kind, ek: "" } : { _k, kind, text: "", kids: [] });
            });
          }}>{label}</button>
        ))}
      </div>
    </div>
  );
}

function Step({ path, index, handle }: { path: Path; index: number; handle: ReactNode }) {
  const me = [...path, index];
  const st: Values | undefined = useVAt(me);
  const closed = useCollapsed("k:" + (st && st._k));
  if (!st) return null;
  if (st.kind === "err") return <ErrStep path={path} index={index} st={st} closed={closed} handle={handle} />;
  const isIf = st.kind === "if";
  const name = isIf ? "条件分岐" : "処理実行";
  const kids: Values[] = Array.isArray(st.kids) ? st.kids : [];
  const hasKids = isIf || kids.length > 0 || !!st.open;
  const noteShown = !!(st.note || "").trim() || !!st.noteOpen;
  const nested = isIf ? (st.then || []).length + (st.else || []).length : kids.length;
  return (
    <div className="step">
      <div className="step-head">
        {(hasKids || noteShown) ? <Toggle k={"k:" + st._k} label={"工程 " + (index + 1)} /> : <span className="tog-space" />}
        {handle}
        <span className={isIf ? "badge if" : "badge"}>{index + 1}. {name}</span>
        <span className="spacer" />
        <Del label={"工程 " + (index + 1) + " を削除"} onClick={() => removeAt(path, index, nested ? "工程と、その下の工程" : "工程")} />
      </div>
      <AutoText id={"s_" + st._k} value={st.text || ""} placeholder={isIf ? "条件" : "処理の内容"} label={name + " " + (index + 1)}
        onChange={s => setValue([...me, "text"], s)} />
      {!closed && (
        <Kids>
          {isIf ? <>
            <div className="branch">満たす場合</div>
            <StepList path={[...me, "then"]} isChild />
            <div className="branch">満たさない場合</div>
            <StepList path={[...me, "else"]} isChild />
          </> : hasKids && <StepList path={[...me, "kids"]} isChild />}
          {noteShown && <div className="note-field"><Field path={[...me, "note"]} label="補足" /></div>}
          {(!noteShown || (!isIf && !hasKids)) && (
            <div className="links">
              {!noteShown && <button type="button" className="etc-btn" onClick={() => {
                focusLater("f_" + [...me, "note"].join("_")); setValue([...me, "noteOpen"], true, false);
              }}>＋ 補足を書く</button>}
              {!isIf && !hasKids && <button type="button" className="etc-btn"
                onClick={() => setValue([...me, "open"], true, false)}>＋ 子の工程を追加</button>}
            </div>
          )}
        </Kids>
      )}
    </div>
  );
}

/* エラーハンドリングの工程。種類を選ぶと、種類に応じた入力欄が出る */
function ErrStep({ path, index, st, closed, handle }: { path: Path; index: number; st: Values; closed: boolean; handle: ReactNode }) {
  const me = [...path, index];
  const noteShown = !!(st.note || "").trim() || !!st.noteOpen;
  return (
    <div className="step">
      <div className="step-head">
        {(st.ek || noteShown) ? <Toggle k={"k:" + st._k} label={"工程 " + (index + 1)} /> : <span className="tog-space" />}
        {handle}
        <span className="badge err">{index + 1}. エラーハンドリング</span>
        <span className="spacer" />
        <Del label={"工程 " + (index + 1) + " を削除"} onClick={() => removeAt(path, index, "工程")} />
      </div>
      <Chips path={[...me, "ek"]} label="エラーハンドリングの種類" options={ERR_KINDS} />
      {!closed && (
        <Kids>
          <ErrFields path={me} kind={st.ek} />
          {noteShown ? <div className="note-field"><Field path={[...me, "note"]} label="補足" /></div> : (
            <div className="links">
              <button type="button" className="etc-btn" onClick={() => {
                focusLater("f_" + [...me, "note"].join("_")); setValue([...me, "noteOpen"], true, false);
              }}>＋ 補足を書く</button>
            </div>
          )}
        </Kids>
      )}
    </div>
  );
}

/* エラーの種類ごとの入力欄(o は ek, eid, emsg, elog, eetc, efree を持つ) */
function ErrFields({ path, kind }: { path: Path; kind: string }) {
  if (kind === "その他") return <Field path={[...path, "efree"]} label="どう対処する？" />;
  if (!kind) return null;
  return <>
    <Field path={[...path, "eid"]} label="エラーIDは？" />
    <Field path={[...path, "emsg"]} label="エラーメッセージは？" />
    <Field path={[...path, "elog"]} label="ログレベルは？" />
    {kind === "エラー画面" && <Field path={[...path, "eetc"]} label="その他(ボタン配置など)" />}
  </>;
}

/* ===== 画面の要素とイベント ===== */
export function ItemList({ node }: { node: QNode }) {
  const isEv = node.type === "events";
  const arr: Values[] = useVAt([node.id]) || [];
  const ids = arr.map((s, i) => s._k || "i" + i);
  return <>
    <SortableList ids={ids} onMove={moveAt([node.id])}>
      {(_id, i, handle) => isEv
        ? <EventItem path={[node.id]} index={i} handle={handle} />
        : <ElementItem path={[node.id]} index={i} handle={handle} />}
    </SortableList>
    <button type="button" className="etc-btn" onClick={() => {
      const _k = newId();
      focusLater("f_" + [node.id, arr.length, "name"].join("_"));
      editDoc(v => { arrayAt(v, [node.id]).push(isEv ? { _k, name: "", trig: "", steps: [] } : { _k, name: "", kind: "", bad: {} }); });
    }}>{isEv ? "＋ イベントを追加" : "＋ 要素を追加"}</button>
  </>;
}

function ItemHead({ k, what, index, title, closed, handle, onDelete }: {
  k: string; what: string; index: number; title: string; closed: boolean; handle: ReactNode; onDelete: () => void;
}) {
  return (
    <div className="step-head">
      <Toggle k={"k:" + k} label={what + " " + (index + 1)} />
      {handle}
      <span className="badge">{what} {index + 1}{closed && title ? ": " + title : ""}</span>
      <span className="spacer" />
      <Del label={what + " " + (index + 1) + " を削除"} onClick={onDelete} />
    </div>
  );
}

/* 画面の要素1件。種類、スタイリング、型、不正時、表示条件を持つ */
function ElementItem({ path, index, handle }: { path: Path; index: number; handle: ReactNode }) {
  const me = [...path, index];
  const it: Values | undefined = useVAt(me);
  const closed = useCollapsed("k:" + (it && it._k));
  if (!it) return null;
  const bad: Values = it.bad && typeof it.bad === "object" ? it.bad : {};
  return (
    <div className="step">
      <ItemHead k={it._k} what="要素" index={index} title={(it.name || "").trim()} closed={closed} handle={handle}
        onDelete={() => removeAt(path, index, "要素")} />
      {!closed && (
        <Kids>
          <Field path={[...me, "name"]} label="要素の名前は？" />
          <div className="node"><div className="q">種類は？</div><Chips path={[...me, "kind"]} label="要素の種類" options={EL_KINDS} /></div>
          <Field path={[...me, "style"]} label="スタイリングは？" />
          {it.kind === "入力" && <>
            <Field path={[...me, "type"]} label="型、桁、必須か任意かは？" />
            <div className="node">
              <div className="q">入力が不正な場合は？</div>
              <Chips path={[...me, "bad", "ek"]} label="入力が不正な場合" options={ERR_KINDS} />
              {bad.ek && <Kids><ErrFields path={[...me, "bad"]} kind={bad.ek} /></Kids>}
            </div>
          </>}
          <Field path={[...me, "cond"]} label="表示する条件、操作できる条件は？" />
        </Kids>
      )}
    </div>
  );
}

/* 画面のイベント1件。名前、きっかけ、処理の工程を持つ */
function EventItem({ path, index, handle }: { path: Path; index: number; handle: ReactNode }) {
  const me = [...path, index];
  const ev: Values | undefined = useVAt(me);
  const closed = useCollapsed("k:" + (ev && ev._k));
  if (!ev) return null;
  const steps = Array.isArray(ev.steps) ? ev.steps.length : 0;
  return (
    <div className="step">
      <ItemHead k={ev._k} what="イベント" index={index} title={(ev.name || "").trim()} closed={closed} handle={handle}
        onDelete={() => removeAt(path, index, steps ? "イベントと、その下の工程" : "イベント")} />
      {!closed && (
        <Kids>
          <Field path={[...me, "name"]} label="イベントの名前は？" />
          <Field path={[...me, "trig"]} label="きっかけは？(クリック、入力、表示など)" />
          <div className="node"><div className="q">処理の順序は？</div><StepList path={[...me, "steps"]} /></div>
        </Kids>
      )}
    </div>
  );
}
