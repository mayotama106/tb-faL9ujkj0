/* フィーチャーの分解の画面。定義 → 構成要素 → チケットへの切り分け の3パートで、
   必要なチケットを漏れなくダブりなく決め、チケットビルダーのチケットを作る */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  ENTRY_KINDS, ITEM_KINDS, buildFeature, docValues, issuesOf, planTickets, unitsOf,
  type EntryKind, type FEntry, type FEvent, type FItem, type Feature
} from "../domain/feature";
import { buildTicket } from "../domain/ticket";
import { ensureKeys } from "../state/persist";
import { defsOf, genreOf, getAt, getState, newId, setAt, setUI, toast, update, useStore, type Doc } from "../state/store";
import { stamp } from "../utils";
import { AutoText, Kids, focusLater } from "./Fields";
import { SortableList, move } from "./Sortable";
import { CopyButton } from "./Wizard";

type Path = (string | number)[];
const fid = (path: Path) => "ff_" + path.join("_");
const PARTS = [{ key: "basic", title: "フィーチャーの定義" }, { key: "parts", title: "構成要素" }, { key: "split", title: "チケットへの切り分け" }];

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
  toast(what + "を削除した", true);
}
export function createFeature() {
  const now = Date.now();
  const f: Feature = { id: newId(), name: "", goal: "", scope_in: [], scope_out: [], entries: [], tickets: [], createdAt: now, updatedAt: now };
  update(d => { d.features.unshift(f); });
  setUI({ featureId: f.id, view: "features", sidebar: false });
  focusLater(fid(["name"]));
}
function goFPart(id: string, key: string) {
  setUI(ui => ({ featurePart: { ...ui.featurePart, [id]: key } }));
  window.scrollTo(0, 0);
}
/* チケット案から、チケットビルダーのチケットを作る(作ったら、そのチケットを開く) */
function createDocFromPlan(ticketId: string) {
  const s = getState();
  const f = s.data.features.find(x => x.id === s.ui.featureId);
  const tk = f && f.tickets.find(x => x.id === ticketId);
  if (!f || !tk) return;
  const v = docValues(f, tk, newId);
  ensureKeys(v);
  const now = Date.now();
  const doc: Doc = { id: newId(), genre: tk.kind === "st" ? "st" : "impl", v, createdAt: now, updatedAt: now };
  update(d => {
    d.docs.unshift(doc);
    const ff = d.features.find(x => x.id === f.id);
    const t2 = ff && ff.tickets.find(x => x.id === ticketId);
    if (t2) t2.docId = doc.id;
  });
  toast("チケットを作った。チケットの画面で続きを書く");
}
function openDoc(id: string) {
  setUI({ view: "tickets", currentId: id, editing: false });
  window.scrollTo(0, 0);
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
function FList({ path, label, ph }: { path: Path; label: string; ph?: string }) {
  const f = useFeature();
  const raw = f ? getAt(f, path) : [];
  let items: string[] = Array.isArray(raw) ? raw : [];
  if (!items.length) items = [""];
  const edit = (fn: (a: string[]) => void, co?: string) => editFeature(ff => {
    let a = getAt(ff, path);
    if (!Array.isArray(a) || !a.length) { setAt(ff, path, items.slice()); a = getAt(ff, path); }
    fn(a);
  }, co ? path.join(".") + ":" + co : undefined);
  const add = () => { focusLater(fid([...path, items.length])); edit(a => { a.push(""); }); };
  return (
    <div className="node">
      <div className="q">{label}</div>
      <div className="rows">
        {items.map((it, i) => (
          <div className="row" key={i}>
            <AutoText id={fid([...path, i])} value={it} placeholder={ph} label={label + " " + (i + 1)}
              onChange={s => edit(a => { a[i] = s; }, String(i))}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
            <button type="button" className="del" aria-label={label + " " + (i + 1) + " を削除"} onClick={() => edit(a => { a.splice(i, 1); })}>×</button>
          </div>
        ))}
        <button type="button" className="etc-btn" onClick={add}>＋ 項目を追加</button>
      </div>
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
  const rows = useMemo(() => features.map(f => ({ f, issues: issuesOf(f).length })).sort((a, b) => b.f.updatedAt - a.f.updatedAt), [features]);
  return (
    <div className="side">
      <div className="side-head">
        <h2>フィーチャー</h2>
        <button type="button" className="primary small" onClick={createFeature}>＋ 新しく作る</button>
      </div>
      <ul className="doclist">
        {rows.map(({ f, issues }) => (
          <li key={f.id} className={f.id === currentId ? "cur" : undefined}>
            <button type="button" className="open" onClick={() => { setUI({ featureId: f.id, sidebar: false }); window.scrollTo(0, 0); }}>
              <span className="t">{f.name.trim() || "(名前なし)"}</span>
              <span className="meta">
                <span>{stamp(f.updatedAt)}</span>
                <span>チケット {f.tickets.length}</span>
                <span className={issues ? "miss" : "done"}>{issues ? "確認事項 " + issues : "確認事項なし"}</span>
              </span>
            </button>
            <div className="ops">
              <button type="button" className="icon" title="削除" aria-label="削除" onClick={() => {
                update(d => { d.features = d.features.filter(x => x.id !== f.id); });
                if (currentId === f.id) setUI({ featureId: features.find(x => x.id !== f.id)?.id || null });
                toast("フィーチャーを削除した(作ったチケットは残る)", true);
              }}>×</button>
            </div>
          </li>
        ))}
        {!rows.length && <li className="empty">まだない。「＋ 新しく作る」から始める。</li>}
      </ul>
    </div>
  );
}

/* ===== 本体 ===== */
export function FeatureWizard({ f }: { f: Feature }) {
  const partKey = useStore(s => s.ui.featurePart[f.id]) || "basic";
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
        {part.key === "basic" && <>
          <FText path={["name"]} label="フィーチャーの名前は？" ph="例: 口座開設書類のオンライン提出" />
          <FText path={["goal"]} label="何を提供したい？(誰に、どんな価値を)" ph="例: 口座開設審査に必要な書類をオンラインで提出できるようにしたい" />
          <FList path={["scope_in"]} label="スコープ内は？(このフィーチャーでやること)" ph="例: 書類のアップロード" />
          <FList path={["scope_out"]} label="スコープ外は？(このフィーチャーではやらないこと)" ph="例: 提出済み書類の差し替え" />
        </>}
        {part.key === "parts" && <PartsEditor f={f} />}
        {part.key === "split" && <SplitEditor f={f} />}
      </section>
      <div className="pager">
        {prev ? <button type="button" className="plain" onClick={() => goFPart(f.id, prev.key)}>← {prev.title}</button> : <span />}
        {next && <button type="button" className="primary" onClick={() => goFPart(f.id, next.key)}>次へ: {next.title} →</button>}
      </div>
    </div>
  );
}

/* 構成要素: 起点 → イベント → チェック・ロジック → エラーハンドリング */
function PartsEditor({ f }: { f: Feature }) {
  const add = (kind: EntryKind) => {
    focusLater(fid(["entries", f.entries.length, "name"]));
    editFeature(ff => { ff.entries.push({ _k: newId(), kind, name: "", events: [] }); });
  };
  return <>
    <div className="guide">
      <div className="q">漏れなく洗い出す</div>
      <ul>
        <li>画面ごとに、操作(ボタン押下・入力・表示)をイベントとして全部挙げたか。初期表示もイベント</li>
        <li>イベントの中のチェック(入力・業務・権限)と、ロジック(取得・登録・更新・削除・外部連携)を全部挙げたか</li>
        <li>チェック・ロジックごとに、エラーハンドリングの有無を決めたか</li>
        <li><b>画面を介さないもの</b>(バッチ・定期実行、外部システムからの呼び出し、手動の運用作業)がないか</li>
      </ul>
    </div>
    <SortableList ids={f.entries.map(e => e._k)} onMove={(a, b) => editFeature(ff => move(ff.entries, a, b))}>
      {(_id, i, handle) => <EntryView e={f.entries[i]} i={i} handle={handle} />}
    </SortableList>
    <div className="palette">
      <div className="pal-row">
        <span className="pal-g">起点</span>
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
      {e.kind !== "screen" && <p className="hint">画面を介さない処理。起動・呼び出しのきっかけと、中のチェック・ロジックを洗い出す。</p>}
      <div className="chips">
        {(Object.keys(ENTRY_KINDS) as EntryKind[]).map(x => (
          <Chip key={x} on={e.kind === x} onClick={() => setF([...base, "kind"], x, false)}>{ENTRY_KINDS[x].name}</Chip>
        ))}
      </div>
      <FText path={[...base, "name"]} label={k.name + "の名前は？"} ph={k.ph} />
      <Kids>
        <SortableList ids={e.events.map(ev => ev._k)} onMove={(a, b) => editFeature(ff => move(ff.entries[i].events, a, b))}>
          {(_id, j, h) => <EventView e={e} ev={e.events[j]} i={i} j={j} handle={h} />}
        </SortableList>
        <button type="button" className="etc-btn" onClick={() => {
          focusLater(fid([...base, "events", e.events.length, "name"]));
          editFeature(ff => { ff.entries[i].events.push({ _k: newId(), name: "", items: [] }); });
        }}>＋ {k.event}</button>
      </Kids>
    </div>
  );
}

