/* テンプレート(ホーム)。部品を組み合わせたテンプレートを選び、要らない部品を外してコピーする。
   チケットの中身はここには入れない(コピー先で【】を埋める)。部品もテンプレートも、ここで編集・追加・複製できる */
import { useMemo, useState } from "react";
import { KIT_CATS, KIT_GENRES, assemble, defaultKit, holesOf, insertIndex, partsOf, usedBy, type KPart, type KTpl } from "../domain/kit";
import { getState, newId, setUI, toast, update, useStore } from "../state/store";
import { AutoText } from "./Fields";
import { LineEditor } from "./LineEditor";
import { SortableList, move } from "./Sortable";
import { CopyButton } from "./Wizard";

const useKit = () => useStore(s => s.data.kit);
export function useKitTpl(): KTpl | null {
  const kit = useKit();
  const id = useStore(s => s.ui.kitId);
  return kit.tpls.find(t => t.id === id) || null;
}
export function useKitPart(): KPart | null {
  const kit = useKit();
  const id = useStore(s => s.ui.kitPart);
  return kit.parts.find(p => p.id === id) || null;
}
/* オフにした部品。まだ触っていないテンプレートは、opt の部品がオフ */
const useOff = (t: KTpl) => useStore(s => s.ui.kitOff[t.id]) || t.opt;
const setOff = (t: KTpl, off: string[]) => setUI(ui => ({ kitOff: { ...ui.kitOff, [t.id]: off } }));

const editTpl = (id: string, fn: (t: KTpl) => void, coalesce?: string) =>
  update(d => { const t = d.kit.tpls.find(x => x.id === id); if (t) fn(t); }, { coalesce: coalesce && "kit:" + id + ":" + coalesce });
const editPart = (id: string, fn: (p: KPart) => void, coalesce?: string) =>
  update(d => { const p = d.kit.parts.find(x => x.id === id); if (p) fn(p); }, { coalesce: coalesce && "kitp:" + id + ":" + coalesce });

/* 次に開くテンプレートで、はじめから開いておく部品(新しく作ったとき) */
let openNext: string | null = null;
/* 新しいテンプレートは、自分で書く部品「本文」を1つ持って始め、その中身を開いておく */
function newTpl(genre: string) {
  const id = newId(), pid = newId();
  update(d => {
    d.kit.parts.push({ id: pid, cat: "基本", name: "本文（新しいテンプレート）", body: "## 概要\n\n* 【〇〇】" });
    d.kit.tpls.unshift({ id, genre, name: "新しいテンプレート", desc: "", title: "", parts: [pid], opt: [] });
  });
  openNext = pid + "#0";
  setUI({ kitTab: "tpls", kitId: id, sidebar: false });
}
function dupTpl(t: KTpl) {
  const id = newId();
  update(d => { const i = d.kit.tpls.findIndex(x => x.id === t.id); d.kit.tpls.splice(i + 1, 0, { ...structuredClone(t), id, name: t.name + "（コピー）" }); });
  setUI(ui => ({ kitTab: "tpls", kitId: id, kitOff: { ...ui.kitOff, [id]: ui.kitOff[t.id] || t.opt } }));
  toast("「" + t.name + "」を複製しました", true);
}
function delTpl(t: KTpl) {
  update(d => { d.kit.tpls = d.kit.tpls.filter(x => x.id !== t.id); });
  if (getState().ui.kitId === t.id) setUI({ kitId: getState().data.kit.tpls[0]?.id || null });
  toast("「" + t.name + "」を削除しました", true);
}
function newPart(cat: string, addTo?: KTpl) {
  const id = newId();
  update(d => {
    d.kit.parts.push({ id, cat, name: "新しい部品", body: "* 【〇〇】" });
    const t = addTo && d.kit.tpls.find(x => x.id === addTo.id);
    if (t) t.parts.push(id);
  });
  return id;
}
function dupPart(p: KPart) {
  const id = newId();
  update(d => { const i = d.kit.parts.findIndex(x => x.id === p.id); d.kit.parts.splice(i + 1, 0, { ...p, id, name: p.name + "（コピー）" }); });
  setUI({ kitTab: "parts", kitPart: id });
  toast("部品「" + p.name + "」を複製しました", true);
}
function delPart(p: KPart) {
  const n = usedBy(getState().data.kit, p.id).length;
  if (n && !confirm("部品「" + p.name + "」は" + n + "件のテンプレートで使っています。削除すると、それらのテンプレートからも外れます。削除しますか？")) return;
  update(d => {
    d.kit.parts = d.kit.parts.filter(x => x.id !== p.id);
    d.kit.tpls.forEach(t => { t.parts = t.parts.filter(x => x !== p.id); t.opt = t.opt.filter(x => x !== p.id); });
  });
  if (getState().ui.kitPart === p.id) setUI({ kitPart: null });
  toast("部品「" + p.name + "」を削除しました", true);
}
function resetKit() {
  if (!confirm("テンプレートと部品を、すべて初期状態に戻します。追加・編集したものは消えます(元に戻すで取り消せます)。よろしいですか？")) return;
  const kit = defaultKit();
  update(d => { d.kit = kit; });
  setUI({ kitId: kit.tpls[0]?.id || null, kitPart: null, kitOff: {} });
  toast("テンプレートを初期状態に戻しました", true);
}

