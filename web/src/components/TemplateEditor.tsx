/* テンプレートの編集。観点表の問い(文言、本文での表記、並び、追加、削除)と、本文の見出し・定型文を編集する。
   同じIDの問いが複数の場所にある(原典参照時に残す問いなど)ので、文言の変更と削除はIDで揃える */
import { current, isDraft, type Draft } from "immer";
import { useId, useState } from "react";
import { GENRES, type Genre, type Heads, type QNode } from "../domain/genres";
import { headsOf } from "../domain/ticket";
import { COMPONENTS, GROUPS, type CompDef, type FieldDef } from "../domain/components";
import { defsOf, genreOf, getAt, newId, setUI, toast, update, useStore } from "../state/store";
import { AutoText, Kids } from "./Fields";
import { SortableList, move } from "./Sortable";

type Path = (string | number)[];
const TYPE_NAMES: Record<string, string> = {
  text: "自由記述", list: "項目の一覧", choice: "選択式", multi: "複数選択", group: "見出し",
  error: "エラーハンドリング", logic: "工程", elements: "画面の要素", events: "イベント",
  case: "場合の扱い", blocks: "中の部品", rows: "行の一覧", branches: "場合ごとの処理"
};

/* 編集中のジャンルの定義を変える。初期状態と同じになったら、編集済みの扱いをやめる */
function editTpl(genre: string, fn: (g: Draft<Genre>) => void, coalesce?: string) {
  update(d => {
    if (!d.templates[genre]) d.templates[genre] = JSON.parse(JSON.stringify(GENRES[genre]));
    fn(d.templates[genre]);
    const t = d.templates[genre];   /* 作ったばかりの定義は下書き(draft)ではない */
    if (JSON.stringify(isDraft(t) ? current(t) : t) === JSON.stringify(GENRES[genre])) delete d.templates[genre];
  }, { coalesce: coalesce ? "tpl:" + genre + ":" + coalesce : undefined });
}

function nodeArrays(g: Draft<Genre>): Draft<QNode>[][] {
  const out: Draft<QNode>[][] = [];
  const walk = (arr?: Draft<QNode>[]) => {
    if (!Array.isArray(arr)) return;
    out.push(arr);
    arr.forEach(n => {
      walk(n.children); walk(n.refChildren);
      if (n.branches) Object.keys(n.branches).forEach(k => walk(n.branches![k]));
    });
  };
  if (g.sections) g.sections.forEach(sec => walk(sec.nodes));
  else { walk(g.func); walk(g.nonfunc); walk(g.modOnly); }
  return out;
}
const sameId = (g: Draft<Genre>, id: string, fn: (n: Draft<QNode>) => void) =>
  nodeArrays(g).forEach(arr => arr.forEach(n => { if (n.id === id) fn(n); }));

function EdField({ label, value, onChange, ph }: { label: string; value: string; onChange: (s: string) => void; ph?: string }) {
  const id = useId();
  return (
    <div className="node">
      <label htmlFor={id}>{label}</label>
      <AutoText id={id} value={value || ""} placeholder={ph} onChange={onChange} />
    </div>
  );
}

export function TemplateEditor() {
  const sel = useStore(s => s.ui.editGenre);
  const defs = useStore(s => defsOf(s.data));
  const tabs = (
    <div className="tpl-tabs">
      <div className="genres" role="group" aria-label="編集するジャンル">
        {Object.keys(GENRES).map(k => (
          <button key={k} type="button" className="genre" aria-pressed={k === sel} onClick={() => setUI({ editGenre: k })}>{GENRES[k].name}</button>
        ))}
      </div>
      {GROUPS.map(gr => (
        <div key={gr} className="pal-row" role="group" aria-label={"部品: " + gr}>
          <span className="pal-g">部品: {gr}</span>
          {Object.values(defs).filter(d => d.group === gr).map(d => (
            <button key={d.type} type="button" className="chip" aria-pressed={sel === "comp:" + d.type}
              onClick={() => setUI({ editGenre: "comp:" + d.type })}>{d.name}</button>
          ))}
        </div>
      ))}
    </div>
  );
  if (sel.startsWith("comp:")) return <div className="editor">{tabs}<CompEditor type={sel.slice(5)} /></div>;
  return <div className="editor">{tabs}<GenreEditor genre={sel} /></div>;
}

