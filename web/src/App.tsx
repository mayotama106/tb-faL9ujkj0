import { useEffect, useMemo } from "react";
import { GENRES } from "./domain/genres";
import { buildTicket } from "./domain/ticket";
import { createDoc, goPart } from "./state/actions";
import { currentDoc, defsOf, genreOf, redo, setUI, undo, useStore } from "./state/store";
import { Preview } from "./components/Preview";
import { Sidebar } from "./components/Sidebar";
import { TemplateEditor, genreOfSel } from "./components/TemplateEditor";
import { Wizard } from "./components/Wizard";
import { LocalMenu } from "./components/LocalMenu";
import { FeaturePreview, FeatureSidebar, FeatureWelcome, FeatureWizard, useFeature } from "./components/Features";

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
  const view = useStore(s => s.ui.view);
  const feature = useFeature();

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
  const previewGenre = editing ? genreOfSel(editGenre, defsOf(data)) : doc ? doc.genre : null;
  const g = previewGenre ? genreOf(data, previewGenre) : null;
  const v = doc && doc.genre === previewGenre ? doc.v : EMPTY;
  const defs = defsOf(data);
  const ticket = useMemo(() => (g ? buildTicket(g, v, defs) : null), [g, v, defs]);

  return <>
    <header className="top">
      <button type="button" className="menu" aria-expanded={sidebar} onClick={() => setUI({ sidebar: !sidebar })}>☰<span className="lbl"> 一覧</span></button>
      <span className="brand">TICKET BUILDER</span>
      {/* チケット(ビルダー)とフィーチャー(分解)の切り替え */}
      <div className="views" role="group" aria-label="画面の切り替え">
        <button type="button" className={view === "tickets" ? "hbtn on" : "hbtn"} aria-pressed={view === "tickets"} onClick={() => setUI({ view: "tickets" })}>チケット</button>
        <button type="button" className={view === "features" ? "hbtn on" : "hbtn"} aria-pressed={view === "features"} onClick={() => setUI({ view: "features", editing: false })}>フィーチャー</button>
      </div>
      <span className="spacer" />
      <button type="button" className="hbtn" disabled={!canUndo} onClick={undo} title="元に戻す(Ctrl+Z)" aria-label="元に戻す">↶<span className="lbl"> 元に戻す</span></button>
      <button type="button" className="hbtn" disabled={!canRedo} onClick={redo} title="やり直す(Ctrl+Shift+Z)" aria-label="やり直す">↷<span className="lbl"> やり直す</span></button>
      {view === "tickets" && <button type="button" className={editing ? "hbtn on" : "hbtn"} aria-pressed={editing}
        onClick={() => setUI(ui => ({ editing: !ui.editing, editGenre: doc ? doc.genre : ui.editGenre }))}>
        {editing ? "編集を終える" : <>テンプレート<span className="lbl">を編集</span></>}
      </button>}
      <LocalMenu />
    </header>
    {view === "features" ? <div className="app">
      <aside className={sidebar ? "sidebar open" : "sidebar"}><FeatureSidebar /></aside>
      {sidebar && <div className="scrim" onClick={() => setUI({ sidebar: false })} />}
      <main className="main">{feature ? <FeatureWizard f={feature} /> : <FeatureWelcome />}</main>
      {feature && <div className="preview-col"><FeaturePreview f={feature} /></div>}
    </div> : <div className="app">
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
    </div>}
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
