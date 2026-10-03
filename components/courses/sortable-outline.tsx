import type { ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { OutlineRowProps } from './course-outline'

export function EmptyChapterDrop({ sectionId }: { sectionId: string }) {
  const { setNodeRef, isOver } = useSortable({ id: sectionId, disabled: { draggable: true } })
  return <p ref={setNodeRef} className="c-outline-empty" style={{ minHeight: 72, borderRadius: 12, background: isOver ? '#f5f5f7' : undefined }}>Drop a lesson here, or add one.</p>
}

export function SortableLessonRow({
  lesson,
  className,
  children,
}: OutlineRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id })
  return (
    <div
      ref={setNodeRef}
      className={`${className} c-sortable-row ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="c-lesson-grip"
        aria-label={`Reorder ${lesson.title}`}
        title="Drag to reorder · Space then arrow keys"
      >
        <GripVertical size={14} />
      </button>
      {children}
    </div>
  )
}

export function SortableOutline({
  ids,
  onMove,
  children,
}: {
  ids: string[]
  onMove: (lessonId: string, targetId: string) => void
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  return (
    <DndContext
      id="course-lessons"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id)
          onMove(String(active.id), String(over.id))
      }}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}