function EventView({ e, ev, i, j, handle }: { e: FEntry; ev: FEvent; i: number; j: number; handle: ReactNode }) {
  const k = ENTRY_KINDS[e.kind];
  const base: Path = ["entries", i, "events", j];
  const add = (kind: FItem["kind"]) => {
    focusLater(fid([...base, "items", ev.items.length, "name"]));
    editFeature(ff => { ff.entries[i].events[j].items.push({ _k: newId(), kind, name: "", err: "" }); });
  };
  return (
    <div className="row-card">
      <div className="step-head">
        {handle}
        <span className="badge b-data">{k.event} {j + 1}</span>
        <span className="spacer" />
        <Del label={k.event + "を削除"} onClick={() => removeAt(["entries", i, "events"], j, k.event)} />
      </div>
      <FText path={[...base, "name"]} label={k.event + "の名前は？"} ph={k.eventPh} />
      <Kids>
        <SortableList ids={ev.items.map(it => it._k)} onMove={(a, b) => editFeature(ff => move(ff.entries[i].events[j].items, a, b))}>
          {(_id, n, h) => <ItemView it={ev.items[n]} path={[...base, "items", n]} n={n} handle={h} onDelete={() => removeAt([...base, "items"], n, ITEM_KINDS[ev.items[n].kind])} />}
        </SortableList>
        <div className="links">
          <button type="button" className="etc-btn pal-data" onClick={() => add("check")}>＋ チェック</button>
          <button type="button" className="etc-btn pal-data" onClick={() => add("logic")}>＋ ロジック</button>
        </div>
      </Kids>
    </div>
  );
}

