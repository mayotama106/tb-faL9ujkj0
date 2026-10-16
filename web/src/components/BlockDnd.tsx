/* 部品のドラッグ。チケット全体で1つのドラッグ領域を持ち、入れ子の中・外へも移せる。
   部品の上に落とすと、その前(上半分)か後(下半分)に入る。部品の並びの末尾(追加ボタンの所)に落とすと、その並びの最後に入る */
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragMoveEvent, type Modifier
} from "@dnd-kit/core";
import { createContext, useContext, useState, type ReactNode } from "react";
import { isInside, type Path, type Spot } from "../domain/moveBlock";

interface Target { id: string; after: boolean }
interface Data { path: Path; index: number; end?: boolean }
const Ctx = createContext<{ dragging: boolean; target: Target | null } | null>(null);
export const useBlockDnd = () => useContext(Ctx);

const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });
const dataOf = (x: { data: { current?: unknown } }) => x.data.current as Data | undefined;
export const endId = (path: Path) => "end:" + JSON.stringify(path);

/* 指の下にある落とし先のうち、いちばん小さいもの(いちばん内側)を選ぶ。自分自身と自分の中は除く */
const collision: CollisionDetection = args => {
  const a = dataOf(args.active);
  const ok = args.droppableContainers.filter(c => {
    const d = dataOf(c);
    return c.id !== args.active.id && !(a && d && isInside(a, d.path));
  });
  const hits = pointerWithin({ ...args, droppableContainers: ok });
  if (hits.length) {
    const area = (id: string | number) => { const r = args.droppableRects.get(id); return r ? r.width * r.height : Infinity; };
    return [...hits].sort((x, y) => area(x.id) - area(y.id)).slice(0, 1);
  }
  return closestCenter({ ...args, droppableContainers: ok });
};

function targetOf(e: DragMoveEvent): { target: Target; to: Spot } | null {
  const over = e.over, d = over && dataOf(over);
  if (!over || !d) return null;
  if (d.end) return { target: { id: String(over.id), after: true }, to: { path: d.path, index: Number.MAX_SAFE_INTEGER } };
  const ev = e.activatorEvent as PointerEvent;
  const tr = e.active.rect.current.translated;
  const y = typeof ev.clientY === "number" ? ev.clientY + e.delta.y : tr ? tr.top + tr.height / 2 : 0;
  const after = y > over.rect.top + over.rect.height / 2;
  return { target: { id: String(over.id), after }, to: { path: d.path, index: d.index + (after ? 1 : 0) } };
}

export function BlockDnd({ onMove, children }: { onMove: (from: Spot, to: Spot) => void; children: ReactNode }) {
  const [dragging, setDragging] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );
  const onMoveEvt = (e: DragMoveEvent) => {
    const t = targetOf(e)?.target || null;
    setTarget(p => (p?.id === t?.id && p?.after === t?.after ? p : t));
  };
  const end = (e: DragEndEvent) => {
    const r = targetOf(e), a = dataOf(e.active);
    setDragging(false); setTarget(null);
    if (r && a) onMove({ path: a.path, index: a.index }, r.to);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={collision} modifiers={[vertical]}
      onDragStart={() => setDragging(true)} onDragMove={onMoveEvt} onDragOver={onMoveEvt} onDragEnd={end}
      onDragCancel={() => { setDragging(false); setTarget(null); }}>
      <Ctx.Provider value={{ dragging, target }}>{children}</Ctx.Provider>
    </DndContext>
  );
}

/* ドラッグできる部品。handle をつまみとして渡す */
export function DndBlock({ id, path, index, children }: { id: string; path: Path; index: number; children: (handle: ReactNode) => ReactNode }) {
  const ctx = useContext(Ctx);
  const data: Data = { path, index };
  const drag = useDraggable({ id, data });
  const drop = useDroppable({ id, data });
  const t = ctx?.target?.id === id ? (ctx.target.after ? " drop-after" : " drop-before") : "";
  const style = drag.transform
    ? { transform: `translate3d(0, ${drag.transform.y}px, 0)`, zIndex: 5, position: "relative" as const }
    : { position: "relative" as const };
  const handle = (
    <button type="button" className="grip" ref={drag.setActivatorNodeRef} {...drag.attributes} {...drag.listeners}
      aria-label="ドラッグして移動(入れ子の中・外へも移せる)" title="ドラッグして移動(入れ子の中・外へも移せる)">⋮⋮</button>
  );
  return (
    <div ref={n => { drag.setNodeRef(n); drop.setNodeRef(n); }} style={style}
      className={"sortable" + (drag.isDragging ? " dragging" : "") + t}>{children(handle)}</div>
  );
}

/* 部品の並びの末尾の落とし先(追加ボタンの所を使う) */
export function DropEnd({ path, children }: { path: Path; children: ReactNode }) {
  const ctx = useContext(Ctx);
  const id = endId(path);
  const { setNodeRef } = useDroppable({ id, data: { path, index: 0, end: true } satisfies Data });
  const hit = ctx?.target?.id === id;
  return (
    <div ref={setNodeRef} className={"drop-end" + (ctx?.dragging ? " on" : "") + (hit ? " hit" : "")}>
      {hit && <div className="drop-label">ここ(この並びの最後)に移す</div>}
      {children}
    </div>
  );
}
