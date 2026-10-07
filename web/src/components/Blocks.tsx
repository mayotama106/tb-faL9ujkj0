/* 実装チケットの部品の入力。部品は欄(FieldDef)の並びで定義され、欄の種類ごとに入力欄を出す */
import { createContext, useContext, type ReactNode } from "react";
import {
  DISPLAYS, GROUPS, NA, NONE, NO_DISPLAY, newBlock,
  type CaseVal, type CompDef, type FieldDef
} from "../domain/components";
import type { Values } from "../domain/ticket";
import { defsOf, editDoc, getAt, newId, setAt, setValue, toast, useStore } from "../state/store";
import { AutoText, Chips, Field, Kids, Toggle, focusLater, useCollapsed, useVAt } from "./Fields";
import { SortableList, move } from "./Sortable";

type Path = (string | number)[];
export const fid = (path: Path) => "f_" + path.join("_");
const useDefs = () => useStore(s => defsOf(s.data));
const t = (s: unknown) => (typeof s === "string" ? s : "").trim();

function arrayAt(v: Values, path: Path): Values[] {
  let a = getAt(v, path);
  if (!Array.isArray(a)) { setAt(v, path, []); a = getAt(v, path); }
  return a;
}
function Del({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="del" aria-label={label} title="削除" onClick={onClick}>×</button>;
}

/* 部品の追加ボタン。入れ物はチケットの直下にだけ置ける */
function Palette({ top, onAdd }: { top: boolean; onAdd: (def: CompDef) => void }) {
  const defs = useDefs();
  return (
    <div className="palette">
      {GROUPS.filter(g => top || g !== "入れ物").map(g => (
        <div key={g} className="pal-row">
          <span className="pal-g">{g}</span>
          {Object.values(defs).filter(d => d.group === g).map(d => (
            <button key={d.type} type="button" className={"etc-btn pal-" + groupClass(d.group)} onClick={() => onAdd(d)}>＋ {d.name}</button>
          ))}
        </div>
      ))}
    </div>
  );
}
const groupClass = (g: string) => (g === "入れ物" ? "box" : g === "データ操作" ? "data" : "proc");

/* 部品の並び。top はチケットの直下 */
export function BlockList({ path, top }: { path: Path; top?: boolean }) {
  const defs = useDefs();
  const arr: Values[] = useVAt(path) || [];
  const ids = arr.map((b, i) => b._k || "i" + i);
  const add = (def: CompDef) => {
    const b = newBlock(def, newId);
    const hf = def.fields.find(f => f.head) || def.fields[0];
    if (hf) focusLater(fid([...path, arr.length, hf.id]));
    editDoc(v => { arrayAt(v, path).push(b); });
  };
  return (
    <div className="blocks">
      <SortableList ids={ids} onMove={(f, to) => editDoc(v => move(arrayAt(v, path), f, to))}>
        {(_id, i, handle) => <BlockView path={path} index={i} handle={handle} numbered={!!top || !defs[arr[i]?.type]?.container} />}
      </SortableList>
      <Palette top={!!top} onAdd={add} />
    </div>
  );
}

/* 条件分岐の中では、エラーハンドリングの「どんな場合？」は場合の条件で足りる */
const InBranch = createContext(false);

function BlockView({ path, index, handle, numbered }: { path: Path; index: number; handle: ReactNode; numbered: boolean }) {
  const defs = useDefs();
  const me = [...path, index];
  const b: Values | undefined = useVAt(me);
  const closed = useCollapsed("k:" + (b && b._k));
  if (!b) return null;
  const def = defs[b.type];
  if (!def) return <div className="step">不明な部品: {String(b.type)}</div>;
  const hf = def.fields.find(f => f.head);
  const summary = closed && hf && t(b[hf.id]) ? ": " + t(b[hf.id]).split("\n")[0] : "";
  return (
    <div className={"step comp comp-" + groupClass(def.group)}>
      <div className="step-head">
        <Toggle k={"k:" + b._k} label={def.name + " " + (index + 1)} />
        {handle}
        <span className={"badge b-" + groupClass(def.group)}>{numbered ? index + 1 + ". " : ""}{def.name}{summary}</span>
        <span className="spacer" />
        <Del label={def.name + " " + (index + 1) + " を削除"} onClick={() => {
          editDoc(v => { arrayAt(v, path).splice(index, 1); });
          toast(def.name + "を削除した", true);
        }} />
      </div>
      {!closed && <Kids>
        {def.hint && <p className="hint">{def.hint}</p>}
        <FieldsView fields={def.fields} path={me} obj={b} />
      </Kids>}
    </div>
  );
}

function FieldsView({ fields, path, obj }: { fields: FieldDef[]; path: Path; obj: Values }) {
  const inBranch = useContext(InBranch);
  return <>{fields.map(f => {
    if (f.when && obj[f.when.id] !== f.when.eq) return null;
    if (inBranch && obj.type === "error" && f.id === "when") return null;
    return <FieldView key={f.id} f={f} path={path} />;
  })}</>;
}

function Q({ f, children }: { f: FieldDef; children?: ReactNode }) {
  return <div className="head"><div className="q">{f.q}</div>{f.optional && !/任意/.test(f.q) && <span className="opt">任意</span>}{children}</div>;
}

function FieldView({ f, path }: { f: FieldDef; path: Path }) {
  const p = [...path, f.id];
  switch (f.kind) {
    case "text": return <Field path={p} label={f.q} ph={f.ph} />;
    case "list": return <div className="node"><Q f={f} /><PathList path={p} label={f.label} ph={f.ph} /></div>;
    case "choice": case "multi":
      return <div className="node"><Q f={f} /><Chips path={p} label={f.label} options={f.options || []} multi={f.kind === "multi"} /></div>;
    case "group": return <GroupView f={f} path={path} />;
    case "error": return <div className="node"><Q f={f} /><ErrorEditor path={p} /></div>;
    case "case": return <CaseView f={f} path={p} />;
    case "blocks": return <div className="node"><Q f={f} /><BlockList path={p} /></div>;
    case "rows": return <RowsView f={f} path={path} />;
    case "branches": return <BranchesView f={f} path={p} />;
  }
  return null;
}

/* 原典を参照して省略する。参照するなら、原典のリンクだけを書く */
function RefToggle({ f, path }: { f: FieldDef; path: Path }) {
  const on = !!useVAt([...path, f.id + "_ref"]);
  return <>
    <div className="chips"><button type="button" className="chip" aria-pressed={on}
      onClick={() => setValue([...path, f.id + "_ref"], !on, false)}>原典を参照して省略する</button></div>
    {on && <Field path={[...path, f.id + "_link"]} label="原典のリンクは？" />}
  </>;
}

function GroupView({ f, path }: { f: FieldDef; path: Path }) {
  const ref = !!useVAt([...path, f.id + "_ref"]);
  const closed = useCollapsed("g:" + fid([...path, f.id]));
  return (
    <div className="node group">
      <div className="head"><Toggle k={"g:" + fid([...path, f.id])} label={f.label} /><div className="q">{f.q}</div></div>
      {f.ref && <RefToggle f={f} path={path} />}
      {!ref && !closed && <Kids>{(f.fields || []).map(c => <FieldView key={c.id} f={c} path={path} />)}</Kids>}
    </div>
  );
}

/* 〇〇の場合の扱い。エラーハンドリングにするか、文で書く */
function CaseView({ f, path }: { f: FieldDef; path: Path }) {
  const cv: CaseVal = useVAt(path) || {};
  const set = (mode: string) => setValue([...path, "mode"], cv.mode === mode ? "" : mode, false);
  return (
    <div className="node">
      <Q f={f} />
      <div className="chips" role="group" aria-label={f.label}>
        <button type="button" className="chip" aria-pressed={cv.mode === "error"} onClick={() => set("error")}>エラーハンドリング</button>
        <button type="button" className="chip" aria-pressed={cv.mode === "text"} onClick={() => set("text")}>処理を書く</button>
      </div>
      {cv.mode === "error" && <Kids><ErrorEditor path={[...path, "err"]} /></Kids>}
      {cv.mode === "text" && <Kids><Field path={[...path, "text"]} label="どうする？" ph="例: 空の一覧を返す" /></Kids>}
    </div>
  );
}

/* エラーハンドリング。表示タイプ、HTTPステータス、エラーコード、エラーメッセージ。該当しない欄は「なし」 */
export function ErrorEditor({ path }: { path: Path }) {
  const e: Values = useVAt(path) || {};
  const display = e.display || "";
  return (
    <div className="err-ed">
      <div className="err-row">
        <span className="lbl">表示タイプ</span>
        <Chips path={[...path, "display"]} label="表示タイプ" options={DISPLAYS} />
      </div>
      <div className="err-row">
        <span className="lbl">HTTPステータス</span><CodeInput path={[...path, "status"]} kind="status" />
        <span className="lbl">エラーコード</span><CodeInput path={[...path, "code"]} kind="code" />
      </div>
      {display !== NO_DISPLAY && (
        <div className="err-row">
          <span className="lbl">エラーメッセージ</span><CodeInput path={[...path, "message"]} kind="message" wide />
        </div>
      )}
      {(t(e.note) || display === "その他") && <Field path={[...path, "note"]} label={display === "その他" ? "どう扱う？(補足)" : "補足"} />}
    </div>
  );
}

/* 短い入力欄。同じチケットで使った値を候補に出す。「なし」で該当しないことを示す */
function CodeInput({ path, kind, wide }: { path: Path; kind: "status" | "code" | "message"; wide?: boolean }) {
  const val = useVAt(path);
  const s = typeof val === "string" ? val : "";
  const label = kind === "status" ? "HTTPステータス" : kind === "code" ? "エラーコード" : "エラーメッセージ";
  return (
    <span className={"code-wrap" + (wide ? " wide" : "")}>
      <input type="text" id={fid(path)} list={"dl-" + kind} value={s === NA ? "" : s} disabled={s === NA}
        className={s.trim() ? "code" : "code empty"} placeholder={s === NA ? "なし" : "未記入"} aria-label={label}
        onChange={e => setValue(path, e.target.value)} />
      <button type="button" className="chip mini" aria-pressed={s === NA} title="該当しない"
        onClick={() => setValue(path, s === NA ? "" : NA, false)}>なし</button>
    </span>
  );
}

/* 1項目1入力欄の一覧(パスで結び付ける)。Ctrl+Enter で項目を足す */
function PathList({ path, label, ph }: { path: Path; label: string; ph?: string }) {
  const raw = useVAt(path);
  let items: string[] = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? raw.split("\n") : [];
  if (!items.length) items = [""];
  const edit = (fn: (a: string[]) => void, coalesce?: string) => editDoc(v => {
    let a = getAt(v, path);
    if (!Array.isArray(a) || !a.length) { setAt(v, path, items.slice()); a = getAt(v, path); }
    fn(a);
  }, { coalesce: coalesce ? "pl:" + path.join(".") + ":" + coalesce : undefined });
  const add = () => { focusLater(fid([...path, items.length])); edit(a => { a.push(""); }); };
  return (
    <div className="rows" role="group" aria-label={label}>
      <SortableList ids={items.map((_, i) => fid(path) + "#" + i)} onMove={(f, to) => edit(a => move(a, f, to))}>
        {(id, i, handle) => (
          <div className="row" key={id}>
            {items.length > 1 && handle}
            <AutoText id={fid([...path, i])} value={items[i]} placeholder={ph} label={label + " " + (i + 1)}
              onChange={s => edit(a => { a[i] = s; }, String(i))}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
            <Del label={label + " " + (i + 1) + " を削除"} onClick={() => edit(a => { a.splice(i, 1); })} />
          </div>
        )}
      </SortableList>
      <button type="button" className="etc-btn" onClick={add} title="Ctrl+Enter でも足せる">＋ 項目を追加</button>
    </div>
  );
}

/* 行の一覧(画面の要素、イベント、カラム、チェックなど)。行ごとに欄を持つ */
function RowsView({ f, path }: { f: FieldDef; path: Path }) {
  const p = [...path, f.id];
  const ref = !!useVAt([...path, f.id + "_ref"]);
  const rows: Values[] = useVAt(p) || [];
  const hf = (f.fields || []).find(c => c.head);
  const name = f.label.replace(/\{行\}/g, "");
  return (
    <div className="node">
      <Q f={f} />
      {f.ref && <RefToggle f={f} path={path} />}
      {!ref && <>
        <SortableList ids={rows.map((r, i) => r._k || "i" + i)} onMove={(fr, to) => editDoc(v => move(arrayAt(v, p), fr, to))}>
          {(_id, i, handle) => (
            <div className="row-card">
              <div className="step-head">
                {handle}
                <span className="badge b-row">{name} {i + 1}{hf && t(rows[i]?.[hf.id]) ? ": " + t(rows[i][hf.id]).split("\n")[0] : ""}</span>
                <span className="spacer" />
                <Del label={name + " " + (i + 1) + " を削除"} onClick={() => {
                  editDoc(v => { arrayAt(v, p).splice(i, 1); });
                  toast(name + "を削除した", true);
                }} />
              </div>
              {rows[i] && <FieldsView fields={f.fields || []} path={[...p, i]} obj={rows[i]} />}
            </div>
          )}
        </SortableList>
        <button type="button" className="etc-btn" onClick={() => {
          if (hf) focusLater(fid([...p, rows.length, hf.id]));
          editDoc(v => { arrayAt(v, p).push({ _k: newId() }); });
        }}>＋ {name}を追加</button>
      </>}
    </div>
  );
}

/* 条件分岐の場合ごと。条件と、中の部品(または何もしない) */
function BranchesView({ f, path }: { f: FieldDef; path: Path }) {
  const cases: Values[] = useVAt(path) || [];
  return (
    <div className="node">
      <Q f={f} />
      {cases.map((c, i) => (
        <div className="branch-box" key={c._k || i}>
          <div className="row">
            <div className="grow"><Field path={[...path, i, "cond"]} label={"場合 " + (i + 1) + "の条件は？(「〇〇であれば」の〇〇)"}
              ph={i === 0 ? "例: 編集可能" : "例: 編集不可"} /></div>
            {cases.length > 1 && <Del label={"場合 " + (i + 1) + " を削除"} onClick={() => {
              editDoc(v => { arrayAt(v, path).splice(i, 1); });
              toast("場合を削除した", true);
            }} />}
          </div>
          <div className="chips"><button type="button" className="chip" aria-pressed={!!c.none}
            onClick={() => setValue([...path, i, "none"], !c.none, false)}>{NONE}</button></div>
          {!c.none && <InBranch.Provider value={true}><BlockList path={[...path, i, "blocks"]} /></InBranch.Provider>}
        </div>
      ))}
      <button type="button" className="etc-btn" onClick={() => editDoc(v => { arrayAt(v, path).push({ _k: newId(), cond: "", blocks: [] }); })}>＋ 場合を追加</button>
    </div>
  );
}

/* 同じチケットで使ったHTTPステータス・エラーコード・エラーメッセージを、入力候補にする */
const STATUSES = ["200", "201", "204", "400", "401", "403", "404", "409", "422", "500", "503"];
export function CodeLists() {
  const blocks = useVAt(["blocks"]);
  const sets: Record<string, Set<string>> = { status: new Set(STATUSES), code: new Set(), message: new Set() };
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      const o = x as Values;
      (["status", "code", "message"] as const).forEach(k => { if (t(o[k]) && o[k] !== NA) sets[k].add(t(o[k])); });
      Object.values(o).forEach(walk);
    }
  };
  walk(blocks);
  return <>{Object.keys(sets).map(k => (
    <datalist key={k} id={"dl-" + k}>{[...sets[k]].sort().map(c => <option key={c} value={c} />)}</datalist>
  ))}</>;
}
