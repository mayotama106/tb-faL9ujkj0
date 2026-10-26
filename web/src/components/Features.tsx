/* チケットの切り分けの画面。洗い出し → 切り分けと実施状況 の2パートで、
   必要なチケットを漏れなくダブりなく決め、実施状況を追い、Excelに書き出す */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ENTRY_KINDS, EXCEL_HEADER, FRONT, ITEM_KINDS, LAYERS, STATUSES, layerName, layersOf, buildFeature, contentOf, defaultTitle, docValues,
  cellsOf, entryLabel, excelRows, issuesOf, newEntry, newEvent, newItem, newStCell, statusCount, stTitle, stValues, ticketsOf,
  type EntryKind, type FCell, type FEntry, type FEvent, type FItem, type Feature, type FTicket, type Layer, type Status
} from "../domain/feature";
import { MISSING } from "../domain/genres";
import { buildTicket } from "../domain/ticket";
import { buildXlsx, downloadXlsx } from "../domain/xlsx";
import { initialValues } from "../state/actions";
import { ensureKeys } from "../state/persist";
import { defsOf, genreOf, getAt, getState, newId, setAt, setUI, toast, update, useStore, type Doc } from "../state/store";
import { stamp } from "../utils";
import { AutoText, Kids, focusLater } from "./Fields";
import { SortableList, move } from "./Sortable";
import { ImportButton, exportPack } from "./Share";
import { CopyButton } from "./Wizard";

type Path = (string | number)[];
const fid = (path: Path) => "ff_" + path.join("_");
const PARTS = [{ key: "parts", title: "洗い出し" }, { key: "split", title: "切り分けと実施状況" }];
const WIDTHS = [6, 22, 14, 18, 20, 16, 40, 48, 12];   /* Excelの列の幅 */

/* ===== 操作 ===== */
export const useFeature = () => useStore(s => s.data.features.find(f => f.id === s.ui.featureId) || null);
function editFeature(fn: (f: Feature) => void, coalesce?: string) {
  const id = getState().ui.featureId;
  if (!id) return;
  update(d => {
    const f = d.features.find(x => x.id === id) as Feature | undefined;
    if (!f) return;
    fn(f); f.updatedAt = Date.now();
  }, { coalesce: coalesce ? "feat:" + id + ":" + coalesce : undefined });
}
const setF = (path: Path, value: unknown, coalesce = true) => editFeature(f => setAt(f, path, value), coalesce ? path.join(".") : undefined);
function arrayAt(f: Feature, path: Path): unknown[] {
  let a = getAt(f, path);
  if (!Array.isArray(a)) { setAt(f, path, []); a = getAt(f, path); }
  return a;
}
function removeAt(path: Path, i: number, what: string) {
  editFeature(f => { arrayAt(f, path).splice(i, 1); });
  toast(what + "を削除しました", true);
}
export function createFeature() {
  const now = Date.now();
  const f: Feature = { id: newId(), name: "", goal: "", entries: [], st: newStCell(), createdAt: now, updatedAt: now };
  update(d => { d.features.unshift(f); });
  setUI({ featureId: f.id, view: "features", sidebar: false });
  focusLater(fid(["name"]));
}
function goFPart(id: string, key: string) {
  setUI(ui => ({ featurePart: { ...ui.featurePart, [id]: key } }));
  window.scrollTo(0, 0);
}
/* チケットから、チケットビルダーの実装チケットを作る */
function createDoc(tk: FTicket) {
  const s = getState();
  const f = s.data.features.find(x => x.id === s.ui.featureId);
  if (!f) return;
  const v = docValues(f, tk, newId);
  ensureKeys(v);
  const now = Date.now();
  const doc: Doc = { id: newId(), genre: "impl", v, createdAt: now, updatedAt: now };
  update(d => {
    d.docs.unshift(doc);
    const ff = d.features.find(x => x.id === f.id);
    if (ff) setAt(ff, [...tk.path, "docId"], doc.id);
  });
  toast("チケット本文を作成しました");
}
/* フィーチャー全体のSTチケットを作る(よく使う手順と、画面・処理の一覧を入れておく) */
function createStDoc(f: Feature) {
  const v = { ...initialValues("st"), ...stValues(f) };
  ensureKeys(v);
  const now = Date.now();
  const doc: Doc = { id: newId(), genre: "st", v, createdAt: now, updatedAt: now };
  update(d => {
    d.docs.unshift(doc);
    const ff = d.features.find(x => x.id === f.id);
    if (ff) ff.st = { ...(ff.st || newStCell()), docId: doc.id };
  });
  toast("チケット本文を作成しました");
}
function openDoc(id: string) {
  setUI({ view: "tickets", currentId: id, editing: false });
  window.scrollTo(0, 0);
}
function exportExcel(features: Feature[], name: string) {
  downloadXlsx(buildXlsx(excelRows(features), "チケット", WIDTHS), name);
}

