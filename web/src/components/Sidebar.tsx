/* チケットの一覧。検索とジャンルの絞り込み、新規作成、複製、書き出し、削除 */
import { useMemo, useState } from "react";
import { GENRES } from "../domain/genres";
import { buildTicket } from "../domain/ticket";
import { createDoc, deleteDoc, duplicateDoc, openDoc } from "../state/actions";
import { defsOf, genreOf, setUI, useStore } from "../state/store";
import { downloadMd, stamp, titleOf } from "../utils";

export function Sidebar() {
  const docs = useStore(s => s.data.docs);
  const templates = useStore(s => s.data.templates);
  const defs = useStore(s => defsOf(s.data));
  const currentId = useStore(s => s.ui.currentId);
  const query = useStore(s => s.ui.query);
  const filter = useStore(s => s.ui.filter);
  const [picking, setPicking] = useState(false);

  const rows = useMemo(() => docs.map(d => {
    const g = genreOf({ docs, templates, comps: {} }, d.genre);
    return { d, g, title: titleOf(d.v), missing: buildTicket(g, d.v, defs).missing };
  }), [docs, templates, defs]);
  const q = query.trim().toLowerCase();
  const shown = rows
    .filter(r => !filter || r.d.genre === filter)
    .filter(r => !q || [r.title, r.d.v.story, r.d.v.story_goal, r.d.v.api_name, r.d.v.proc_name].filter(x => typeof x === "string").join("\n").toLowerCase().includes(q))
    .sort((a, b) => b.d.updatedAt - a.d.updatedAt);

  return (
    <div className="side">
      <div className="side-head">
        <h2>チケット</h2>
        <button type="button" className="primary small" aria-expanded={picking} onClick={() => setPicking(!picking)}>＋ 新しく作る</button>
      </div>
      {picking && (
        <div className="picker" role="group" aria-label="作るチケットのジャンル">
          {Object.keys(GENRES).map(k => (
            <button key={k} type="button" className="plain" onClick={() => { setPicking(false); createDoc(k); }}>{GENRES[k].name}</button>
          ))}
        </div>
      )}
      <input type="search" className="search" placeholder="タイトルや内容で探す" value={query} aria-label="チケットを探す"
        onChange={e => setUI({ query: e.target.value })} />
      <div className="chips filter" role="group" aria-label="ジャンルで絞り込む">
        <button type="button" className="chip" aria-pressed={!filter} onClick={() => setUI({ filter: "" })}>すべて</button>
        {Object.keys(GENRES).map(k => (
          <button key={k} type="button" className="chip" aria-pressed={filter === k}
            onClick={() => setUI({ filter: filter === k ? "" : k })}>{GENRES[k].name}</button>
        ))}
      </div>
      <ul className="doclist">
        {shown.map(({ d, g, title, missing }) => (
          <li key={d.id} className={d.id === currentId ? "cur" : undefined}>
            <button type="button" className="open" onClick={() => openDoc(d.id)} aria-current={d.id === currentId ? "true" : undefined}>
              <span className="t">{title || "(タイトルなし)"}</span>
              <span className="meta">
                <span className="g">{g.name}</span>
                <span>{stamp(d.updatedAt)}</span>
                <span className={missing ? "miss" : "done"}>{missing ? "未記入 " + missing : "記入済み"}</span>
              </span>
            </button>
            <div className="ops">
              <button type="button" className="icon" title="複製して新しく作る" aria-label="複製" onClick={() => duplicateDoc(d.id)}>⧉</button>
              <button type="button" className="icon" title="Markdownで書き出す" aria-label="Markdownで書き出す" onClick={() => downloadMd(g, d.v, defs)}>⤓</button>
              <button type="button" className="icon" title="削除" aria-label="削除" onClick={() => deleteDoc(d.id)}>×</button>
            </div>
          </li>
        ))}
        {!shown.length && <li className="empty">{docs.length ? "当てはまるチケットはない。" : "まだない。「＋ 新しく作る」から始める。"}</li>}
      </ul>
    </div>
  );
}
