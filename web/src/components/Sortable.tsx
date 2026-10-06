/* ドラッグで並べ替えられる縦の一覧。つまみ(⋮⋮)を持って動かす。キーボードでも動かせる
   (つまみにフォーカスして Space で持ち上げ、↑↓ で動かし、Space で置く) */
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent, type Modifier
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

export function SortableList({ ids, onMove, children }: {
  ids: string[];
  onMove: (from: number, to: number) => void;
  children: (id: string, index: number, handle: ReactNode) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id)), to = ids.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0) onMove(from, to);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[vertical]} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map((id, i) => <Item key={id} id={id}>{handle => children(id, i, handle)}</Item>)}
      </SortableContext>
    </DndContext>
  );
}

function Item({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 5 : undefined, position: "relative" as const };
  const handle = (
    <button type="button" className="grip" ref={setActivatorNodeRef} {...attributes} {...listeners}
      aria-label="ドラッグして並べ替え" title="ドラッグして並べ替え">⋮⋮</button>
  );
  return <div ref={setNodeRef} style={style} className={isDragging ? "sortable dragging" : "sortable"}>{children(handle)}</div>;
}

/* 配列の要素を from から to へ移す */
export function move<T>(arr: T[], from: number, to: number) {
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
}