function GenreEditor({ genre }: { genre: string }) {
  const g = useStore(s => genreOf(s.data, genre));
  const edited = useStore(s => !!s.data.templates[genre]);
  const h = headsOf(g);
  const setHead = (key: keyof Heads) => (val: string) =>
    editTpl(genre, t => { t.heads = Object.assign({}, t.heads, { [key]: val }); }, "head:" + key);
  return (
    <>
      <section className="card">
        <h2>{g.name}のテンプレート{edited && <span className="tag">編集済み</span>}</h2>
        <p className="hint">ここでの変更は、このブラウザ内にだけ保存され、すぐに全チケットへ反映される。入力済みの内容は消えない。問いは ⋮⋮ を持って並べ替えられる。</p>
        <button type="button" className="plain" disabled={!edited} onClick={() => {
          update(d => { delete d.templates[genre]; });
          toast(g.name + "のテンプレートを初期状態に戻した", true);
        }}>このジャンルを初期状態に戻す</button>
      </section>
      <section className="card">
        <h2>本文の構成</h2>
        {g.impl ? <>
          {([["story", "ストーリー"], ["scope", "スコープ"], ["scopeIn", "スコープ内"], ["scopeOut", "スコープ外"], ["flowSuffix", "処理の見出しの末尾(〇〇処理)"], ["flowTitle", "処理の流れ"], ["ac", "受け入れ条件"],
            ["okCase", "受け入れ条件の正常時の書き方"], ["notes", "制約事項・技術的補足"], ["branch", "ブランチ"],
            ["call", "呼び出し条件"], ["nonfunc", "非機能要件"], ["impact", "既存影響"]] as const)
            .map(([k, l]) => <EdField key={k} label={"見出し: " + l} value={h[k]} onChange={setHead(k)} />)}
          <p className="hint">実装チケットの問いは、部品ごとに編集する(上の「部品」から選ぶ)。</p>
        </> : g.sections ? <>
          <EdField label="見出し: 概要" value={g.storyLabel || ""} onChange={val => editTpl(genre, t => { t.storyLabel = val; }, "storyLabel")} />
          {g.sections.map((sec, i) => <div key={sec.key}>
            <EdField label={"見出し: " + ((GENRES[genre].sections || []).find(x => x.key === sec.key)?.title || sec.key)} value={sec.title}
              onChange={val => editTpl(genre, t => { t.sections![i].title = val; }, "sec:" + i)} />
            {sec.lead != null && <EdField label={"「" + sec.title + "」の1行目(定型文)"} value={sec.lead}
              onChange={val => editTpl(genre, t => { t.sections![i].lead = val; }, "lead:" + i)} />}
          </div>)}
        </> : <>
          {([["story", "ストーリー"], ["ac", "受け入れ条件"], ["func", "機能要件"], ["nonfunc", "非機能要件"], ["other", "その他"]] as const)
            .map(([k, l]) => <EdField key={k} label={"見出し: " + l} value={h[k]} onChange={setHead(k)} />)}
          <EdField label="受け入れ条件の1行目(新規作成)" value={h.leadNew} onChange={setHead("leadNew")} />
          <EdField label="受け入れ条件の1行目(既存改修)" value={h.leadMod} onChange={setHead("leadMod")} />
          <p className="hint">{"{名前}"} は、名前欄の値と「{g.noun}」に置き換わる。</p>
        </>}
        {(g.impl ? [["deps", "依存関係"]] as const : [["deps", "依存関係・環境"], ["refs", "参考情報"]] as const)
          .map(([k, l]) => <EdField key={k} label={"見出し: " + l} value={h[k]} onChange={setHead(k)} />)}
      </section>
      {g.impl ? null : g.sections ? g.sections.map((sec, i) => (
        <section className="card" key={sec.key}><h2>問い: {sec.title}</h2><EdList genre={genre} path={["sections", i, "nodes"]} /></section>
      )) : <>
        <section className="card"><h2>問い: {h.func}</h2><EdList genre={genre} path={["func"]} /></section>
        <section className="card"><h2>問い: {h.nonfunc}</h2><EdList genre={genre} path={["nonfunc"]} /></section>
        <section className="card"><h2>問い: {h.other}(既存改修のときだけ)</h2><EdList genre={genre} path={["modOnly"]} /></section>
      </>}
    </>
  );
}

