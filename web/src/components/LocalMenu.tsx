/* ローカルで使うためのメニュー: アプリ(1ファイル)のダウンロード、データの書き出し・読み込み */
import { useEffect, useRef, useState } from "react";
import { exportData, importData } from "../state/persist";
import { toast } from "../state/store";

/* ローカル版(ダブルクリックで開いた file://)では、アプリのダウンロードは出さない */
const isLocal = typeof location !== "undefined" && location.protocol === "file:";
const pad = (n: number) => String(n).padStart(2, "0");

function save(text: string, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function LocalMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const exportAll = () => {
    const d = new Date();
    save(exportData(), `ticket-builder-data_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`);
    setOpen(false);
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await f.text();
      if (!confirm("今の内容を、このファイルの内容で置き換えます。よろしいですか？(今の内容は控えに残ります)")) return;
      importData(text);
      location.reload();
    } catch (e) {
      toast("読み込めませんでした: " + (e instanceof Error ? e.message : String(e)));
    } finally { if (file.current) file.current.value = ""; }
  };
  return (
    <div className="local-menu" ref={box}>
      <button type="button" className="hbtn" aria-expanded={open} onClick={() => setOpen(!open)} title="ローカルで使う・データの移行">
        ⇩<span className="lbl"> ローカル版・データ</span>
      </button>
      {open && (
        <div className="local-pop" role="menu">
          {!isLocal && <>
            <a className="primary small" role="menuitem" href="./ticket-builder.html" download="ticket-builder.html" onClick={() => setOpen(false)}>アプリをダウンロード</a>
            <p className="hint">1つのHTMLファイルです。ダブルクリックでブラウザで開けます（ネット接続なしで動きます）。</p>
          </>}
          <button type="button" className="plain" role="menuitem" onClick={exportAll}>データを書き出す(.json)</button>
          <button type="button" className="plain" role="menuitem" onClick={() => file.current?.click()}>データを読み込む</button>
          <p className="hint">{isLocal ? "公開版とこのファイルは保存先が別です。公開版で書き出したデータを読み込むと、続きから使えます。" : "公開版とローカル版は保存先が別です。ここで書き出して、ローカル版で読み込むと、続きから使えます。"}</p>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => onFile(e.target.files?.[0])} />
        </div>
      )}
    </div>
  );
}
