import { useRef, useState, useEffect } from 'react';
import { ListTodo, GripVertical, Trash2, Plus } from 'lucide-react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../tasks';
import {
  reorderChecklist,
  type ChecklistStep,
  type StepDocument,
} from '../checklist';
import StepMaterials from './StepMaterials';
type ChecklistTask = Omit<Task, 'id'> & { id?: string };
function Step({
  step,
  index,
  reduced,
  patch,
  remove,
  documents,
  savedTask,
  draftOnly,
  move,
}: {
  step: ChecklistStep;
  index: number;
  reduced: boolean;
  savedTask: boolean;
  draftOnly: boolean;
  move: (delta: number) => void;
  patch: (patch: Partial<ChecklistStep>) => void;
  remove: () => void;
  documents: (update: (docs: StepDocument[]) => StepDocument[]) => boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: step.id,
    transition: reduced ? null : { duration: 180, easing: 'ease' },
  });
  return (
    <div
      ref={setNodeRef}
      className={`checklist-step ${isDragging ? 'checklist-dragging' : ''}`}
      data-step-id={step.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="checklist-row">
        <button
          type="button"
          className="checklist-grip"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          onTouchStartCapture={(e) =>
            e.currentTarget.focus({ preventScroll: true })
          }
          aria-label={`Kéo sắp xếp bước ${index + 1}`}
          onKeyDownCapture={(e) => {
            if (e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) {
              e.preventDefault();
              e.stopPropagation();
              move(e.key === 'ArrowUp' ? -1 : 1);
            }
          }}
          title="Kéo để sắp xếp. Bàn phím: Alt + mũi tên lên/xuống; hoặc Space, mũi tên, Space. Esc để hủy."
        >
          <GripVertical size={17} aria-hidden="true" />
        </button>
        <input
          type="checkbox"
          aria-label={`Hoàn thành bước ${index + 1}`}
          checked={step.done}
          onChange={(e) => patch({ done: e.target.checked })}
        />
        <input
          aria-label={`Nội dung bước ${index + 1}`}
          value={step.text}
          maxLength={500}
          onChange={(e) => patch({ text: e.target.value })}
        />
        <button
          type="button"
          aria-label={`Xóa bước ${index + 1}`}
          onClick={remove}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
      <StepMaterials
        documents={step.documents ?? []}
        update={documents}
        savedTask={savedTask}
        draftOnly={draftOnly}
      />
    </div>
  );
}
export default function Checklist({
  task,
  change,
  draftOnly = false,
}: {
  task: ChecklistTask;
  draftOnly?: boolean;
  change: (patch: Partial<Task>, persist?: boolean) => boolean | void;
}) {
  const steps = task.checklist ?? [];
  const latest = useRef({ steps, change });
  latest.current = { steps, change };
  const [error, setError] = useState('');
  const [moveNotice, setMoveNotice] = useState('');
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      scrollBehavior: 'auto',
    }),
  );
  const save = (next: ChecklistStep[], persist = false) => {
    const ok = latest.current.change({ checklist: next }, persist) !== false;
    setError(
      ok
        ? ''
        : 'Không lưu được Checklist. Thứ tự và nội dung trước đó vẫn được giữ.',
    );
    return ok;
  };
  const updateStep = (
    id: string,
    update: (s: ChecklistStep) => ChecklistStep,
    persist = false,
  ) => {
    if (!latest.current.steps.some((s) => s.id === id)) return false;
    return save(
      latest.current.steps.map((s) => (s.id === id ? update(s) : s)),
      persist,
    );
  };
  return (
    <fieldset className="checklist">
      <legend>
        <span className="checklist-title">
          <span className="workspace-icon">
            <ListTodo size={20} />
          </span>
          Các bước cần thực hiện
        </span>
      </legend>
      <div className="checklist-progress">
        <span>
          {steps.filter((s) => s.done).length}/{steps.length} hoàn thành
        </span>
        <progress
          aria-label="Tiến độ checklist"
          value={steps.filter((s) => s.done).length}
          max={steps.length || 1}
        />
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'Nhấn Space hoặc Enter để nhấc bước. Dùng mũi tên lên xuống để di chuyển. Nhấn Space hoặc Enter để lưu; Escape để hủy. Hoặc dùng Alt cộng mũi tên lên/xuống để chuyển một vị trí và lưu ngay.',
          },
          announcements: {
            onDragStart: () => 'Đã nhấc bước. Dùng mũi tên để đổi vị trí.',
            onDragOver: ({ over }) =>
              over
                ? `Vị trí ${latest.current.steps.findIndex((s) => s.id === over.id) + 1}.`
                : 'Ngoài danh sách.',
            onDragEnd: ({ over }) =>
              over
                ? 'Đã thả bước; kiểm tra thông báo nếu lưu thất bại.'
                : 'Đã hủy sắp xếp.',
            onDragCancel: () => 'Đã hủy; giữ nguyên thứ tự.',
          },
        }}
        onDragEnd={({ active, over }) => {
          if (over && active.id !== over.id)
            save(
              reorderChecklist(
                latest.current.steps,
                String(active.id),
                String(over.id),
              ),
              true,
            );
        }}
      >
        <SortableContext
          items={steps.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {steps.map((step, index) => (
            <Step
              key={step.id}
              step={step}
              index={index}
              reduced={reduced}
              savedTask={!!task.id}
              draftOnly={draftOnly}
              move={(delta) => {
                const index = latest.current.steps.findIndex(
                  (s) => s.id === step.id,
                );
                const next = latest.current.steps[index + delta];
                if (
                  next &&
                  save(
                    reorderChecklist(latest.current.steps, step.id, next.id),
                    true,
                  )
                ) {
                  setMoveNotice(
                    `Đã chuyển bước sang vị trí ${index + delta + 1}.`,
                  );
                }
              }}
              patch={(patch) =>
                updateStep(step.id, (s) => ({ ...s, ...patch }))
              }
              remove={() =>
                save(latest.current.steps.filter((s) => s.id !== step.id))
              }
              documents={(update) =>
                updateStep(
                  step.id,
                  (s) => ({
                    ...s,
                    documents: update(s.documents ?? []),
                  }),
                  true,
                )
              }
            />
          ))}
        </SortableContext>
      </DndContext>
      {error && <p role="alert">{error}</p>}
      <span className="checklist-sr-status" role="status">
        {moveNotice}
      </span>
      <button
        className="button outline"
        type="button"
        onClick={() =>
          save([
            ...latest.current.steps,
            { id: crypto.randomUUID(), text: '', done: false },
          ])
        }
      >
        <Plus size={17} aria-hidden="true" />
        Thêm bước
      </button>
    </fieldset>
  );
}