function EdList({ genre, path, label }: { genre: string; path: Path; label?: string }) {
  const arr: QNode[] = useStore(s => getAt(genreOf(s.data, genre), path)) || [];
  const ids = arr.map(n => n.id);
  return (
    <div className="ed-list">
      {label && <div className="branch">{label}</div>}
      <SortableList ids={ids} onMove={(f, t) => editTpl(genre, d => move(getAt(d, path), f, t))}>
        {(_id, i, handle) => <EdNode genre={genre} path={path} index={i} handle={handle} />}
      </SortableList>
      <div className="links">
        {([["text", "＋ 自由記述の問い"], ["list", "＋ 項目の一覧の問い"], ["choice", "＋ 選択式の問い"]] as const).map(([type, text]) => (
          <button key={type} type="button" className="etc-btn" onClick={() => {
            const n: QNode = { id: "u_" + newId(), q: "新しい問い", label: "新しい項目", type };
            if (type === "choice") n.options = ["はい", "いいえ"];
            editTpl(genre, d => {
              let a = getAt(d, path);
              if (!Array.isArray(a)) { a = []; const parent = getAt(d, path.slice(0, -1)); parent[path[path.length - 1]] = a; }
              a.push(n);
            });
          }}>{text}</button>
        ))}
      </div>
    </div>
  );
}

function EdNode({ genre, path, index, handle }: { genre: string; path: Path; index: number; handle: React.ReactNode }) {
  const n: QNode | undefined = useStore(s => getAt(genreOf(s.data, genre), [...path, index]));
  if (!n) return null;
  const sync = (fn: (x: Draft<QNode>) => void, key: string) => editTpl(genre, d => sameId(d, n.id, fn), n.id + ":" + key);
  return (
    <div className="step ed-node">
      <div className="step-head">
        {handle}
        <span className="badge">{TYPE_NAMES[n.type] || n.type}</span>
        <span className="spacer" />
        <button type="button" className="del" aria-label="この問いを削除" title="削除" onClick={() => {
          editTpl(genre, d => nodeArrays(d).forEach(arr => {
            for (let i = arr.length - 1; i >= 0; i--) if (arr[i].id === n.id) arr.splice(i, 1);
          }));
          toast("問い「" + n.q + "」を削除した", true);
        }}>×</button>
      </div>
      <EdField label="問い" value={n.q} onChange={val => sync(x => { x.q = val; }, "q")} />
      <EdField label="本文での表記" value={n.label} onChange={val => sync(x => { x.label = val; }, "label")} />
      {/* 選択肢は、選択肢ごとの続きの問いを持たない場合だけ編集できる */}
      {(n.type === "choice" || n.type === "multi") && !n.branches &&
        <OptionsField options={n.options || []}
          onChange={opts => sync(x => { x.options = opts; }, "options")} />}
      {!n.always && (
        <label className="ed-check">
          <input type="checkbox" checked={!!n.optional}
            onChange={e => { const on = e.target.checked; sync(x => { if (on) x.optional = true; else delete x.optional; }, "optional"); }} />
          任意(空なら本文に出さない)
        </label>
      )}
      {(n.children || n.branches) && (
        <Kids>
          {n.children && <EdList genre={genre} path={[...path, index, "children"]} label="下の問い" />}
          {n.branches && Object.keys(n.branches).map(k =>
            <EdList key={k} genre={genre} path={[...path, index, "branches", k]} label={"「" + k + "」の場合"} />)}
        </Kids>
      )}
    </div>
  );
}

/* 選択肢の編集欄。入力中の空行は残し、保存するときだけ空行を除く */
function OptionsField({ options, onChange }: { options: string[]; onChange: (opts: string[]) => void }) {
  const [raw, setRaw] = useState(options.join("\n"));
  const clean = (s: string) => s.split("\n").map(x => x.trim()).filter(Boolean);
  /* 取り消しなどで外から変わった場合は、表示を合わせる */
  const shown = clean(raw).join("\n") === options.join("\n") ? raw : options.join("\n");
  return <EdField label="選択肢(1行に1つ)" value={shown} onChange={s => { setRaw(s); onChange(clean(s)); }} />;
}

/* ===== 部品の編集 =====
   欄の問い・本文での表記・入力例・任意の指定・選択肢を変え、並べ替え、削除し、欄を足す。
   部品の見出しの欄は消せない。編集した部品は data.comps に持ち、初期の定義と同じになったら消す */
function editComp(type: string, fn: (d: Draft<CompDef>) => void, coalesce?: string) {
  update(d => {
    if (!d.comps[type]) d.comps[type] = JSON.parse(JSON.stringify(COMPONENTS[type]));
    fn(d.comps[type]);
    const c = d.comps[type];
    if (JSON.stringify(isDraft(c) ? current(c) : c) === JSON.stringify(COMPONENTS[type])) delete d.comps[type];
  }, { coalesce: coalesce ? "comp:" + type + ":" + coalesce : undefined });
}

