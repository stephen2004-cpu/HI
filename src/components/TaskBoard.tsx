import { taskDeletionIssue, taskSeriesDeletionIssue } from '../taskDeletion';
import TaskScopeChoice from './TaskScopeChoice';
import {
  scheduleOf,
  hasTaskStart,
  repeatDraft,
  scheduleTaskRepeats,
  persistTaskCalendar,
} from '../taskScheduling';
import { loadPlanner } from '../planner';
import TaskSetup from './TaskSetup';
import TaskRepeatEditor from './TaskRepeatEditor';
import { supabase } from '../supabase';
import { workspaceUser } from '../workspaceStorage';
import {
  defaultTaskRepeat,
  futureTaskEffectiveDate,
  createTaskRepeat,
  editFutureTaskRepeat,
  editAllTaskRepeat,
  deleteTaskRepeat,
  repeatSettings,
  type TaskRepeatSettings,
  type TaskEditScope,
} from '../taskRecurrence';
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
  readTaskStore,
  writeTaskStore,
  taskProtectedIds,
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
  editorOnly?: boolean;
  initialDraft?: Partial<Omit<Task, 'id'>>;
  onSaved?: (message: string) => void;
  onCancel?: () => void;
  planner: Planner;
  visibleBlocks: TimeBlock[];
  habits: Habit[];
  onRange: (from: Date, to: Date) => void;
  scheduleTask: (taskId: string, date: string) => void;
  plannerError: boolean;
};
export default function TaskBoard({
  editorOnly = false,
  initialDraft,
  onSaved,
  onCancel,
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
  const [draft, setDraft] = useState(() => ({ ...empty, ...initialDraft }));
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<TaskRepeatSettings>(() => ({
    ...defaultTaskRepeat(),
    ...(initialDraft?.plannedStart
      ? { startDate: initialDraft.plannedStart.slice(0, 10) }
      : {}),
  }));
  const [editScope, setEditScope] = useState<TaskEditScope>('single');
  const [saveChoice, setSaveChoice] = useState(false);
  const [groupChoice, setGroupChoice] = useState<{
    id: string;
    group: Group;
  } | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [period, setPeriod] = useState<TaskPeriod>('day');
  const [date, setDate] = useState(() => localDate(new Date()));
  const [status, setStatus] = useState<TaskStatusFilter>('all');
  const [collapsed, setCollapsed] = useState<Partial<Record<Group, boolean>>>(
    {},
  );
  const form = useRef<HTMLFormElement>(null);
  const editBaseline = useRef<Task | null>(null);
  const mounted = useRef(true),
    deleteRequest = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      deleteRequest.current++;
    };
  }, []);
  const editingTask = readTaskStore().tasks.find((t) => t.id === editing);
  const editingSeries = editingTask?.repeatSeriesId
    ? readTaskStore().tasks.find((t) => t.id === editingTask.repeatSeriesId)
    : undefined;
  const range = taskRange(date, period);
  const habitToken = JSON.stringify(habits);
  useEffect(() => {
    const refresh = () => {
      const latest = readTasks();
      if (!latest.error) setTasks(latest.tasks);
    };
    window.addEventListener('lbd-tasks-updated', refresh);
    window.addEventListener('lbd-habits-updated', refresh);
    return () => {
      window.removeEventListener('lbd-tasks-updated', refresh);
      window.removeEventListener('lbd-habits-updated', refresh);
    };
  }, []);
  useEffect(() => {
    if (!editorOnly) onRange(range.from, range.to);
  }, [editorOnly, +range.from, +range.to, habitToken]);
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
  useEffect(() => {
    setSaveChoice(false);
    setGroupChoice(null);
  }, [editing]);
  const saveTask = (selectedScope: TaskEditScope) => {
    if (!draft.title.trim()) return;
    const stored = readTaskStore();
    if (stored.error) {
      setError('Không đọc được dữ liệu Task. Chưa thay đổi dữ liệu.');
      return;
    }
    const original = stored.tasks.find((t) => t.id === editing);
    if (editing && (!original || original.deletedAt !== undefined)) {
      setError('Task đã xóa hoặc thay đổi trên thiết bị khác. Chưa lưu.');
      return;
    }
    const task: Task = {
      ...draft,
      timing: draft.timing ?? timingOf(),
      title: draft.title.trim(),
      id: editing ?? crypto.randomUUID(),
    };
    try {
      if (repeat.mode === 'weekly' || original?.repeatSeriesId)
        task.repeatSchedule = scheduleOf(task);
      let next: Task[];
      let createdDate: string | undefined;
      if (original?.repeatSeriesId) {
        if (
          stored.tasks.find((t) => t.id === original.repeatSeriesId)
            ?.deletedAt !== undefined
        )
          throw Error('Chuỗi Task đã xóa trên thiết bị khác. Chưa lưu.');
        if (selectedScope === 'all') {
          const before = editBaseline.current ?? {
            ...repeatDraft(original),
            timing: original.timing ?? timingOf(),
            repeatSchedule: scheduleOf(original),
          };
          next = editAllTaskRepeat(
            stored.tasks,
            original,
            task,
            repeat,
            taskProtectedIds(),
            before,
          );
        } else if (selectedScope === 'future')
          next = editFutureTaskRepeat(
            stored.tasks,
            original,
            task,
            repeat,
            taskProtectedIds(),
          );
        else
          next = stored.tasks.map((t) =>
            t.id === editing ? { ...task, repeatOverride: true } : t,
          );
      } else if (repeat.mode === 'weekly') {
        const { root, instance } = createTaskRepeat(task, repeat);
        createdDate = instance.repeatDate;
        next = [
          ...stored.tasks.filter((t) => t.id !== task.id),
          root,
          instance,
        ];
      } else
        next = editing
          ? stored.tasks.map((t) => (t.id === editing ? task : t))
          : [...stored.tasks, task];
      const latestPlanner = loadPlanner();
      if (latestPlanner.error)
        throw Error('Không đọc được Calendar. Chưa lưu Task.');
      const scheduled = scheduleTaskRepeats(
        next,
        latestPlanner.data,
        range.from,
        range.to,
        taskProtectedIds(),
        new Date(),
        task.id,
      );
      next = scheduled.tasks;
      if (!persistTaskCalendar(next, scheduled.planner))
        throw Error(
          'Không lưu được Task. Nội dung nhập được giữ lại để thử lại.',
        );
      setTasks(readTasks().tasks);
      setError('');
      const savedNotice = `Đã lưu Task. ${scheduled.added ? `Đã lên lịch ${scheduled.added} lần. ` : ''}${scheduled.updated ? `Đã cập nhật ${scheduled.updated} lịch tương lai. ` : ''}${scheduled.conflicts ? `Cảnh báo: ${scheduled.conflicts} lần trùng lịch; các block khác được giữ nguyên. ` : ''}${!hasTaskStart(task) && !task.repeatSchedule ? 'Chọn ngày giờ dự kiến để tự tạo Time Block. Task chưa có giờ vẫn được giữ trong danh sách chưa lên lịch.' : ''}`;
      setNotice(savedNotice);
      setEditing(null);
      setDraft(empty);
      setRepeat(defaultTaskRepeat());
      setEditScope('single');
      setSaveChoice(false);
      if (createdDate) setDate(createdDate);
      else if (!editing && hasTaskStart(task))
        setDate(task.plannedStart!.slice(0, 10));
      if (!editing) {
        setStatus('all');
        setCollapsed((previous) => ({ ...previous, [task.group]: false }));
      }
      onRange(range.from, range.to);
      onSaved?.(savedNotice);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được Task.');
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (editingTask?.repeatSeriesId && editScope !== 'future')
      setSaveChoice(true);
    else saveTask(editScope);
  };
  const applyGroup = (selectedScope: 'single' | 'all') => {
    if (!groupChoice) return;
    try {
      const stored = readTaskStore(),
        currentPlanner = loadPlanner();
      const current = stored.tasks.find((t) => t.id === groupChoice.id);
      if (
        stored.error ||
        currentPlanner.error ||
        !current ||
        current.deletedAt !== undefined
      )
        throw Error('Không đọc được dữ liệu mới nhất. Chưa thay đổi Task.');
      let next: Task[];
      if (selectedScope === 'all') {
        const root = stored.tasks.find((t) => t.id === current.repeatSeriesId);
        next = editAllTaskRepeat(
          stored.tasks,
          current,
          { ...current, group: groupChoice.group },
          repeatSettings(root, current.repeatDate),
          taskProtectedIds(),
        );
      } else
        next = stored.tasks.map((t) =>
          t.id === current.id
            ? { ...t, group: groupChoice.group, repeatOverride: true }
            : t,
        );
      const scheduled = scheduleTaskRepeats(
        next,
        currentPlanner.data,
        range.from,
        range.to,
        taskProtectedIds(),
      );
      if (!persistTaskCalendar(scheduled.tasks, scheduled.planner))
        throw Error('Không lưu được thay đổi. Dữ liệu cũ được giữ.');
      setTasks(readTasks().tasks);
      setGroupChoice(null);
      if (editing === current.id)
        setDraft((previous) => ({ ...previous, group: groupChoice.group }));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được Task.');
    }
  };
  const deleteRunning = useRef(false);
  const removeTask = async (
    t: Task,
    selectedScope: 'single' | 'all' = 'single',
  ) => {
    if (deleteRunning.current) return;
    deleteRunning.current = true;
    setDeleteError('');
    const scope = workspaceUser(),
      request = ++deleteRequest.current;
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 12000);
    setDeleteBusy(true);
    try {
      if (t.repeatSeriesId && scope) {
        const result = await supabase
          ?.rpc(
            selectedScope === 'all'
              ? 'lbd_task_series_deletion_capabilities'
              : 'lbd_task_repeat_capabilities',
          )
          .abortSignal(controller.signal);
        if (
          !mounted.current ||
          workspaceUser() !== scope ||
          request !== deleteRequest.current
        )
          return;
        const issue = controller.signal.aborted
          ? 'Máy chủ phản hồi quá lâu. Chưa xóa Task; dữ liệu vẫn được giữ. Hãy thử lại.'
          : !result
            ? 'Chưa cấu hình kết nối Supabase. Chưa xóa Task; dữ liệu vẫn được giữ.'
            : selectedScope === 'all'
              ? taskSeriesDeletionIssue(result)
              : taskDeletionIssue(result);
        if (issue) {
          setDeleteError(issue);
          return;
        }
      }
      if (
        !mounted.current ||
        workspaceUser() !== scope ||
        request !== deleteRequest.current
      )
        return;
      const latest = readTaskStore();
      if (latest.error) throw Error('Không đọc được Task mới nhất. Chưa xóa.');
      const next = t.repeatSeriesId
        ? deleteTaskRepeat(latest.tasks, t, selectedScope)
        : latest.tasks.filter((x) => x.id !== t.id);
      const currentPlanner = loadPlanner();
      if (currentPlanner.error) throw Error('Không đọc được lịch. Chưa xóa.');
      const scheduled = scheduleTaskRepeats(
        next,
        currentPlanner.data,
        range.from,
        range.to,
        taskProtectedIds(),
      );
      if (!persistTaskCalendar(scheduled.tasks, scheduled.planner))
        throw Error('Không lưu được thao tác xóa. Dữ liệu cũ được giữ.');
      setTasks(readTasks().tasks);
      setDeleting(null);
      setNotice(
        t.repeatSeriesId
          ? scope
            ? `Đã ghi dấu xóa ${selectedScope === 'all' ? 'toàn bộ chuỗi' : 'lần'} Task; chờ đồng bộ máy chủ.`
            : `Đã xóa ${selectedScope === 'all' ? 'toàn bộ chuỗi' : 'lần'} Task trên thiết bị và giữ dấu xóa chống tạo lại.`
          : 'Đã xóa Task.',
      );
      if (
        editing === t.id ||
        (selectedScope === 'all' && editingSeries?.id === t.repeatSeriesId)
      ) {
        setEditing(null);
        setDraft(empty);
        setRepeat(defaultTaskRepeat());
      }
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Không xóa được Task.');
    } finally {
      clearTimeout(timeout);
      deleteRunning.current = false;
      if (mounted.current && request === deleteRequest.current)
        setDeleteBusy(false);
    }
  };
  const deletionChoice = (t: Task) =>
    t.repeatSeriesId ? (
      <TaskScopeChoice
        name="Xác nhận xóa Task"
        description={`Bạn muốn xóa lần ngày ${t.repeatDate} hay toàn bộ chuỗi “${t.title}”? Các Time Block liên quan sẽ được gỡ khỏi lịch.`}
        busy={deleteBusy}
        error={deleteError}
        onSingle={() => void removeTask(t, 'single')}
        onAll={() => void removeTask(t, 'all')}
        onCancel={() => {
          deleteRequest.current++;
          setDeleting(null);
          setDeleteError('');
        }}
      />
    ) : null;
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
            disabled={loaded.error || deleteBusy}
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
          {t.repeatSeriesId && (
            <span className="task-repeat-badge">Task lặp · {t.repeatDate}</span>
          )}
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
            disabled={loaded.error || deleteBusy}
            onChange={(e) =>
              t.repeatSeriesId
                ? setGroupChoice({ id: t.id, group: e.target.value as Group })
                : commit(moveTask(tasks, t.id, e.target.value as Group))
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
            disabled={loaded.error || deleteBusy}
            onClick={() => {
              setDeleteError('');
              setDeleting(null);
              setSaveChoice(false);
              setGroupChoice(null);
              setEditing(t.id);
              setDraft(repeatDraft(t));
              editBaseline.current = {
                ...repeatDraft(t),
                timing: t.timing ?? timingOf(),
                repeatSchedule: scheduleOf(t),
              };
              const root = readTaskStore().tasks.find(
                (x) => x.id === t.repeatSeriesId,
              );
              setRepeat(repeatSettings(root, t.repeatDate));
              setEditScope('single');
              showForm();
            }}
          >
            Sửa
          </button>
          <button
            className="button"
            disabled={loaded.error || deleteBusy}
            onClick={() => {
              deleteRequest.current++;
              setDeleting(t.id);
              setDeleteError('');
              if (editing === t.id) showForm();
            }}
          >
            Xóa
          </button>
          <button
            className="button outline"
            disabled={loaded.error || plannerError}
            onClick={() =>
              scheduleTask(
                t.id,
                (t.repeatDate ?? date) < localDate(new Date())
                  ? localDate(new Date())
                  : (t.repeatDate ?? date),
              )
            }
          >
            {row.overdue ? 'Lên lịch lại' : 'Mở Calendar'}
          </button>
        </div>
        {groupChoice?.id === t.id && (
          <TaskScopeChoice
            name="Phạm vi chuyển nhóm Task lặp"
            description="Chuyển nhóm cho riêng lần này hay toàn bộ chuỗi lặp?"
            onSingle={() => applyGroup('single')}
            onAll={() => applyGroup('all')}
            onCancel={() => setGroupChoice(null)}
          />
        )}
        {deleting === t.id &&
          (editing !== t.id || !t.repeatSeriesId) &&
          (t.repeatSeriesId ? (
            deletionChoice(t)
          ) : (
            <div role="group" aria-label="Xác nhận xóa Task">
              <p>
                {t.repeatSeriesId
                  ? 'Xóa riêng lần Task này? Dấu xóa được giữ để không tạo lại ngày này; các lần khác vẫn tiếp tục.'
                  : 'Xóa công việc này?'}
              </p>
              {deleteError && <p role="alert">{deleteError}</p>}
              <button
                className="button"
                disabled={deleteBusy}
                onClick={async () => {
                  await removeTask(t);
                }}
              >
                Xác nhận xóa
              </button>
              <button
                className="button"
                disabled={deleteBusy}
                onClick={() => {
                  deleteRequest.current++;
                  setDeleting(null);
                }}
              >
                Hủy xóa
              </button>
            </div>
          ))}
      </article>
    );
  };
  return (
    <section
      className="task-board"
      aria-labelledby={editorOnly ? undefined : 'tasks-title'}
      aria-label={editorOnly ? 'Thiết lập Task' : undefined}
    >
      {editorOnly && error && <p role="alert">{error}</p>}
      {!editorOnly && (
        <>
          <h2 id="tasks-title">Task & Ma trận Eisenhower</h2>
          <p>
            Kéo công việc giữa các nhóm hoặc dùng mục “Nhóm ưu tiên”. Màu riêng
            chỉ đổi màu thẻ.
          </p>
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}

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
                  onChange={(e) =>
                    setStatus(e.target.value as TaskStatusFilter)
                  }
                >
                  <option value="all">Tất cả</option>
                  <option value="pending">Chưa hoàn thành</option>
                  <option value="done">Đã hoàn thành</option>
                </select>
              </label>
            </div>
            <button
              className="button primary"
              disabled={deleteBusy}
              onClick={() => {
                setDeleteError('');
                setDeleting(null);
                setEditing(null);
                setDraft(empty);
                setRepeat(defaultTaskRepeat());
                setEditScope('single');
                setSaveChoice(false);
                setGroupChoice(null);
                showForm();
              }}
            >
              Tạo Task
            </button>
          </div>
          <div className="task-period-heading">
            <h3>
              {range.from.toLocaleDateString('vi-VN')} –{' '}
              {new Date(+range.to - 1).toLocaleDateString('vi-VN')}
            </h3>
            <p role="status">
              Đang hiển thị {shown.length}/{periodRows.length} Task trong khoảng
              · {periodRows.filter((row) => row.task.completed).length} đã hoàn
              thành
            </p>
            <p className="muted">
              Một thẻ cho mỗi Task. Nhiều Time Block được gộp trên thẻ; tuần từ
              Thứ Hai đến Chủ nhật.
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
                    if (id) {
                      const moving = tasks.find((t) => t.id === id);
                      if (moving?.repeatSeriesId)
                        setGroupChoice({ id, group: g.id });
                      else commit(moveTask(tasks, id, g.id));
                    }
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
                      <span aria-hidden="true">
                        {collapsed[g.id] ? '＋' : '−'}
                      </span>
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
              So với ngày hôm nay. Lịch cũ được giữ nguyên; bạn chủ động chọn
              giờ mới.
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
              Chưa có ngày thực hiện, tách riêng khỏi 4 nhóm của khoảng đang
              xem.
            </p>
            <div className="task-backlog-grid">{unscheduled.map(taskCard)}</div>
            {!unscheduled.length && (
              <p className="task-empty">Không có Task chưa lên lịch phù hợp.</p>
            )}
          </section>
        </>
      )}
      <h3 className="task-editor-heading">
        {editing ? 'Chỉnh sửa Task' : 'Tạo Task mới'}
      </h3>
      <form ref={form} onSubmit={submit} className="task-form">
        <label>
          Tên công việc
          <input
            autoFocus={editorOnly}
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
        {!draft.habitId && (
          <TaskRepeatEditor
            settings={repeat}
            change={setRepeat}
            series={editingSeries}
            effectiveDate={
              editingTask?.repeatSeriesId
                ? futureTaskEffectiveDate(editingTask, taskProtectedIds())
                : undefined
            }
            scope={editScope}
            setScope={(scope) => {
              setEditScope(scope);
              setRepeat(
                repeatSettings(
                  editingSeries,
                  scope === 'future' && editingTask
                    ? futureTaskEffectiveDate(editingTask, taskProtectedIds())
                    : editingTask?.repeatDate,
                ),
              );
            }}
            instanceDate={(draft as Task).repeatDate}
          />
        )}
        <TaskSetup
          key={editing ?? 'new-task'}
          autoSchedule
          editableEnd={editorOnly}
          recurring={repeat.mode === 'weekly' || !!editingTask?.repeatSeriesId}
          task={{ ...draft, id: editing ?? undefined }}
          change={(patch) =>
            setDraft((previous) => ({ ...previous, ...patch }))
          }
          draftChecklist={!!editingTask?.repeatSeriesId}
          changeChecklist={
            editing && !editingTask?.repeatSeriesId
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
        {saveChoice && editingTask?.repeatSeriesId && (
          <TaskScopeChoice
            name="Phạm vi lưu Task lặp"
            description={`Áp dụng những thay đổi này cho lần ngày ${editingTask.repeatDate} hay toàn bộ chuỗi lặp? Lịch đã chỉnh tay và thời gian của các phiên đã làm được giữ nguyên.`}
            onSingle={() => {
              setSaveChoice(false);
              saveTask('single');
            }}
            onAll={() => {
              setSaveChoice(false);
              saveTask('all');
            }}
            onCancel={() => setSaveChoice(false)}
          />
        )}
        <button
          className="button primary"
          disabled={loaded.error || deleteBusy || (editorOnly && plannerError)}
        >
          {editing || editorOnly ? 'Lưu Task' : 'Thêm Task'}
        </button>
        {editorOnly && (
          <button type="button" className="button" onClick={onCancel}>
            Hủy
          </button>
        )}
        {editingTask && (
          <button
            type="button"
            className="button danger"
            disabled={loaded.error || deleteBusy}
            onClick={() => {
              setSaveChoice(false);
              if (editingTask.repeatSeriesId) {
                setDeleting(editingTask.id);
                setDeleteError('');
              } else {
                setDeleting(null);
                void removeTask(editingTask);
              }
            }}
          >
            {deleteBusy ? 'Đang xóa…' : 'Xóa vĩnh viễn'}
          </button>
        )}
        {editingTask &&
          deleting === editingTask.id &&
          deletionChoice(editingTask)}
        {editing && deleteError && !deleting && (
          <p role="alert">{deleteError}</p>
        )}
        {editing && (
          <button
            type="button"
            className="button"
            disabled={deleteBusy}
            onClick={() => {
              setDeleteError('');
              setEditing(null);
              setDraft(empty);
              setRepeat(defaultTaskRepeat());
              setEditScope('single');
            }}
          >
            Hủy sửa
          </button>
        )}
      </form>
    </section>
  );
}
