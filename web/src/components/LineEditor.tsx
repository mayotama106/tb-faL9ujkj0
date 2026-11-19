/* 部品の中身のエディタ。Markdown を書かずに、見出し・箇条書き・番号付きを見た目どおりに1行ずつ編集する。
   ショートカット: Ctrl+Alt+1〜4 見出し1〜4、Ctrl+Alt+0 本文、Ctrl+Shift+8 箇条書き、Ctrl+Shift+7 番号付き、
   Tab / Shift+Tab 字下げ、Enter 次の行(同じ種類)、空の行で Enter / Backspace は字下げを戻す。Mac は Ctrl の代わりに Command も使える */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { HEADS, isList, numbers, parseLines, toMarkdown, type Line, type LineKind } from "../domain/lines";

const MAX_LEVEL = 4;
const KIND_LABEL: Record<LineKind, string> = { h1: "見出し1", h2: "見出し2", h3: "見出し3", h4: "見出し4", bullet: "箇条書き", num: "番号付き", text: "本文", table: "表" };

export function LineEditor({ id, value, onChange, label }: { id: string; value: string; onChange: (md: string) => void; label: string }) {
  const [lines, setLines] = useState<Line[]>(() => withOne(parseLines(value)));
  const [raw, setRaw] = useState(false);
  const [cur, setCur] = useState(0);
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focus = useRef<{ i: number; at: number; end?: number } | null>(null);
  /* 外(元に戻すなど)で中身が変わったら読み直す */
  useEffect(() => {
    if (toMarkdown(lines) !== value.replace(/\s+$/, "")) setLines(withOne(parseLines(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  useLayoutEffect(() => {
    refs.current.forEach(t => { if (t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; } });
    const f = focus.current;
    if (f && refs.current[f.i]) { const t = refs.current[f.i]!; t.focus(); t.setSelectionRange(f.at, f.end ?? f.at); focus.current = null; }
  });
  const commit = (next: Line[], f?: { i: number; at: number; end?: number }) => {
    if (f) { focus.current = f; setCur(f.i); }
    setLines(next);
    onChange(toMarkdown(next));
  };
  const set = (i: number, patch: Partial<Line>, at?: number) =>
    commit(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)), at == null ? undefined : { i, at });
  const caret = (i: number) => refs.current[i]?.selectionStart ?? 0;

  /* 行の種類を切り替える。同じ種類なら本文に戻す */
  const toggle = (i: number, kind: LineKind) => {
    const l = lines[i];
    set(i, { kind: l.kind === kind ? "text" : kind, level: isList(kind) && isList(l.kind) ? l.level : 0 }, caret(i));
  };
  const indent = (i: number, d: number) => {
    const l = lines[i];
    if (!isList(l.kind)) { if (d > 0) set(i, { kind: "bullet", level: 0 }, caret(i)); return; }
    if (l.level + d < 0) { set(i, { kind: "text", level: 0 }, caret(i)); return; }
    set(i, { level: Math.min(MAX_LEVEL, l.level + d) }, caret(i));
  };
  const insertHole = (i: number) => {
    const t = refs.current[i]; const l = lines[i];
    const a = t ? t.selectionStart : l.text.length, b = t ? t.selectionEnd : a;
    const inner = l.text.slice(a, b) || "〇〇";
    /* 中の文字を選んだ状態にする(そのまま打てば置き換わる) */
    commit(lines.map((x, j) => (j === i ? { ...x, text: l.text.slice(0, a) + "【" + inner + "】" + l.text.slice(b) } : x)), { i, at: a + 1, end: a + 1 + inner.length });
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLTextAreaElement>) => {
    const l = lines[i], t = e.currentTarget;
    const mod = e.ctrlKey || e.metaKey;
    const digit = /^Digit(\d)$/.exec(e.code);
    if (mod && e.altKey && digit) {
      const n = Number(digit[1]);
      if (n >= 1 && n <= 4) { e.preventDefault(); toggle(i, HEADS[n - 1]); return; }
      if (n === 0) { e.preventDefault(); set(i, { kind: "text", level: 0 }, caret(i)); return; }
    }
    if (mod && e.shiftKey && !e.altKey && (e.code === "Digit8" || e.code === "Digit7")) {
      e.preventDefault(); toggle(i, e.code === "Digit8" ? "bullet" : "num"); return;
    }
    if (e.key === "Tab") { e.preventDefault(); indent(i, e.shiftKey ? -1 : 1); return; }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      /* 空の箇条書きで Enter は、字下げを戻す(最後は本文) */
      if (isList(l.kind) && !l.text) { indent(i, -1); return; }
      let a = t.selectionStart, b = t.selectionEnd;
      /* 埋める所の中で Enter したら、】の後ろで改行する */
      if (a === b && l.text[a] === "】") { a++; b++; }
      const next = lines.slice();
      if (a === 0 && b === 0 && l.text) {
        /* 行の頭で Enter は、上に空の行を入れる */
        next.splice(i, 0, { kind: isList(l.kind) ? l.kind : "text", level: l.level, text: "" });
      } else {
        /* 見出しの次は本文、ほかは同じ種類で続ける */
        next.splice(i, 1, { ...l, text: l.text.slice(0, a) }, { kind: l.kind.startsWith("h") ? "text" : l.kind, level: l.level, text: l.text.slice(b) });
      }
      commit(next, { i: i + 1, at: 0 });
      return;
    }
    if (e.key === "Backspace" && t.selectionStart === 0 && t.selectionEnd === 0) {
      if (l.kind !== "text") { e.preventDefault(); if (isList(l.kind) && l.level > 0) indent(i, -1); else set(i, { kind: "text", level: 0 }, 0); return; }
      if (i > 0) {
        e.preventDefault();
        const prev = lines[i - 1];
        const next = lines.slice();
        next.splice(i - 1, 2, { ...prev, text: prev.text + l.text });
        commit(next, { i: i - 1, at: prev.text.length });
      }
      return;
    }
    if (e.key === "ArrowUp" && i > 0 && t.selectionStart === 0) { e.preventDefault(); focus.current = { i: i - 1, at: lines[i - 1].text.length }; setCur(i - 1); setLines(lines.slice()); return; }
    if (e.key === "ArrowDown" && i < lines.length - 1 && t.selectionEnd === l.text.length) { e.preventDefault(); focus.current = { i: i + 1, at: 0 }; setCur(i + 1); setLines(lines.slice()); }
  };

  const nums = numbers(lines);
  const c = Math.min(cur, lines.length - 1);
  const tool = (label: string, title: string, run: () => void, on = false) => (
    <button type="button" className={"le-btn" + (on ? " on" : "")} title={title} aria-pressed={on}
      onMouseDown={e => e.preventDefault()} onClick={run}>{label}</button>
  );
  return (
    <div className="le" id={id}>
      <div className="le-bar" role="toolbar" aria-label={label + "の書式"}>
        {!raw && <>
          {tool("本文", "本文 (Ctrl+Alt+0)", () => set(c, { kind: "text", level: 0 }, caret(c)), lines[c]?.kind === "text")}
          {HEADS.map((h, n) => <span key={h}>{tool("見出し" + (n + 1), "見出し" + (n + 1) + " (Ctrl+Alt+" + (n + 1) + ")", () => toggle(c, h), lines[c]?.kind === h)}</span>)}
          {tool("・ 箇条書き", "箇条書き (Ctrl+Shift+8)", () => toggle(c, "bullet"), lines[c]?.kind === "bullet")}
          {tool("1. 番号付き", "番号付き (Ctrl+Shift+7)", () => toggle(c, "num"), lines[c]?.kind === "num")}
          {tool("← 字下げ", "字下げを戻す (Shift+Tab)", () => indent(c, -1))}
          {tool("字下げ →", "字下げ (Tab)", () => indent(c, 1))}
          {tool("【】埋める所", "選んだ文字を【】で囲む", () => insertHole(c))}
        </>}
        <span className="spacer" />
        {tool(raw ? "エディタで編集" : "Markdownで編集", raw ? "見た目どおりに編集する" : "Markdownの文字のまま編集する(表など)", () => {
          if (raw) setLines(withOne(parseLines(value)));
          setRaw(!raw);
        })}
      </div>
      {raw
        ? <RawText value={value} onChange={onChange} label={label} />
        : <div className="le-lines" role="group" aria-label={label}>
          {lines.map((l, i) => (
            <div key={i} className={"le-line k-" + l.kind} style={{ paddingLeft: (isList(l.kind) ? l.level * 22 + 22 : 0) + "px" }}>
              {isList(l.kind) && <span className="le-mark" aria-hidden="true">{l.kind === "num" ? nums[i] + "." : l.level % 2 ? "◦" : "•"}</span>}
              <textarea ref={el => { refs.current[i] = el; }} rows={1} value={l.text} spellCheck={false}
                aria-label={label + " " + (i + 1) + "行目（" + KIND_LABEL[l.kind] + "）"}
                placeholder={i === 0 && lines.length === 1 ? "ここに書きます。見出しは Ctrl+Alt+1〜4、箇条書きは Ctrl+Shift+8" : ""}
                onFocus={() => setCur(i)}
                onChange={e => set(i, { text: e.target.value.replace(/\n/g, " ") })}
                onKeyDown={e => onKey(i, e)} />
            </div>
          ))}
        </div>}
      <p className="le-help">Ctrl+Alt+1〜4 見出し／Ctrl+Alt+0 本文／Ctrl+Shift+8 箇条書き／Ctrl+Shift+7 番号付き／Tab・Shift+Tab 字下げ</p>
    </div>
  );
}

const withOne = (ls: Line[]): Line[] => (ls.length ? ls : [{ kind: "text", level: 0, text: "" }]);

function RawText({ value, onChange, label }: { value: string; onChange: (s: string) => void; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { const t = ref.current; if (t) { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; } }, [value]);
  return <textarea ref={ref} className="mono le-raw" value={value} aria-label={label + "（Markdown）"} onChange={e => onChange(e.target.value)} />;
}