function CompEditor({ type }: { type: string }) {
  const def = useStore(s => defsOf(s.data)[type]);
  const edited = useStore(s => !!s.data.comps[type]);
  if (!def) return null;
  return <>
    <section className="card">
      <h2>部品: {def.name}{edited && <span className="tag">編集済み</span>}</h2>
      <p className="hint">ここでの変更は、このブラウザ内にだけ保存され、すぐに全チケットへ反映される。入力済みの内容は消えない(消した欄の値は本文に出なくなる)。欄は ⋮⋮ を持って並べ替えられる。</p>
      <EdField label="部品の名前(追加ボタンの表記)" value={def.name} onChange={val => editComp(type, d => { d.name = val; }, "name")} />
      {def.container && <EdField label="本文の節の見出しの末尾(〇〇API など)" value={def.suffix || ""}
        onChange={val => editComp(type, d => { d.suffix = val; }, "suffix")} />}
      <EdField label="入力画面に出す説明(任意)" value={def.hint || ""} onChange={val => editComp(type, d => { d.hint = val || undefined; }, "hint")} />
      <button type="button" className="plain" disabled={!edited} onClick={() => {
        update(d => { delete d.comps[type]; });
        toast("部品「" + COMPONENTS[type].name + "」を初期状態に戻した", true);
      }}>この部品を初期状態に戻す</button>
    </section>
    <section className="card">
      <h2>欄(観点)</h2>
      <FieldDefList type={type} path={["fields"]} />
    </section>
  </>;
}

function FieldDefList({ type, path }: { type: string; path: Path }) {
  const fields: FieldDef[] = useStore(s => getAt(defsOf(s.data)[type], path)) || [];
  return (
    <div className="ed-list">
      <SortableList ids={fields.map(f => f.id)} onMove={(fr, to) => editComp(type, d => move(getAt(d, path), fr, to))}>
        {(_id, i, handle) => <FieldDefView type={type} path={path} index={i} handle={handle} />}
      </SortableList>
      <div className="links">
        {([["text", "＋ 自由記述の欄"], ["list", "＋ 項目の一覧の欄"], ["choice", "＋ 選択式の欄"]] as const).map(([kind, text]) => (
          <button key={kind} type="button" className="etc-btn" onClick={() => {
            const f: FieldDef = { id: "u_" + newId(), q: "新しい問いは？", label: "新しい項目", kind, custom: true };
            if (kind === "choice") f.options = ["はい", "いいえ"];
            editComp(type, d => { getAt(d, path).push(f); });
          }}>{text}</button>
        ))}
      </div>
    </div>
  );
}

function FieldDefView({ type, path, index, handle }: { type: string; path: Path; index: number; handle: React.ReactNode }) {
  const me = [...path, index];
  const f: FieldDef | undefined = useStore(s => getAt(defsOf(s.data)[type], me));
  if (!f) return null;
  const set = (fn: (x: Draft<FieldDef>) => void, key: string) => editComp(type, d => fn(getAt(d, me)), f.id + ":" + key);
  return (
    <div className="step ed-node">
      <div className="step-head">
        {handle}
        <span className="badge">{TYPE_NAMES[f.kind] || f.kind}{f.head ? "・見出し" : ""}{f.ac ? "・受け入れ条件" : ""}</span>
        <span className="spacer" />
        {!f.head && <button type="button" className="del" aria-label="この欄を削除" title="削除" onClick={() => {
          editComp(type, d => { getAt(d, path).splice(index, 1); });
          toast("欄「" + f.q + "」を削除した", true);
        }}>×</button>}
      </div>
      <EdField label="問い" value={f.q} onChange={val => set(x => { x.q = val; }, "q")} />
      <EdField label={f.label.includes("{行}") ? "本文での表記({行} は行の名前に置き換わる)" : "本文での表記"} value={f.label}
        onChange={val => set(x => { x.label = val; }, "label")} />
      {(f.kind === "text" || f.kind === "list") &&
        <EdField label="入力例(任意)" value={f.ph || ""} onChange={val => set(x => { x.ph = val || undefined; }, "ph")} />}
      {(f.kind === "choice" || f.kind === "multi") &&
        <OptionsField options={f.options || []} onChange={opts => set(x => { x.options = opts; }, "options")} />}
      {!f.head && (
        <label className="ed-check">
          <input type="checkbox" checked={!!f.optional}
            onChange={e => { const on = e.target.checked; set(x => { if (on) x.optional = true; else delete x.optional; }, "optional"); }} />
          任意(空なら本文に出さない)
        </label>
      )}
      {(f.kind === "group" || f.kind === "rows") && <Kids><div className="branch">{f.kind === "rows" ? "行の欄" : "中の欄"}</div>
        <FieldDefList type={type} path={[...me, "fields"]} /></Kids>}
    </div>
  );
}
