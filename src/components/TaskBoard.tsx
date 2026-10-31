import TaskSetup from './TaskSetup';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Planner, TimeBlock } from '../planner';
import { localDate, validDate, type Habit } from '../habits';
import {
  matchesTaskStatus,
  projectTaskPeriod,
  shiftTaskDate,
  taskRange,
  type TaskPeriod,
  type TaskStatusFilter,
  type TaskRow,
} from '../taskPeriods';
import {
  groups,
  timingOf,
  moveTask,
  readTasks,
  writeTasks,
  type Group,
  type Task,
  type ChecklistStep,
} from '../tasks';
const empty: Omit<Task, 'id'> = {
  title: '',
  notes: '',
  group: 'do' as Group,
  color: '',
  completed: false,
};
type Props = {
  planner: Planner;
  visibleBlocks: TimeBlock[];
  habits: Habit[];
  onRange: (from: Date, to: Date) => void;
  scheduleTask: (taskId: string, date: string) => void;
  plannerError: boolean;
};
export default function TaskBoard({
  planner,
  visibleBlocks,
  habits,
  onRange,
  scheduleTask,
  plannerError,
}: Props) {
  const [loaded] = useState(readTasks);
  const [tasks, setTasks] = useState(loaded.tasks);
  const [error, setError] = useState(
    loaded.error
      ? 'Không đọc được dữ liệu Task. Dữ liệu gốc được giữ nguyên; hãy sao lưu và tải lại trước khi chỉnh sửa.'
      : '',
  );
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [period, setPeriod] = useState<TaskPeriod>('day');
  const [date, setDate] = useState(() => localDate(new Date()));
  const [status, setStatus] = useState<TaskStatusFilter>('all');
  const [collapsed, setCollapsed] = useState<Partial<Record<Group, boolean>>>(
    {},
  );
  const form = useRef<HTMLFormElement>(null);
  const range = taskRange(date, period);
  const habitToken = JSON.stringify(habits);
  useEffect(() => {
    const refresh = () => {
      const latest = readTasks();
      if (!latest.error) setTasks(latest.tasks);
    };
    window.addEventListener('lbd-tasks-updated', refresh);
    return () => window.removeEventListener('lbd-tasks-updated', refresh);
  }, []);
  useEffect(() => {
    onRange(range.from, range.to);
  }, [+range.from, +range.to, habitToken]);
  const rows = projectTaskPeriod(
    tasks,
    visibleBlocks,
    planner.blocks,
    habits,
    range.from,
    range.to,
  );
  const periodRows = rows.filter((row) => row.inRange);
  const shown = periodRows.filter((row) => matchesTaskStatus(row, status));
  const unscheduled = rows.filter(
    (row) => row.unscheduled && matchesTaskStatus(row, status),
  );
  const overdue = rows.filter(
    (row) => row.overdue && !row.inRange && matchesTaskStatus(row, status),
  );
  const overdueInRange = shown.filter((row) => row.overdue).length;
  const showForm = () => {
    form.current?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
    form.current?.querySelector('input')?.focus({ preventScroll: true });
  };
  const dateTime = (value: number) =>
    new Date(value).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  const timeOf = (value: number) =>
    new Date(value).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  const commit = (next: Task[]) => {
    if (loaded.error) return;
    if (!writeTasks(next)) {
      setError(
        'Không lưu được Task. Kiểm tra dung lượng hoặc quyền lưu trữ rồi thử lại.',
      );
      return;
    }
    setTasks(next);
    setError('');
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return;
    const task = {
      ...draft,
      timing: draft.timing ?? timingOf(),
      title: draft.title.trim(),
      id: editing ?? crypto.randomUUID(),
    };
    const next = editing
      ? tasks.map((t) => (t.id === editing ? task : t))
      : [...tasks, task];
    if (!loaded.error && writeTasks(next)) {
      setTasks(next);
      setError('');
      setEditing(null);
      setDraft(empty);
    } else if (!loaded.error)
      setError('Không lưu được Task. Nội dung nhập được giữ lại để thử lại.');
  };
  const taskCard = (row: TaskRow) => {
    const t = row.task;
    return (
      <article
        className={`task-card ${t.completed ? 'task-done' : ''}`}
        key={t.id}
        draggable={!loaded.error}
        style={{
          borderLeftColor:
            t.color || groups.find((g) => g.id === t.group)!.color,
        }}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', t.id);
          e.dataTransfer.effectAllowed = 'move';
          setDragging(t.id);
        }}
        onDragEnd={() => setDragging(null)}
      >
        <label>
          <input
            type="checkbox"
            checked={t.completed}
            disabled={loaded.error}
            onChange={() =>
              commit(
                tasks.map((x) =>
                  x.id === t.id
                    ? {
                        ...x,
                        completed: !x.completed,
                        status: !x.completed
                          ? ('done' as const)
                          : ('todo' as const),
                      }
                    : x,
                ),
              )
            }
          />
          <span>{t.title}</span>
        </label>
        <div className="task-card-meta">
          <span
            className={`task-status-label ${t.completed ? 'complete' : ''}`}
          >
            {t.completed ? '✓ Đã hoàn thành' : 'Chưa hoàn thành'}
          </span>
          <span
            className="task-priority-label"
            style={{ color: groups.find((g) => g.id === t.group)!.color }}
          >
            {groups.find((g) => g.id === t.group)!.name}
          </span>
          {row.overdue && <span className="task-overdue-label">Quá hạn</span>}
          {t.habitId && (
            <span className="task-habit-label">
              Lần thực hiện Habit{t.habitDate ? ` · ${t.habitDate}` : ''}
            </span>
          )}
        </div>
        {t.notes && <p className="task-notes">{t.notes}</p>}
        <div className="task-schedule-summary">
          {row.blocks.length ? (
            <>
              <strong>{row.blocks.length} lần lên lịch trong khoảng</strong>
              {row.blocks.slice(0, 2).map((b) => (
                <small key={b.id}>
                  {dateTime(b.start)} – {timeOf(b.end)}
                  {new Date(b.end).toDateString() !==
                  new Date(b.start).toDateString()
                    ? ` (${new Date(b.end).toLocaleDateString('vi-VN')})`
                    : ''}
                </small>
              ))}
              {row.blocks.length > 2 && (
                <details>
                  <summary>Xem {row.blocks.length - 2} lần còn lại</summary>
                  {row.blocks.slice(2).map((b) => (
                    <small key={b.id}>
                      {dateTime(b.start)} – {dateTime(b.end)}
                    </small>
                  ))}
                </details>
              )}
            </>
          ) : row.fallback !== undefined ? (
            <small>
              {row.fallbackDateOnly
                ? `Ngày thực hiện: ${new Date(row.fallback).toLocaleDateString('vi-VN')}`
                : `Dự kiến: ${dateTime(row.fallback)}`}
            </small>
          ) : row.allBlocks.length ? (
            <small>
              Lịch gần nhất: {dateTime(row.allBlocks.at(-1)!.start)}
            </small>
          ) : (
            <small>Chưa có ngày thực hiện</small>
          )}
        </div>
        <label>
          Chuyển nhóm
          <select
            aria-label={`Nhóm của ${t.title}`}
            value={t.group}
            disabled={loaded.error}
            onChange={(e) =>
              commit(moveTask(tasks, t.id, e.target.value as Group))
            }
          >
            {groups.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </label>
        <div className="task-actions">
          <button
            className="button"
            disabled={loaded.error}
            onClick={() => {
              setEditing(t.id);
              setDraft({ ...t });
              showForm();
            }}
          >
            Sửa
          </button>
          <button
            className="button"
            disabled={loaded.error}
            onClick={() => setDeleting(t.id)}
          >
            Xóa
          </button>
          <button
            className="button outline"
            disabled={loaded.error || plannerError}
            onClick={() =>
              scheduleTask(
                t.id,
                date < localDate(new Date()) ? localDate(new Date()) : date,
              )
            }
          >
            {row.overdue ? 'Lên lịch lại' : 'Mở Calendar'}
          </button>
        </div>
        {deleting === t.id && (
          <div role="group" aria-label="Xác nhận xóa Task">
            <p>Xóa công việc này?</p>
            <button
              className="button"
              onClick={() => {
                commit(tasks.filter((x) => x.id !== t.id));
                setDeleting(null);
                if (editing === t.id) {
                  setEditing(null);
                  setDraft(empty);
                }
              }}
            >
              Xác nhận xóa
            </button>
            <button className="button" onClick={() => setDeleting(null)}>
              Hủy xóa
            </button>
          </div>
        )}
      </article>
    );
  };
  return (
    <section className="task-board" aria-labelledby="tasks-title">
      <h2 id="tasks-title">Task & Ma trận Eisenhower</h2>
      <p>
        Kéo công việc giữa các nhóm hoặc dùng mục “Nhóm ưu tiên”. Màu riêng chỉ
        đổi màu thẻ.
      </p>
      {error && <p role="alert">{error}</p>}

      <div className="task-period-toolbar">
        <div
          className="task-period-tabs"
          role="group"
          aria-label="Khoảng thời gian Task"
        >
          {(
            [
              ['day', 'Ngày'],
              ['week', 'Tuần'],
              ['month', 'Tháng'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="task-period-controls">
          <button
            className="button"
            aria-label="Khoảng Task trước"
            onClick={() => setDate(shiftTaskDate(date, period, -1))}
          >
            ←
          </button>
          <button
            className="button"
            onClick={() => setDate(localDate(new Date()))}
          >
            Hôm nay
          </button>
          <button
            className="button"
            aria-label="Khoảng Task sau"
            onClick={() => setDate(shiftTaskDate(date, period, 1))}
          >
            →
          </button>
          <label>
            Ngày tham chiếu Task
            <input
              type="date"
              required
              value={date}
              onChange={(e) => {
                if (validDate(e.target.value)) setDate(e.target.value);
              }}
            />
          </label>
          <label>
            Trạng thái Task
            <select
              aria-label="Trạng thái Task"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatusFilter)}
            >
              <option value="all">Tất cả</option>
              <option value="pending">Chưa hoàn thành</option>
              <option value="done">Đã hoàn thành</option>
            </select>
          </label>
        </div>
        <button className="button primary" onClick={showForm}>
          Tạo Task
        </button>
      </div>
      <div className="task-period-heading">
        <h3>
          {range.from.toLocaleDateString('vi-VN')} –{' '}
          {new Date(+range.to - 1).toLocaleDateString('vi-VN')}
        </h3>
        <p role="status">
          Đang hiển thị {shown.length}/{periodRows.length} Task trong khoảng ·{' '}
          {periodRows.filter((row) => row.task.completed).length} đã hoàn thành
        </p>
        <p className="muted">
          Một thẻ cho mỗi Task. Nhiều Time Block được gộp trên thẻ; tuần từ Thứ
          Hai đến Chủ nhật.
        </p>
      </div>
      <div className="eisenhower-grid">
        {groups.map((g) => {
          const items = shown.filter((row) => row.task.group === g.id),
            done = items.filter((row) => row.task.completed).length;
          return (
            <section
              key={g.id}
              className="quadrant"
              style={{ borderTopColor: g.color }}
              aria-label={g.name}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain') || dragging;
                if (id) commit(moveTask(tasks, id, g.id));
                setDragging(null);
              }}
            >
              <h3 style={{ color: g.color }}>
                <button
                  className="quadrant-toggle"
                  aria-label={`Thu gọn/mở rộng ${g.name}`}
                  aria-expanded={!collapsed[g.id]}
                  aria-controls={`tasks-${g.id}`}
                  onClick={() =>
                    setCollapsed({ ...collapsed, [g.id]: !collapsed[g.id] })
                  }
                >
                  <span>
                    {g.name} <small>({items.length})</small>
                  </span>
                  <span aria-hidden="true">{collapsed[g.id] ? '＋' : '−'}</span>
                </button>
              </h3>
              <p>{g.description}</p>
              <p className="quadrant-count">
                {done} đã hoàn thành · {items.length - done} chưa hoàn thành
              </p>
              <details>
                <summary aria-label={`Giải thích ${g.name}`}>
                  ⓘ Ý nghĩa và ví dụ
                </summary>
                <p>
                  {g.id === 'do'
                    ? 'Làm trước vì quan trọng và sắp hết hạn.'
                    : g.id === 'schedule'
                      ? 'Dành thời gian trong lịch cho việc quan trọng.'
                      : g.id === 'delegate'
                        ? 'Nhờ người phù hợp hỗ trợ.'
                        : 'Cân nhắc bỏ qua, không tự xóa.'}
                </p>
              </details>
              <div id={`tasks-${g.id}`} hidden={!!collapsed[g.id]}>
                {items.map(taskCard)}
                {!items.length && (
                  <p className="task-empty">Không có Task phù hợp bộ lọc</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <section className="task-backlog" aria-label="Task quá hạn">
        <h3>Task quá hạn ({overdue.length + overdueInRange})</h3>
        <p>
          So với ngày hôm nay. Lịch cũ được giữ nguyên; bạn chủ động chọn giờ
          mới.
        </p>
        {!!overdueInRange && (
          <p>
            {overdueInRange} Task quá hạn đã hiển thị trong 4 nhóm bên trên,
            không lặp lại thẻ.
          </p>
        )}
        <div className="task-backlog-grid">{overdue.map(taskCard)}</div>
        {!overdue.length && !overdueInRange && (
          <p className="task-empty">Không có Task quá hạn phù hợp.</p>
        )}
      </section>
      <section className="task-backlog" aria-label="Task chưa lên lịch">
        <h3>Task chưa lên lịch ({unscheduled.length})</h3>
        <p>
          Chưa có ngày thực hiện, tách riêng khỏi 4 nhóm của khoảng đang xem.
        </p>
        <div className="task-backlog-grid">{unscheduled.map(taskCard)}</div>
        {!unscheduled.length && (
          <p className="task-empty">Không có Task chưa lên lịch phù hợp.</p>
        )}
      </section>
      <h3 className="task-editor-heading">
        {editing ? 'Chỉnh sửa Task' : 'Tạo Task mới'}
      </h3>
      <form ref={form} onSubmit={submit} className="task-form">
        <label>
          Tên công việc
          <input
            required
            maxLength={200}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label>
          Ghi chú
          <textarea
            maxLength={4000}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>
        <label>
          Nhóm ưu tiên
          <select
            value={draft.group}
            onChange={(e) =>
              setDraft({ ...draft, group: e.target.value as Group })
            }
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Màu riêng
          <input
            type="color"
            value={
              draft.color || groups.find((g) => g.id === draft.group)!.color
            }
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          />
        </label>
        <button
          type="button"
          className="button"
          onClick={() => setDraft({ ...draft, color: '' })}
        >
          Dùng màu nhóm
        </button>
        <TaskSetup
          key={editing ?? 'new-task'}
          task={{ ...draft, id: editing ?? undefined }}
          change={(patch) =>
            setDraft((previous) => ({ ...previous, ...patch }))
          }
          changeChecklist={
            editing
              ? (checklist: ChecklistStep[]) => {
                  const latest = readTasks();
                  if (
                    latest.error ||
                    !latest.tasks.some((t) => t.id === editing)
                  ) {
                    setError(
                      'Không đọc được Task để lưu Checklist. Chưa thay đổi dữ liệu.',
                    );
                    return false;
                  }
                  const ok = writeTasks(
                    latest.tasks.map((t) =>
                      t.id === editing ? { ...t, checklist } : t,
                    ),
                  );
                  if (!ok)
                    setError(
                      'Không lưu được Checklist. Kiểm tra dung lượng hoặc quyền lưu trữ.',
                    );
                  return ok;
                }
              : undefined
          }
        />
        <button className="button primary" disabled={loaded.error}>
          {editing ? 'Lưu Task' : 'Thêm Task'}
        </button>
        {editing && (
          <button
            type="button"
            className="button"
            onClick={() => {
              setEditing(null);
              setDraft(empty);
            }}
          >
            Hủy sửa
          </button>
        )}
      </form>
    </section>
  );
}