function ItemView({ it, path, n, handle, onDelete }: { it: FItem; path: Path; n: number; handle: ReactNode; onDelete: () => void }) {
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
        <span className="lbl">エラーハンドリング</span>
        {(["あり", "なし"] as const).map(x => <Chip key={x} on={it.err === x} onClick={() => setF([...path, "err"], it.err === x ? "" : x, false)}>{x}</Chip>)}
      </div>
      {it.err === "あり" && <FText path={[...path, "errNote"]} ph={it.kind === "check" ? "どんな場合にエラーか(任意。例: 拡張子が.pdfでない)" : "どんな場合にエラーか(任意。例: 保存に失敗した場合)"} />}
    </div>
  );
}

/* チケットへの切り分け: 単位(画面の表示・チェック・ロジック)を1つのチケットにだけ割り当てる */
function SplitEditor({ f }: { f: Feature }) {
  const units = unitsOf(f);
  const issues = issuesOf(f).filter(x => x.part === "split");
  const docs = useStore(s => s.data.docs);
  const data = useStore(s => s.data);
  const defs = defsOf(data);
  const docMissing = (id: string) => {
    const d = docs.find(x => x.id === id);
    return d ? buildTicket(genreOf(data, d.genre), d.v, defs).missing : null;
  };
  return <>
    <p className="hint">構成要素の「画面の表示」と「チェック・ロジック」を、どれか1つのチケットに割り当てる(1つに1チケットなのでダブりは起きない)。未割当が残らなければ漏れもない。</p>
    <button type="button" className="primary" onClick={() => editFeature(ff => {
      const n = planTickets(ff, newId);
      ff.tickets = n.tickets; ff.entries = n.entries;
    })}>未割当の分からチケット案を作る</button>
    <p className="hint">画面の表示は画面ごと、チェック・ロジックはイベントごとに1チケットにまとめる。STチケットがなければ1つ足す。割り当て済みのものは変えない。</p>

    <div className="node">
      <div className="q">チケット</div>
      <SortableList ids={f.tickets.map(x => x.id)} onMove={(a, b) => editFeature(ff => move(ff.tickets, a, b))}>
        {(_id, i, handle) => {
          const tk = f.tickets[i];
          const mine = units.filter(u => u.ticket === tk.id);
          const m = tk.docId ? docMissing(tk.docId) : null;
          return (
            <div className="row-card">
              <div className="row">
                {handle}
                <span className={"badge " + (tk.kind === "st" ? "b-data" : "b-box")}>{tk.kind === "st" ? "ST" : "実装"}</span>
                <div className="grow"><FText path={["tickets", i, "title"]} ph="チケットのタイトル" /></div>
                <Del label="チケットを削除" onClick={() => removeAt(["tickets"], i, "チケット案")} />
              </div>
              {mine.length > 0 && <ul className="ac-auto">{mine.map(u => <li key={u.key}>{u.label}</li>)}</ul>}
              <div className="actions">
                {tk.docId && m != null
                  ? <><button type="button" className="plain" onClick={() => openDoc(tk.docId!)}>チケットを開く</button>
                    <span className={m ? "st miss" : "st done"}>{m ? "未記入 " + m : "記入済み"}</span></>
                  : <button type="button" className="primary small" onClick={() => createDocFromPlan(tk.id)}>ビルダーでチケットを作る</button>}
              </div>
            </div>
          );
        }}
      </SortableList>
      <div className="links">
        <button type="button" className="etc-btn" onClick={() => editFeature(ff => { ff.tickets.push({ id: newId(), title: "", kind: "impl" }); })}>＋ 実装チケット</button>
        <button type="button" className="etc-btn" onClick={() => editFeature(ff => { ff.tickets.push({ id: newId(), title: (ff.name || "") + "のST", kind: "st" }); })}>＋ STチケット</button>
      </div>
    </div>

    <div className="node">
      <div className="q">割り当て(構成要素 → チケット)</div>
      {!units.length && <p className="hint">構成要素に画面やチェック・ロジックを足すと、ここに並ぶ。</p>}
      <div className="assign">
        {units.map(u => (
          <label key={u.key} className={"assign-row" + (u.ticket && f.tickets.some(x => x.id === u.ticket) ? "" : " none")}>
            <span className="lbl">{u.label}</span>
            <select value={f.tickets.some(x => x.id === u.ticket) ? u.ticket : ""} onChange={e => setF(u.path, e.target.value, false)}>
              <option value="">(未割当)</option>
              {f.tickets.filter(x => x.kind === "impl").map(x => <option key={x.id} value={x.id}>{x.title.trim() || "(タイトルなし)"}</option>)}
            </select>
          </label>
        ))}
      </div>
    </div>

    {issues.length > 0 && <div className="guide"><div className="q">確認事項</div><ul>{issues.map((x, i) => <li key={i}>{x.text}</li>)}</ul></div>}
  </>;
}

/* 分解の結果のプレビュー */
export function FeaturePreview({ f }: { f: Feature }) {
  const partKey = useStore(s => s.ui.featurePart[f.id]) || "basic";
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
    <section className="preview" aria-label="分解の結果">
      <div className="bar">
        <h2>分解の結果</h2>
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
        <CopyButton className="primary" text={() => r.text} done="コピーした">分解の結果をコピー</CopyButton>
      </div>
      <p className="note">フィーチャーもこのブラウザ内に自動保存される。チケットビルダーのチケットとつながっている。</p>
    </section>
  );
}

export function FeatureWelcome() {
  return (
    <section className="card welcome">
      <h2>フィーチャーを分解する</h2>
      <p className="hint">フィーチャーを実装するのに必要なチケットを、漏れなくダブりなく切り分ける。画面 → イベント → チェック・ロジック → エラーハンドリングの順に洗い出し、チケットに割り当てて、そのままチケットビルダーで作る。</p>
      <button type="button" className="primary" onClick={createFeature}>＋ フィーチャーを作る</button>
    </section>
  );
}
