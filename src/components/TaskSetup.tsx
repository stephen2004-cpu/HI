import { ListTodo, ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import { plannedTask, timingOf, type Task } from '../tasks';
import { duration } from '../engine';
export function Checklist({
  task,
  change,
}: {
  task: Omit<Task, 'id'>;
  change: (p: Partial<Task>) => void;
}) {
  const steps = task.checklist ?? [];
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
      {steps.map((s, i) => (
        <div key={s.id} className="checklist-row">
          <input
            type="checkbox"
            aria-label={`Hoàn thành bước ${i + 1}`}
            checked={s.done}
            onChange={(e) =>
              change({
                checklist: steps.map((x) =>
                  x.id === s.id ? { ...x, done: e.target.checked } : x,
                ),
              })
            }
          />
          <input
            aria-label={`Nội dung bước ${i + 1}`}
            value={s.text}
            maxLength={500}
            onChange={(e) =>
              change({
                checklist: steps.map((x) =>
                  x.id === s.id ? { ...x, text: e.target.value } : x,
                ),
              })
            }
          />
          <button
            type="button"
            aria-label={`Đưa bước ${i + 1} lên`}
            disabled={i === 0}
            onClick={() => {
              const next = [...steps];
              [next[i - 1], next[i]] = [next[i], next[i - 1]];
              change({ checklist: next });
            }}
          >
            <ArrowUp size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Đưa bước ${i + 1} xuống`}
            disabled={i === steps.length - 1}
            onClick={() => {
              const next = [...steps];
              [next[i + 1], next[i]] = [next[i], next[i + 1]];
              change({ checklist: next });
            }}
          >
            <ArrowDown size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Xóa bước ${i + 1}`}
            onClick={() =>
              change({ checklist: steps.filter((x) => x.id !== s.id) })
            }
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        className="button outline"
        type="button"
        onClick={() =>
          change({
            checklist: [
              ...steps,
              { id: crypto.randomUUID(), text: '', done: false },
            ],
          })
        }
      >
        <Plus size={17} aria-hidden="true" />
        Thêm bước
      </button>
    </fieldset>
  );
}
export default function TaskSetup({
  task,
  change,
}: {
  task: Omit<Task, 'id'>;
  change: (p: Partial<Task>) => void;
}) {
  const timing = timingOf(task as Task),
    plan = plannedTask(task as Task);
  return (
    <div className="task-setup">
      <label>
        Expected Output — Kết quả cần đạt
        <textarea
          value={task.expectedOutput ?? ''}
          maxLength={4000}
          onChange={(e) => change({ expectedOutput: e.target.value })}
        />
      </label>
      <label>
        Trạng thái
        <select
          value={task.completed ? 'done' : (task.status ?? 'todo')}
          onChange={(e) =>
            change({
              status: e.target.value as Task['status'],
              completed: e.target.value === 'done',
            })
          }
        >
          <option value="todo">Chưa làm</option>
          <option value="doing">Đang làm</option>
          <option value="done">Hoàn thành</option>
        </select>
      </label>
      <label>
        Chế độ Timer
        <select
          value={timing.mode}
          onChange={(e) =>
            change({
              timing: { ...timing, mode: e.target.value as 'timer' | 'study' },
            })
          }
        >
          <option value="timer">Countdown</option>
          <option value="study">Study Mode</option>
        </select>
      </label>
      <label>
        Phút mỗi phiên Focus
        <input
          type="number"
          min={1 / 60}
          max={1440}
          step="any"
          required
          value={timing.focusMinutes}
          onChange={(e) =>
            change({
              timing: { ...timing, focusMinutes: Number(e.target.value) },
            })
          }
        />
      </label>
      {timing.mode === 'study' && (
        <>
          <label>
            Số phiên Focus
            <input
              type="number"
              min={1}
              max={25}
              required
              value={timing.focusCount}
              onChange={(e) =>
                change({
                  timing: { ...timing, focusCount: Number(e.target.value) },
                })
              }
            />
          </label>
          <label>
            Phút nghỉ giữa các phiên
            <input
              type="number"
              min={0}
              max={1440}
              step="any"
              required
              value={timing.breakMinutes}
              onChange={(e) =>
                change({
                  timing: { ...timing, breakMinutes: Number(e.target.value) },
                })
              }
            />
          </label>
        </>
      )}
      <label>
        Ngày giờ dự kiến
        <input
          type="datetime-local"
          value={task.plannedStart ?? ''}
          onChange={(e) => change({ plannedStart: e.target.value })}
        />
      </label>
      <p>
        Planned Focus: {duration(plan.focus)} · Planned Break:{' '}
        {duration(plan.rest)} · Calendar cần: {duration(plan.total)}. Ngày giờ
        dự kiến dùng làm gợi ý khi lên lịch, không tự tạo block.
      </p>
      <Checklist task={task} change={change} />
    </div>
  );
}
