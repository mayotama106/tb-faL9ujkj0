import { useEffect, useMemo } from "react";
import { GENRES } from "./domain/genres";
import { buildTicket } from "./domain/ticket";
import { createDoc, goPart } from "./state/actions";
import { currentDoc, defsOf, genreOf, redo, setUI, undo, useStore } from "./state/store";
import { Preview } from "./components/Preview";
import { Sidebar } from "./components/Sidebar";
import { TemplateEditor } from "./components/TemplateEditor";
import { Wizard } from "./components/Wizard";

const EMPTY = {};

export function App() {
  const doc = useStore(currentDoc);
  const data = useStore(s => s.data);
  const editing = useStore(s => s.ui.editing);
  const editGenre = useStore(s => s.ui.editGenre);
  const sidebar = useStore(s => s.ui.sidebar);
  const canUndo = useStore(s => s.past.length > 0);
  const canRedo = useStore(s => s.future.length > 0);
  const partKey = useStore(s => (doc && s.ui.part[doc.id]) || "basic");

  /* Ctrl+Z で取り消し、Ctrl+Shift+Z または Ctrl+Y でやり直し(MacはCommand) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* プレビューに出すチケット。テンプレートの編集中は、編集中のジャンルで作る */
  /* 部品の編集中(comp:種類)は、実装チケットで作る */
  const previewGenre = editing ? (editGenre.startsWith("comp:") ? "impl" : editGenre) : doc ? doc.genre : null;
  const g = previewGenre ? genreOf(data, previewGenre) : null;
  const v = doc && doc.genre === previewGenre ? doc.v : EMPTY;
  const defs = defsOf(data);
  const ticket = useMemo(() => (g ? buildTicket(g, v, defs) : null), [g, v, defs]);

  return <>
    <header className="top">
      <button type="button" className="menu" aria-expanded={sidebar} onClick={() => setUI({ sidebar: !sidebar })}>☰<span className="lbl"> チケット一覧</span></button>
      <span className="brand">TICKET BUILDER</span>
      <span className="spacer" />
      <button type="button" className="hbtn" disabled={!canUndo} onClick={undo} title="元に戻す(Ctrl+Z)" aria-label="元に戻す">↶<span className="lbl"> 元に戻す</span></button>
      <button type="button" className="hbtn" disabled={!canRedo} onClick={redo} title="やり直す(Ctrl+Shift+Z)" aria-label="やり直す">↷<span className="lbl"> やり直す</span></button>
      <button type="button" className={editing ? "hbtn on" : "hbtn"} aria-pressed={editing}
        onClick={() => setUI(ui => ({ editing: !ui.editing, editGenre: doc ? doc.genre : ui.editGenre }))}>
        {editing ? "編集を終える" : <>テンプレート<span className="lbl">を編集</span></>}
      </button>
    </header>
    <div className="app">
      <aside className={sidebar ? "sidebar open" : "sidebar"}><Sidebar /></aside>
      {sidebar && <div className="scrim" onClick={() => setUI({ sidebar: false })} />}
      <main className="main">
        {editing ? <TemplateEditor />
          : doc && g && ticket ? <Wizard doc={doc} g={g} ticket={ticket} partKey={partKey} />
          : <Welcome />}
      </main>
      {g && ticket && (
        <div className="preview-col">
          <Preview g={g} v={v} ticket={ticket} partKey={editing ? undefined : partKey}
            onGo={!editing && doc ? key => goPart(doc.id, key) : undefined} />
        </div>
      )}
    </div>
    <ToastView />
  </>;
}

function Welcome() {
  return (
    <section className="card welcome">
      <h2>チケットを作る</h2>
      <p className="hint">ジャンルを選ぶと、新しいチケットができる。入力はパートごとに1つずつ埋めていき、ブラウザ内に自動保存される。</p>
      <div className="picker big">
        {Object.keys(GENRES).map(k => <button key={k} type="button" className="plain" onClick={() => createDoc(k)}>{GENRES[k].name}</button>)}
      </div>
    </section>
  );
}

function ToastView() {
  const t = useStore(s => s.ui.toast);
  if (!t) return null;
  return (
    <div className="toast" role="status">
      <span>{t.text}</span>
      {t.undo && <button type="button" className="link light" onClick={() => { undo(); setUI({ toast: null }); }}>元に戻す</button>}
      <button type="button" className="x" aria-label="閉じる" onClick={() => setUI({ toast: null })}>×</button>
    </div>
  );
}
