/* チケット・切り分けの受け渡し(ファイルへの書き出しと、読み込み)。読み込みは足すだけで、今の内容は消さない。
   同じもの(同じID)があれば、1件ずつ「上書き」か「別に追加」を選ぶ */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { conflictsOf, mergePack, packText, parsePack, type Choice, type Pack } from "../state/share";
import { getState, newId, toast, update } from "../state/store";
import { titleOf } from "../utils";

const pad = (n: number) => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); };

/* 書き出す。name はファイル名(拡張子なし) */
export function exportPack(docIds: string[], featureIds: string[], name: string) {
  const text = packText(getState().data, docIds, featureIds);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = (name || "チケット").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60) + "_" + today() + ".json";
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function apply(pack: Pack, choices: Record<string, Choice>) {
  let r = { docs: 0, features: 0 };
  update(d => { r = mergePack(d, pack, choices, newId); });
  const what = [r.docs && "チケット" + r.docs + "件", r.features && "切り分け" + r.features + "件"].filter(Boolean).join("・");
  toast(what + "を読み込みました", true);
}

/* 読み込むボタン。同じものがあれば、選ぶ画面を出す */
export function ImportButton({ className = "plain small-btn" }: { className?: string }) {
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ pack: Pack; conflicts: { id: string; label: string }[] } | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const pack = parsePack(await f.text());
      const c = conflictsOf(getState().data, pack);
      const conflicts = [
        ...c.features.map(x => ({ id: x.id, label: "切り分け「" + (x.name.trim() || "(名前なし)") + "」" })),
        ...c.docs.map(x => ({ id: x.id, label: "チケット「" + (titleOf(x.v) || "(タイトルなし)") + "」" }))
      ];
      if (!conflicts.length) apply(pack, {});
      else { setChoices(Object.fromEntries(conflicts.map(x => [x.id, "copy" as Choice]))); setPending({ pack, conflicts }); }
    } catch (e) {
      toast("読み込めませんでした：" + (e instanceof Error ? e.message : String(e)));
    } finally { if (file.current) file.current.value = ""; }
  };
  const all = (c: Choice) => setChoices(Object.fromEntries((pending?.conflicts || []).map(x => [x.id, c])));
  return <>
    <button type="button" className={className} onClick={() => file.current?.click()}>読み込む</button>
    <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => onFile(e.target.files?.[0])} />
    {/* 一覧の中に置くと右の欄の下に隠れるので、ページの最上位に出す */}
    {pending && createPortal(
      <div className="modal-back" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setPending(null); }}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
          <h2 id="import-title">同じものがあります</h2>
          <p className="hint">読み込むファイルに、すでにあるものと同じチケット・切り分けが入っています。1件ずつ、上書きするか、別に追加するかを選んでください。ほかのものは、そのまま追加します。</p>
          <div className="chips">
            <button type="button" className="plain small-btn" onClick={() => all("overwrite")}>すべて上書き</button>
            <button type="button" className="plain small-btn" onClick={() => all("copy")}>すべて別に追加</button>
          </div>
          <ul className="conflicts">
            {pending.conflicts.map(x => (
              <li key={x.id}>
                <span className="t">{x.label}</span>
                <div className="chips" role="group" aria-label={x.label + "の扱い"}>
                  {([["overwrite", "上書き"], ["copy", "別に追加"]] as const).map(([c, l]) => (
                    <button key={c} type="button" className="chip" aria-pressed={choices[x.id] === c} onClick={() => setChoices({ ...choices, [x.id]: c })}>{l}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button type="button" className="primary" onClick={() => { apply(pending.pack, choices); setPending(null); }}>読み込む</button>
            <button type="button" className="plain" onClick={() => setPending(null)}>やめる</button>
          </div>
        </div>
      </div>,
      document.body
    )}
  </>;
}