const match = (q: string, ...xs: string[]) => !q || xs.join("\n").toLowerCase().includes(q);
function group<T>(items: T[], keyOf: (x: T) => string, order: string[]): [string, T[]][] {
  const keys = order.concat([...new Set(items.map(keyOf))].filter(k => !order.includes(k)));
  return keys.map(k => [k, items.filter(x => keyOf(x) === k)] as [string, T[]]).filter(([, xs]) => xs.length);
}

export function KitSidebar() {
  const kit = useKit();
  const tab = useStore(s => s.ui.kitTab);
  const kitId = useStore(s => s.ui.kitId);
  const partId = useStore(s => s.ui.kitPart);
  const query = useStore(s => s.ui.kitQuery);
  const q = query.trim().toLowerCase();
  const name = (id: string) => kit.parts.find(p => p.id === id)?.name || "";
  return (
    <div className="side">
      <div className="side-head">
        <h2>テンプレート</h2>
        {tab === "tpls"
          ? <button type="button" className="primary small" onClick={() => newTpl("その他")}>＋ 新しく作る</button>
          : <button type="button" className="primary small" onClick={() => { const id = newPart("基本"); setUI({ kitPart: id, sidebar: false }); }}>＋ 部品を作る</button>}
      </div>
      <div className="chips tpl-tabs" role="group" aria-label="一覧の切り替え">
        <button type="button" className="chip" aria-pressed={tab === "tpls"} onClick={() => setUI({ kitTab: "tpls" })}>テンプレート {kit.tpls.length}</button>
        <button type="button" className="chip" aria-pressed={tab === "parts"} onClick={() => setUI({ kitTab: "parts" })}>部品 {kit.parts.length}</button>
      </div>
      <input type="search" className="search" placeholder={tab === "tpls" ? "名前・説明・部品で探す" : "名前・中身で探す"} value={query}
        aria-label="探す" onChange={e => setUI({ kitQuery: e.target.value })} />
      {tab === "tpls" ? (
        <div className="kit-list">
          {group(kit.tpls.filter(t => match(q, t.name, t.desc, t.genre, ...t.parts.map(name))), t => t.genre, KIT_GENRES).map(([g, ts]) => (
            <section key={g}>
              <h3>{g}</h3>
              <ul className="doclist">
                {ts.map(t => (
                  <li key={t.id} className={t.id === kitId ? "cur" : undefined}>
                    <button type="button" className="open" aria-current={t.id === kitId ? "true" : undefined} onClick={() => setUI({ kitId: t.id, sidebar: false })}>
                      <span className="t">{t.name || "(名前なし)"}</span>
                      <span className="meta"><span>{t.desc}</span><span>部品 {t.parts.length}</span></span>
                    </button>
                    <div className="ops">
                      <button type="button" className="icon" title="複製して別のテンプレートにする" aria-label="複製" onClick={() => dupTpl(t)}>⧉</button>
                      <button type="button" className="icon" title="削除" aria-label="削除" onClick={() => delTpl(t)}>×</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="kit-list">
          {group(kit.parts.filter(p => match(q, p.name, p.body, p.cat)), p => p.cat, KIT_CATS).map(([c, ps]) => (
            <section key={c}>
              <h3>{c}</h3>
              <ul className="doclist">
                {ps.map(p => (
                  <li key={p.id} className={p.id === partId ? "cur" : undefined}>
                    <button type="button" className="open" aria-current={p.id === partId ? "true" : undefined} onClick={() => setUI({ kitPart: p.id, sidebar: false })}>
                      <span className="t">{p.name || "(名前なし)"}</span>
                      <span className="meta"><span>テンプレート {usedBy(kit, p.id).length}件で使用</span></span>
                    </button>
                    <div className="ops">
                      <button type="button" className="icon" title="複製" aria-label="複製" onClick={() => dupPart(p)}>⧉</button>
                      <button type="button" className="icon" title="削除" aria-label="削除" onClick={() => delPart(p)}>×</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <div className="side-tools">
        <button type="button" className="plain small-btn" onClick={resetKit}>初期状態に戻す</button>
      </div>
    </div>
  );
}

/* テンプレートの組み立て。部品の並べ替え、オン・オフ、追加、外す、中身の編集 */
export function KitComposer({ t }: { t: KTpl }) {
  const kit = useKit();
  const off = useOff(t);
  const [open, setOpen] = useState<string | null>(() => { const o = openNext; openNext = null; return o; });
  const [adding, setAdding] = useState(false);
  const ids = t.parts.map((id, i) => id + "#" + i);
  return <>
    <section className="card kit-head">
      <div className="kit-fields">
        <label>テンプレート名<AutoText id="kit_name" value={t.name} label="テンプレート名" onChange={s => editTpl(t.id, x => { x.name = s; }, "name")} /></label>
        <label>ジャンル
          <select value={t.genre} onChange={e => editTpl(t.id, x => { x.genre = e.target.value; })}>
            {KIT_GENRES.concat(KIT_GENRES.includes(t.genre) ? [] : [t.genre]).map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label>説明<AutoText id="kit_desc" value={t.desc} label="説明" placeholder="どんなときに使うか" onChange={s => editTpl(t.id, x => { x.desc = s; }, "desc")} /></label>
        <label>タイトルの書き方<AutoText id="kit_title" value={t.title} label="タイトルの書き方" placeholder="例: 【BE】【画面・処理】 【イベント】の【対象】取得処理の実装" onChange={s => editTpl(t.id, x => { x.title = s; }, "title")} /></label>
      </div>
    </section>
    <section className="card">
      <h2>部品 <span className="meta">チェックを外した部品はコピーに入りません。⋮⋮ で並べ替えられます。</span></h2>
      <SortableList ids={ids} onMove={(f, to) => editTpl(t.id, x => move(x.parts, f, to))}>
        {(key, i, handle) => {
          const id = t.parts[i], p = kit.parts.find(x => x.id === id);
          const on = !off.includes(id);
          return (
            <div className={"kit-part" + (on ? "" : " off")} key={key}>
              <div className="row">
                {handle}
                <label className="kit-on">
                  <input type="checkbox" checked={on} onChange={() => setOff(t, on ? off.concat(id) : off.filter(x => x !== id))} />
                  <span className="t">{p ? p.name : "(削除された部品)"}</span>
                  {p && <span className="tag">{p.cat}</span>}
                  {t.opt.includes(id) && <span className="opt">任意</span>}
                </label>
                <span className="spacer" />
                {p && <button type="button" className="link small" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>{open === key ? "閉じる" : "中身"}</button>}
                <button type="button" className="del" title="このテンプレートから外す" aria-label={(p ? p.name : "部品") + "を外す"}
                  onClick={() => editTpl(t.id, x => { x.parts.splice(i, 1); if (!x.parts.includes(id)) x.opt = x.opt.filter(y => y !== id); })}>×</button>
              </div>
              {p && open === key && <PartBody p={p} />}
            </div>
          );
        }}
      </SortableList>
      {!t.parts.length && <p className="hint">部品がありません。「＋ 部品を足す」から選びます。</p>}
      <div className="chips kit-add">
        <button type="button" className="plain small-btn" aria-expanded={adding} onClick={() => setAdding(!adding)}>＋ 部品を足す</button>
        <button type="button" className="plain small-btn" onClick={() => { const id = newPart("基本", t); setOpen(id + "#" + t.parts.length); }}>＋ 新しい部品を作って足す</button>
        <button type="button" className="plain small-btn" onClick={() => dupTpl(t)}>複製して別のテンプレートにする</button>
      </div>
      {adding && <PartPicker t={t} onPick={id => editTpl(t.id, x => { x.parts.splice(insertIndex(kit, x, id), 0, id); })} />}
    </section>
  </>;
}

/* 足す部品を選ぶ。分類ごとに並べ、すでに入っているものには印を付ける */
function PartPicker({ t, onPick }: { t: KTpl; onPick: (id: string) => void }) {
  const kit = useKit();
  const [q, setQ] = useState("");
  const qq = q.trim().toLowerCase();
  return (
    <div className="kit-picker">
      <input type="search" className="search" placeholder="部品を探す" value={q} aria-label="部品を探す" onChange={e => setQ(e.target.value)} />
      {group(kit.parts.filter(p => match(qq, p.name, p.body, p.cat)), p => p.cat, KIT_CATS).map(([c, ps]) => (
        <div key={c} className="kit-pick-group">
          <div className="q">{c}</div>
          <div className="chips">
            {ps.map(p => (
              <button key={p.id} type="button" className="chip" title={p.body} onClick={() => onPick(p.id)}>
                {t.parts.includes(p.id) ? "✓ " : "＋ "}{p.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* 部品の中身の編集。使っているテンプレートすべてに反映される */
function PartBody({ p }: { p: KPart }) {
  const kit = useKit();
  const n = usedBy(kit, p.id).length;
  return (
    <div className="kit-body">
      <div className="kit-fields two">
        <label>部品名<AutoText id={"kp_name_" + p.id} value={p.name} label="部品名" onChange={s => editPart(p.id, x => { x.name = s; }, "name")} /></label>
        <label>分類
          <input list="kit-cats" value={p.cat} aria-label="分類" onChange={e => editPart(p.id, x => { x.cat = e.target.value; }, "cat")} />
          <datalist id="kit-cats">{KIT_CATS.map(c => <option key={c} value={c} />)}</datalist>
        </label>
      </div>
      <div className="kit-text">中身（埋める所は【〇〇】）
        <LineEditor key={p.id} id={"kp_body_" + p.id} value={p.body} label="部品の中身" onChange={s => editPart(p.id, x => { x.body = s; }, "body")} />
      </div>
      <p className="hint">{n > 1 ? "この部品は" + n + "件のテンプレートで使っています。直すと、すべてに反映されます。" : "この部品を使っているのは、このテンプレートだけです。"}</p>
    </div>
  );
}

/* 部品の一覧で開いた部品 */
export function KitPartEditor({ p }: { p: KPart }) {
  const kit = useKit();
  const used = usedBy(kit, p.id);
  return (
    <section className="card">
      <h2>部品の編集</h2>
      <PartBody p={p} />
      {used.length > 0 && <div className="kit-used">
        <div className="q">使っているテンプレート</div>
        <div className="chips">{used.map(t => <button key={t.id} type="button" className="chip" onClick={() => setUI({ kitTab: "tpls", kitId: t.id })}>{t.name}</button>)}</div>
      </div>}
      <div className="chips kit-add">
        <button type="button" className="plain small-btn" onClick={() => dupPart(p)}>複製</button>
        <button type="button" className="plain small-btn" onClick={() => delPart(p)}>削除</button>
      </div>
    </section>
  );
}

export function KitWelcome({ parts }: { parts?: boolean }) {
  return (
    <section className="card welcome">
      <h2>{parts ? "部品" : "テンプレート"}</h2>
      <p className="hint">{parts
        ? "部品は、テンプレートを組み立てる本文の一片です。左の一覧から選ぶと、中身を編集できます。"
        : "左の一覧からテンプレートを選ぶと、組み立てた本文をコピーできます。チケットの中身はここには入れず、コピー先で【】を埋めてください。"}</p>
    </section>
  );
}

/* 埋める所(【〇〇】)を目立たせて表示する */
function Holes({ text }: { text: string }) {
  return <>{text.split(/(【[^】]*】)/).map((s, i) => (i % 2 ? <mark key={i}>{s}</mark> : s))}</>;
}

export function KitPreview({ t, p }: { t?: KTpl | null; p?: KPart | null }) {
  const kit = useKit();
  const off = useStore(s => (t ? s.ui.kitOff[t.id] : null)) || (t ? t.opt : []);
  const text = useMemo(() => (t ? assemble(partsOf(kit, t, off)) : p ? p.body : ""), [kit, t, p, off]);
  const n = holesOf(text);
  return (
    <section className="preview" aria-label="本文">
      <div className="bar">
        <h2>{t ? "本文" : "部品の中身"}</h2>
        <span className="count">埋める所 {n} 件</span>
      </div>
      {t && t.title && <div className="kit-title"><Holes text={t.title} /></div>}
      <div className="out"><div className="blk"><Holes text={text} /></div></div>
      <div className="actions">
        <CopyButton className="primary" text={() => text} done="本文をコピーした">本文をコピー</CopyButton>
        {t && t.title && <CopyButton className="plain" text={() => t.title} done="タイトルをコピーした">タイトルをコピー</CopyButton>}
      </div>
      <p className="note">テンプレートはこのブラウザ内にだけ保存され、外部には送信されません。案件の情報はコピー先で埋めてください。</p>
    </section>
  );
}
