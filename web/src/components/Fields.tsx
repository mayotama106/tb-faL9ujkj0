/* 入力の部品。値は開いているチケットの入力値(v)に、パスで結び付ける */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { currentDoc, getAt, setUI, setValue, useStore } from "../state/store";

type Path = (string | number)[];

/* 次に表示される入力欄のうち、この id のものにフォーカスする */
let pendingFocus: string | null = null;
export const focusLater = (id: string) => { pendingFocus = id; };

export function useV() {
  return useStore(s => currentDoc(s)?.v) || {};
}
export function useVAt(path: Path) {
  return useStore(s => getAt(currentDoc(s)?.v, path));
}

/* 内容に合わせて高さが伸びる入力欄。Enter は改行 */
export function AutoText({ id, value, onChange, placeholder, label, onKeyDown, className }: {
  id: string; value: string; onChange: (s: string) => void; placeholder?: string; label?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = ref.current; if (!t) return;
    t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px";
  }, [value]);
  useEffect(() => {
    if (pendingFocus === id && ref.current) { ref.current.focus(); pendingFocus = null; }
  }, [id]);
  return (
    <textarea ref={ref} id={id} rows={1} value={value} placeholder={placeholder} aria-label={label}
      className={className} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown} />
  );
}

/* 入力値の1項目に結び付いた、見出し付きの入力欄 */
export function Field({ path, label, ph }: { path: Path; label: string; ph?: string }) {
  const val = useVAt(path);
  const id = "f_" + path.join("_");
  return (
    <div className="node">
      <label htmlFor={id}>{label}</label>
      <AutoText id={id} value={typeof val === "string" ? val : ""} placeholder={ph} onChange={s => setValue(path, s)} />
    </div>
  );
}

/* 選択肢。multi は複数選択、それ以外は単一選択(もう一度押すと解除) */
export function Chips({ path, label, options, multi }: { path: Path; label: string; options: string[]; multi?: boolean }) {
  const cur = useVAt(path);
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map(opt => {
        const on = multi ? (Array.isArray(cur) ? cur : []).includes(opt) : cur === opt;
        const click = () => {
          if (multi) {
            const set = new Set<string>(Array.isArray(cur) ? cur : []);
            set.has(opt) ? set.delete(opt) : set.add(opt);
            setValue(path, options.filter(o => set.has(o)), false);
          } else setValue(path, cur === opt ? "" : opt, false);
        };
        return <button key={opt} type="button" className="chip" aria-pressed={on} onClick={click}>{opt}</button>;
      })}
    </div>
  );
}

/* 「その他」欄。記入があるか、開いた場合だけ入力欄を出す */
export function EtcField({ id }: { id: string }) {
  const val = useVAt([id]);
  const open = useStore(s => s.ui.openEtc.includes(id));
  if ((typeof val === "string" && val.trim()) || open) return <Field path={[id]} label="その他" ph="上の項目に当てはまらない条件や例外" />;
  return (
    <button type="button" className="etc-btn" onClick={() => {
      focusLater("f_" + id);
      setUI(ui => ({ openEtc: ui.openEtc.concat(id) }));
    }}>＋ その他を書く</button>
  );
}

/* 開閉ボタン。状態は collapsed に持つ */
export function useCollapsed(key: string) {
  return useStore(s => s.ui.collapsed.includes(key));
}
export function Toggle({ k, label }: { k: string; label: string }) {
  const closed = useCollapsed(k);
  return (
    <button type="button" className="tog" aria-expanded={!closed} aria-label={label + (closed ? "を開く" : "を閉じる")}
      onClick={() => setUI(ui => ({ collapsed: closed ? ui.collapsed.filter(x => x !== k) : ui.collapsed.concat(k) }))}>
      {closed ? "▸" : "▾"}
    </button>
  );
}

/* 子の階層。深さに応じて7色を循環させ、縦線と＋ボタンに同じ色を付ける */
const LEVELS = ["#1E3A8A", "#8A6234", "#0B1B3A", "#4F6DAE", "#6B4F2E", "#51607F", "#7A705F"];
const Depth = createContext(0);
export function Kids({ children }: { children: ReactNode }) {
  const d = useContext(Depth) + 1;
  return (
    <Depth.Provider value={d}>
      <div className="kids" style={{ "--lv": LEVELS[d % LEVELS.length] } as CSSProperties}>{children}</div>
    </Depth.Provider>
  );
}
