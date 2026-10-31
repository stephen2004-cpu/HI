import { plannedTask, timingOf, type Task, type ChecklistStep } from '../tasks';
import { duration } from '../engine';
import Checklist from './Checklist';
export { default as Checklist } from './Checklist';
export default function TaskSetup({
  task,
  change,
  changeChecklist,
}: {
  task: Omit<Task, 'id'> & { id?: string };
  change: (p: Partial<Task>) => void;
  changeChecklist?: (steps: ChecklistStep[]) => boolean;
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
      <Checklist
        key={task.id ?? 'new-task'}
        task={task}
        change={(patch, persist) => {
          if (
            persist &&
            patch.checklist &&
            changeChecklist &&
            !changeChecklist(patch.checklist)
          )
            return false;
          change(patch);
          return true;
        }}
      />
    </div>
  );
}