/* ===== 入力の部品 ===== */
function FText({ path, label, ph }: { path: Path; label?: string; ph?: string }) {
  const f = useFeature();
  const val = f ? getAt(f, path) : "";
  const id = fid(path);
  return (
    <div className="node">
      {label && <label htmlFor={id}>{label}</label>}
      <AutoText id={id} value={typeof val === "string" ? val : ""} placeholder={ph} label={label ? undefined : ph} onChange={s => setF(path, s)} />
    </div>
  );
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className="chip" aria-pressed={on} onClick={onClick}>{children}</button>;
}
function Del({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="del" aria-label={label} title="削除" onClick={onClick}>×</button>;
}

/* ===== 一覧 ===== */
export function FeatureSidebar() {
  const features = useStore(s => s.data.features);
  const currentId = useStore(s => s.ui.featureId);
  const rows = useMemo(() => features.map(f => {
    const cells = cellsOf(f);
    return { f, n: cells.length, done: statusCount(cells)["完了"], issues: issuesOf(f).length };
  }).sort((a, b) => b.f.updatedAt - a.f.updatedAt), [features]);
  return (
    <div className="side">
      <div className="side-head">
        <h2>切り分け</h2>
        <button type="button" className="primary small" onClick={createFeature}>＋ 新しく作る</button>
      </div>
      <div className="side-tools">
        {features.length > 0 && <button type="button" className="plain small-btn" onClick={() => exportExcel(features, "チケット一覧")}>すべてExcelに書き出す</button>}
        {features.length > 0 && <button type="button" className="plain small-btn" title="チケット本文もいっしょに書き出します" onClick={() => exportPack([], features.map(f => f.id), "切り分け")}>すべてファイルに書き出す</button>}
        <ImportButton />
      </div>
      <ul className="doclist">
        {rows.map(({ f, n, done, issues }) => (
          <li key={f.id} className={f.id === currentId ? "cur" : undefined}>
            <button type="button" className="open" onClick={() => { setUI({ featureId: f.id, sidebar: false }); window.scrollTo(0, 0); }}>
              <span className="t">{f.name.trim() || "(名前なし)"}</span>
              <span className="meta">
                <span>{stamp(f.updatedAt)}</span>
                <span>完了 {done}/{n}</span>
                <span className={issues ? "miss" : "done"}>{issues ? "確認事項 " + issues : "確認事項なし"}</span>
              </span>
            </button>
            <div className="ops">
              <button type="button" className="icon" title="削除" aria-label="削除" onClick={() => {
                update(d => { d.features = d.features.filter(x => x.id !== f.id); });
                if (currentId === f.id) setUI({ featureId: features.find(x => x.id !== f.id)?.id || null });
                toast("削除しました（作成済みのチケット本文は残ります）", true);
              }}>×</button>
            </div>
          </li>
        ))}
        {!rows.length && <li className="empty">まだありません。「＋ 新しく作る」から始めます。</li>}
      </ul>
    </div>
  );
}

/* ===== 本体 ===== */
export function FeatureWizard({ f }: { f: Feature }) {
  const partKey = useStore(s => s.ui.featurePart[f.id]) || "parts";
  const issues = issuesOf(f);
  const idx = Math.max(0, PARTS.findIndex(p => p.key === partKey));
  const part = PARTS[idx];
  const prev = PARTS[idx - 1], next = PARTS[idx + 1];
  return (
    <div className="wizard">
      <nav className="stepper" aria-label="パート">
        {PARTS.map((p, i) => {
          const m = issues.filter(x => x.part === p.key).length;
          return (
            <button key={p.key} type="button" className={"step-tab" + (i === idx ? " cur" : "")} aria-current={i === idx ? "step" : undefined}
              onClick={() => goFPart(f.id, p.key)}>
              <span className="num">{i + 1}</span><span className="t">{p.title}</span>
              <span className={m ? "st miss" : "st done"}>{m ? m : "✓"}</span>
            </button>
          );
        })}
      </nav>
      <section className="card part" key={f.id + part.key}>
        <h2><span className="pnum">{idx + 1} / {PARTS.length}</span>{part.title}</h2>
        {part.key === "parts" ? <PartsEditor f={f} /> : <SplitEditor f={f} />}
      </section>
      <div className="pager">
        {prev ? <button type="button" className="plain" onClick={() => goFPart(f.id, prev.key)}>← {prev.title}</button> : <span />}
        {next && <button type="button" className="primary" onClick={() => goFPart(f.id, next.key)}>次へ: {next.title} →</button>}
      </div>
    </div>
  );
}

/* 洗い出し: 起点 → イベント → チェック・ロジック。起点を足すとイベントも1つ入る */
function PartsEditor({ f }: { f: Feature }) {
  const add = (kind: EntryKind) => {
    focusLater(fid(["entries", f.entries.length, "name"]));
    editFeature(ff => { ff.entries.push(newEntry(kind, newId)); });
  };
  return <>
    <FText path={["name"]} label="フィーチャーの名前は？" ph="例: 口座開設書類のオンライン提出" />
    <FText path={["goal"]} label="何のためのフィーチャー？(誰に、どんな価値を。作ったチケットのストーリーになります)" ph="例: 会員が住所変更画面から、自分の住所をオンラインで変更できるようにしたい" />
    <div className="guide">
      <div className="q">漏れなく洗い出す</div>
      <ul>
        <li>画面ごとに、操作(ボタン押下・入力・表示)をイベントとして全部挙げたか。初期表示もイベント</li>
        <li>イベントの中のチェック(入力・業務・権限)と、ロジック(取得・登録・更新・削除・外部連携)を全部挙げたか</li>
        <li>チェック・ロジックごとに、実装する開発領域(CLIENT・BFF か BE)と、エラーハンドリングの有無を決めたか</li>
        <li><b>画面を介さないもの</b>(バッチ・定期実行、外部システムからの呼び出し、手動の運用作業)がないか</li>
      </ul>
    </div>
    <SortableList ids={f.entries.map(e => e._k)} onMove={(a, b) => editFeature(ff => move(ff.entries, a, b))}>
      {(_id, i, handle) => <EntryView e={f.entries[i]} i={i} handle={handle} />}
    </SortableList>
    <div className="palette">
      <div className="pal-row">
        <span className="pal-g">画面・処理</span>
        {(Object.keys(ENTRY_KINDS) as EntryKind[]).map(k => (
          <button key={k} type="button" className={"etc-btn " + (k === "screen" ? "pal-box" : "pal-proc")} onClick={() => add(k)}>＋ {ENTRY_KINDS[k].name}</button>
        ))}
      </div>
    </div>
  </>;
}

function EntryView({ e, i, handle }: { e: FEntry; i: number; handle: ReactNode }) {
  const k = ENTRY_KINDS[e.kind];
  const base: Path = ["entries", i];
  return (
    <div className={"step comp " + (e.kind === "screen" ? "comp-box" : "comp-proc")}>
      <div className="step-head">
        {handle}
        <span className={"badge " + (e.kind === "screen" ? "b-box" : "b-proc")}>{i + 1}. {k.name}</span>
        <span className="spacer" />
        <Del label={k.name + "を削除"} onClick={() => removeAt(["entries"], i, k.name)} />
      </div>
      {e.kind !== "screen" && <p className="hint">画面を介さない処理です。チケットは BE とエラーハンドリングになります。</p>}
      <FText path={[...base, "name"]} label={k.name + "の名前は？"} ph={k.ph} />
      <Kids>
        <SortableList ids={e.events.map(ev => ev._k)} onMove={(a, b) => editFeature(ff => move(ff.entries[i].events, a, b))}>
          {(_id, j, h) => <EventView e={e} ev={e.events[j]} i={i} j={j} handle={h} />}
        </SortableList>
        <AddEvent e={e} i={i} />
      </Kids>
    </div>
  );
}

/* イベントの追加。名前を書いて Enter で足す(ボタンでも足せる) */
function AddEvent({ e, i }: { e: FEntry; i: number }) {
  const [name, setName] = useState("");
  const k = ENTRY_KINDS[e.kind];
  const add = () => {
    const n = name.trim();
    focusLater(n ? "ff_add_" + e._k : fid(["entries", i, "events", e.events.length, "name"]));
    editFeature(ff => { ff.entries[i].events.push(newEvent(e.kind, n, newId)); });
    setName("");
  };
  return (
    <div className="add-event">
      <AutoText id={"ff_add_" + e._k} value={name} placeholder={k.event + "を追加(名前を書いて Enter。" + k.eventPh + ")"} label={k.event + "を追加"}
        onChange={setName} onKeyDown={ev => { if (ev.key === "Enter" && !ev.nativeEvent.isComposing) { ev.preventDefault(); add(); } }} />
      <button type="button" className="etc-btn" onClick={add}>＋ {k.event}</button>
    </div>
  );
}

function EventView({ e, ev, i, j, handle }: { e: FEntry; ev: FEvent; i: number; j: number; handle: ReactNode }) {
  const k = ENTRY_KINDS[e.kind];
  const base: Path = ["entries", i, "events", j];
  const add = (kind: FItem["kind"]) => {
    focusLater(fid([...base, "items", ev.items.length, "name"]));
    editFeature(ff => { ff.entries[i].events[j].items.push(newItem(kind, newId, e.kind)); });
  };
  return (
    <div className="row-card">
      <div className="row">
        {handle}
        <span className="badge b-data">{k.event} {j + 1}</span>
        <div className="grow"><FText path={[...base, "name"]} ph={k.eventPh} /></div>
        <Del label={k.event + "を削除"} onClick={() => removeAt(["entries", i, "events"], j, k.event)} />
      </div>
      <Kids>
        <SortableList ids={ev.items.map(it => it._k)} onMove={(a, b) => editFeature(ff => move(ff.entries[i].events[j].items, a, b))}>
          {(_id, n, h) => <ItemView it={ev.items[n]} split={!!ev.split} screen={e.kind === "screen"} path={[...base, "items", n]} n={n} handle={h} onDelete={() => removeAt([...base, "items"], n, ITEM_KINDS[ev.items[n].kind])} />}
        </SortableList>
        <div className="links">
          <button type="button" className="etc-btn pal-data" onClick={() => add("check")}>＋ チェック</button>
          <button type="button" className="etc-btn pal-data" onClick={() => add("logic")}>＋ ロジック</button>
        </div>
      </Kids>
    </div>
  );
}

function ItemView({ it, split, screen, path, n, handle, onDelete }: { it: FItem; split: boolean; screen: boolean; path: Path; n: number; handle: ReactNode; onDelete: () => void }) {
  const name = ITEM_KINDS[it.kind];
  return (
    <div className="check-item">
      <div className="row">
        {handle}
        <span className={"badge " + (it.kind === "check" ? "b-row" : "b-proc")}>{n + 1}. {name}</span>
        <div className="grow"><FText path={[...path, "name"]} ph={it.kind === "check" ? "例: ファイル形式チェック" : "例: 書類の情報を登録"} /></div>
        <Del label={name + "を削除"} onClick={onDelete} />
      </div>
      <div className="err-row">
        <span className="lbl">開発領域</span>
        {!screen && it.layer === "be" ? <span className="fixed-layer">BE</span> : split
          ? (["client", "bff", "be"] as const).map(l => <Chip key={l} on={it.layer === l} onClick={() => setF([...path, "layer"], l, false)}>{LAYERS[l]}</Chip>)
          : <>
            <Chip on={it.layer !== "be"} onClick={() => { if (it.layer === "be") setF([...path, "layer"], it.kind === "check" ? "bff" : "client", false); }}>{FRONT}</Chip>
            <Chip on={it.layer === "be"} onClick={() => setF([...path, "layer"], "be", false)}>BE</Chip>
          </>}
        <span className="lbl">エラーハンドリング</span>
        {(["あり", "なし"] as const).map(x => <Chip key={x} on={it.err === x} onClick={() => setF([...path, "err"], it.err === x ? "" : x, false)}>{x}</Chip>)}
      </div>
      {it.err === "あり" && <FText path={[...path, "errNote"]} ph="どんな場合にエラーか(任意。例: 拡張子が.pdfでない)" />}
    </div>
  );
}

/* 切り分けと実施状況: イベントごとに、開発領域のチケットのマス(オン・オフ、タイトル、実施状況) */
function SplitEditor({ f }: { f: Feature }) {
  const cells = cellsOf(f);
  const c = statusCount(cells);
  const issues = issuesOf(f).filter(x => x.part === "split");
  const data = useStore(s => s.data);
  const docMissing = (id: string) => {
    const d = data.docs.find(x => x.id === id);
    return d ? buildTicket(genreOf(data, d.genre), d.v, defsOf(data)).missing : null;
  };
  return <>
    <p className="hint">イベントごとに、開発領域（CLIENT・BFF / BE / エラーハンドリング）のチケットが自動でそろいます。カード1枚が1チケットです。CLIENT と BFF を別のチケットにするときは「CLIENTとBFFを分ける」を、不要なもの（BE が要らないなど）は × を押します。</p>
    <div className="status-sum">
      <span>チケット{cells.length}件</span>
      {STATUSES.map(s => <span key={s} className={"st-pill st-" + STATUSES.indexOf(s)}>{s} {c[s]}</span>)}
      <span className="spacer" />
      <button type="button" className="primary small" onClick={() => exportExcel([f], f.name.trim() || "チケット一覧")}>Excelに書き出す</button>
    </div>
    {f.entries.map((e, i) => (
      <div key={e._k} className="split-entry">
        <div className="q">{(e.kind === "screen" ? "" : "［" + ENTRY_KINDS[e.kind].name + "］") + entryLabel(e)}</div>
        {e.events.map((ev, j) => (
          <div key={ev._k} className="split-event">
            <div className="split-ev-name">
              <span>{ENTRY_KINDS[e.kind].event}：{ev.name.trim() || MISSING}</span>
              {/* CLIENT・BFF は画面のときだけ(画面を介さない処理は BE とエラーハンドリング) */}
              {e.kind === "screen" && <button type="button" className="link small" onClick={() => toggleSplit(["entries", i, "events", j])}>
                {ev.split ? FRONT + "を1チケットにまとめる" : "CLIENTとBFFを分ける"}</button>}
              {layersOf(ev).filter(l => !ev.cells[l]?.on && (e.kind === "screen" || l === "be" || l === "err")).map(l => (
                <button key={l} type="button" className="etc-btn small-btn" title="削除したチケットを戻す"
                  onClick={() => setF(["entries", i, "events", j, "cells", l, "on"], true, false)}>＋ {layerName(ev, l)}</button>
              ))}
            </div>
            {!layersOf(ev).some(l => ev.cells[l]?.on) && <p className="hint">チケットはありません（上の「＋」で戻せます）。</p>}
            <div className="cells">
              {layersOf(ev).filter(l => ev.cells[l]?.on).map(l => <Cell key={l} f={f} e={e} ev={ev} l={l} path={["entries", i, "events", j, "cells", l]} docMissing={docMissing} />)}
            </div>
          </div>
        ))}
      </div>
    ))}
    {!f.entries.length && <p className="hint">「洗い出し」で画面などを足すと、ここにチケットが並びます。</p>}
    <div className="split-entry">
      <div className="q">フィーチャー全体</div>
      <div className="split-event">
        <div className="split-ev-name">
          <span>ST（フィーチャー全体を通して確かめる）</span>
          {!(f.st && f.st.on) && <button type="button" className="etc-btn small-btn" title="削除したチケットを戻す" onClick={() => setF(["st"], { ...(f.st || newStCell()), on: true }, false)}>＋ ST</button>}
        </div>
        {f.st && f.st.on && <div className="cells"><StCell f={f} cell={f.st} docMissing={docMissing} /></div>}
      </div>
    </div>
    {issues.length > 0 && <div className="guide"><div className="q">確認事項</div><ul>{issues.map((x, i) => <li key={i}>{x.text}</li>)}</ul></div>}
  </>;
}

/* CLIENT と BFF を分ける・まとめる。分けるときは、BFF のマスを CLIENT のマスの状態から始める */
function toggleSplit(path: Path) {
  editFeature(ff => {
    const x = getAt(ff, path) as FEvent;
    if (!x.split) { const c = x.cells.client; x.cells.bff = { on: c.on, status: c.status || "未着手" }; }
    x.split = !x.split;
  });
}

/* フィーチャー全体のSTチケットのカード */
function StCell({ f, cell, docMissing }: { f: Feature; cell: FCell; docMissing: (id: string) => number | null }) {
  const m = cell.docId ? docMissing(cell.docId) : null;
  return (
    <div className={"cell st-b" + STATUSES.indexOf(cell.status || "未着手")}>
      <div className="cell-head">
        <span className="lname">ST</span>
        <span className="spacer" />
        <Del label="STのチケットを削除" onClick={() => { setF(["st", "on"], false, false); toast("STのチケットを削除しました", true); }} />
      </div>
      <AutoText id={fid(["st", "title"])} value={cell.title || ""} placeholder={stTitle(f)} label="STのチケットタイトル" onChange={s => setF(["st", "title"], s)} />
      <select value={cell.status || "未着手"} aria-label="STの実施状況" onChange={x => setF(["st", "status"], x.target.value as Status, false)}>
        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      {cell.docId && m != null
        ? <button type="button" className="link small" onClick={() => openDoc(cell.docId!)}>チケット本文を開く（{m ? "未記入" + m + "件" : "記入済み"}）</button>
        : <button type="button" className="link small" onClick={() => createStDoc(f)}>チケット本文を作る</button>}
    </div>
  );
}

function Cell({ f, e, ev, l, path, docMissing }: { f: Feature; e: FEntry; ev: FEvent; l: Layer; path: Path; docMissing: (id: string) => number | null }) {
  const cell = ev.cells[l] || { on: false };
  const tk = ticketsOf(f).find(x => x.event._k === ev._k && x.layer === l);
  if (!tk) return null;
  const m = cell.docId ? docMissing(cell.docId) : null;
  const content = contentOf(tk);
  return (
    <div className={"cell st-b" + STATUSES.indexOf(cell.status || "未着手")}>
      <div className="cell-head">
        <span className="lname">{layerName(ev, l)}</span>
        <span className="spacer" />
        <Del label={layerName(ev, l) + "のチケットを削除"} onClick={() => { setF([...path, "on"], false, false); toast(layerName(ev, l) + "のチケットを削除しました", true); }} />
      </div>
      <AutoText id={fid([...path, "title"])} value={cell.title || ""} placeholder={defaultTitle(e, ev, l)} label={layerName(ev, l) + "のチケットタイトル"}
        onChange={s => setF([...path, "title"], s)} />
      <select value={cell.status || "未着手"} aria-label={layerName(ev, l) + "の実施状況"} onChange={x => setF([...path, "status"], x.target.value as Status, false)}>
        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      {content.length > 0 ? <ul className="cell-items">{content.map((x, i) => <li key={i}>{x}</li>)}</ul> : <span className="meta">中身（チェック・ロジック）はありません</span>}
      {cell.docId && m != null
        ? <button type="button" className="link small" onClick={() => openDoc(cell.docId!)}>チケット本文を開く（{m ? "未記入" + m + "件" : "記入済み"}）</button>
        : <button type="button" className="link small" onClick={() => createDoc(tk)}>チケット本文を作る</button>}
    </div>
  );
}

/* 切り分けの結果のプレビュー */
export function FeaturePreview({ f }: { f: Feature }) {
  const partKey = useStore(s => s.ui.featurePart[f.id]) || "parts";
  const data = useStore(s => s.data);
  const box = useRef<HTMLDivElement>(null);
  const r = useMemo(() => buildFeature(f, id => {
    const d = data.docs.find(x => x.id === id);
    return d ? buildTicket(genreOf(data, d.genre), d.v, defsOf(data)).missing : null;
  }), [f, data]);
  useEffect(() => {
    const b = box.current; if (!b) return;
    const cur = b.querySelector<HTMLElement>(".blk.cur");
    if (cur) b.scrollTo({ top: Math.max(0, cur.offsetTop - b.offsetTop - 12), behavior: "smooth" });
  }, [partKey]);
  return (
    <section className="preview" aria-label="切り分けの結果">
      <div className="bar">
        <h2>切り分けの結果</h2>
        <span className={r.missing ? "count" : "count done"}>{r.missing ? "確認事項 " + r.missing + " 件" : "確認事項なし"}</span>
      </div>
      <div className="out" ref={box}>
        {r.blocks.filter(b => b.lines.length).map((b, i) => (
          <div key={b.key + i} className={"blk go" + (b.key === partKey ? " cur" : "")}
            onClick={() => { if (!String(window.getSelection() || "")) goFPart(f.id, b.key); }} title="押すと、このパートの入力へ移る">
            {b.lines.join("\n")}
          </div>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="primary" onClick={() => exportExcel([f], f.name.trim() || "チケット一覧")}>Excelに書き出す</button>
        <CopyButton className="plain" text={() => r.text} done="コピーした">文字でコピー</CopyButton>
        <button type="button" className="plain" title="チケット本文もいっしょに書き出します。読み込むと、ほかの人も同じ切り分けを使えます" onClick={() => exportPack([], [f.id], f.name.trim() || "切り分け")}>ファイルに書き出す</button>
      </div>
      <p className="note">Excelの列: {EXCEL_HEADER.join(" / ")}。1チケット1行。</p>
    </section>
  );
}

export function FeatureWelcome() {
  return (
    <section className="card welcome">
      <h2>チケットを切り分ける</h2>
      <p className="hint">フィーチャーを実装するのに必要なチケットを、漏れなくダブりなく切り分けます。画面を足すとイベントが入り、イベントごとに CLIENT・BFF / BE / エラーハンドリングのチケットが自動でそろいます。実施状況を付けて、Excelに書き出して共有できます。</p>
      <button type="button" className="primary" onClick={createFeature}>＋ 切り分けを始める</button>
    </section>
  );
}
