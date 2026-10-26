import { useRef, useState, useEffect } from 'react';
import { groups, plannedTask, type Task } from '../tasks';
import {
  addDays,
  blockColor,
  dateInput,
  dayStart,
  layoutDay,
  weekStart,
  type Planner,
  type TimeBlock,
} from '../planner';
type Props = {
  tasks: Task[];
  initialDate?: string;
  onRange?: (from: Date, to: Date) => void;
  recurrenceToken?: string;
  planner: Planner;
  update: (p: Planner) => boolean;
  focusTask: (id: string, blockId?: string) => void;
  locked: boolean;
};
const shortDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
export default function Calendar({
  tasks,
  initialDate,
  onRange,
  recurrenceToken,
  planner,
  update,
  focusTask,
  locked,
}: Props) {
  const [miniOpen, setMiniOpen] = useState(() => window.innerWidth > 800);
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [date, setDate] = useState(
    dayStart(initialDate ? new Date(`${initialDate}T12:00:00`) : new Date()),
  );
  const [draft, setDraft] = useState<TimeBlock | null>(null);
  const [error, setError] = useState('');
  const [resizing, setResizing] = useState(false);
  const resize = useRef<{
    id: string;
    y: number;
    end: number;
    start: number;
  } | null>(null);
  const [resizeEnd, setResizeEnd] = useState<number | null>(null);
  const first = weekStart(date, planner.preferences.weekStart);
  const days =
    view === 'day'
      ? [date]
      : Array.from({ length: 7 }, (_, i) => addDays(first, i));
  const monthFirst = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthDays = Array.from({ length: 42 }, (_, i) =>
    addDays(weekStart(monthFirst, planner.preferences.weekStart), i),
  );
  const rangeStart = view === 'month' ? monthDays[0] : days[0],
    rangeEnd = addDays(
      view === 'month' ? monthDays[41] : days[days.length - 1],
      1,
    );
  useEffect(() => {
    onRange?.(rangeStart, rangeEnd);
  }, [+rangeStart, +rangeEnd, recurrenceToken]);
  const changeDate = (n: number) =>
    setDate(
      view === 'month'
        ? new Date(date.getFullYear(), date.getMonth() + n, 1)
        : addDays(date, n * (view === 'week' ? 7 : 1)),
    );
  const newBlock = (
    taskId = tasks.find((t) => !t.completed)?.id ?? '',
    start?: number,
  ) => {
    setError('');
    const task = tasks.find((t) => t.id === taskId);
    start ??= task?.plannedStart
      ? new Date(task.plannedStart).getTime()
      : new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          9,
        ).getTime();
    setDraft({
      id: crypto.randomUUID(),
      taskId,
      title: task?.title || '',
      start,
      end:
        start +
        (task?.timing
          ? plannedTask(task).total * 1000
          : planner.preferences.blockMinutes * 60000),
      color: '',
    });
  };
  const persist = (blocks: TimeBlock[]) => {
    const ok = update({ ...planner, blocks });
    if (!ok) setError('Không lưu được lịch. Dữ liệu nhập vẫn được giữ lại.');
    return ok;
  };
  const drop = (e: React.DragEvent, day: Date) => {
    e.preventDefault();
    const target = e.currentTarget.getBoundingClientRect();
    const minutes = Math.max(
      0,
      Math.min(1425, Math.floor((e.clientY - target.top) / 15) * 15),
    );
    const start = new Date(day);
    start.setMinutes(minutes);
    const blockId = e.dataTransfer.getData('application/lbd-block');
    const block = planner.blocks.find((b) => b.id === blockId);
    if (block)
      persist(
        planner.blocks.map((b) =>
          b.id === block.id
            ? { ...b, start: +start, end: +start + (b.end - b.start) }
            : b,
        ),
      );
    else {
      const id = e.dataTransfer.getData('application/lbd-task');
      if (tasks.some((t) => t.id === id)) {
        const t = tasks.find((t) => t.id === id)!;
        persist([
          ...planner.blocks,
          {
            id: crypto.randomUUID(),
            taskId: id,
            title: t.title,
            start: +start,
            end:
              +start +
              (t.timing
                ? plannedTask(t).total * 1000
                : planner.preferences.blockMinutes * 60000),
            color: '',
          },
        ]);
      }
    }
  };
  const mini = (
    <div className="mini-month">
      <strong>
        {date.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
      </strong>
      <div className="mini-days">
        {Array.from({ length: 7 }, (_, i) => (
          <small key={i}>
            {
              ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][
                (i + planner.preferences.weekStart) % 7
              ]
            }
          </small>
        ))}
        {monthDays.map((d) => (
          <button
            key={+d}
            className={`${d.getMonth() !== date.getMonth() ? 'muted' : ''} ${+d === +date ? 'chosen' : ''}`}
            aria-label={`Chọn ngày ${shortDate(d)}`}
            onClick={() => setDate(d)}
          >
            {d.getDate()}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <section className="calendar-screen" aria-label="Lịch công việc">
      <aside className="calendar-sidebar">
        <details
          className="mini-container"
          open={miniOpen}
          onToggle={(e) => setMiniOpen(e.currentTarget.open)}
        >
          <summary>Lịch tháng nhỏ</summary>
          {mini}
        </details>
        <div
          className="calendar-priorities"
          aria-label="Nhóm ưu tiên Eisenhower"
        >
          {groups.map((g) => (
            <span key={g.id}>
              <i style={{ background: g.color }} />
              {g.name}
            </span>
          ))}
        </div>
        <h3>Task chưa lên lịch</h3>
        <p className="muted">Kéo vào lịch hoặc bấm để nhập giờ.</p>
        {tasks
          .filter(
            (t) =>
              !t.completed && !planner.blocks.some((b) => b.taskId === t.id),
          )
          .map((t) => (
            <button
              key={t.id}
              className="unscheduled-task"
              draggable={!locked}
              onDragStart={(e) =>
                e.dataTransfer.setData('application/lbd-task', t.id)
              }
              onClick={() => newBlock(t.id)}
            >
              {t.title}
              <span>＋</span>
            </button>
          ))}
        <button
          className="button outline"
          disabled={locked || !tasks.length}
          onClick={() => newBlock()}
        >
          Lên lịch Task
        </button>
      </aside>
      <div className="calendar-main">
        {planner.blocks.some((a, i) =>
          planner.blocks.some(
            (b, j) => j > i && a.start < b.end && b.start < a.end,
          ),
        ) && (
          <p role="status" className="schedule-warning">
            Có Time Block trùng giờ. Bạn có thể giữ lịch hoặc bấm ✎ để điều
            chỉnh.
          </p>
        )}
        <div className="calendar-toolbar">
          <div>
            <div className="eyebrow">KHÔNG GIAN THỜI GIAN</div>
            <h1>Lịch của bạn</h1>
            <p>
              {view === 'week'
                ? `${shortDate(first)} – ${shortDate(addDays(first, 6))}`
                : date.toLocaleDateString('vi-VN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
            </p>
          </div>
          <div className="calendar-controls">
            <button
              className="button"
              aria-label="Khoảng trước"
              onClick={() => changeDate(-1)}
            >
              ←
            </button>
            <button
              className="button"
              onClick={() => setDate(dayStart(new Date()))}
            >
              Hôm nay
            </button>
            <button
              className="button"
              aria-label="Khoảng sau"
              onClick={() => changeDate(1)}
            >
              →
            </button>
            <label>
              Chế độ lịch
              <select
                value={view}
                onChange={(e) => setView(e.target.value as typeof view)}
              >
                <option value="day">Ngày</option>
                <option value="week">Tuần</option>
                <option value="month">Tháng</option>
              </select>
            </label>
            <button
              className="button primary"
              disabled={locked || !tasks.length}
              onClick={() => newBlock()}
            >
              ＋ Time Block
            </button>
          </div>
        </div>
        {error && !draft && <p role="alert">{error}</p>}
        {!tasks.length && (
          <p className="empty-hint">
            Tạo công việc ở màn hình Task để bắt đầu lên lịch.
          </p>
        )}
        {view === 'month' ? (
          <div className="month-grid">
            {monthDays.map((d) => (
              <section
                key={+d}
                className={d.getMonth() !== date.getMonth() ? 'muted' : ''}
              >
                <button
                  className="month-date"
                  onClick={() => {
                    setDate(d);
                    setView('day');
                  }}
                >
                  {shortDate(d)}
                </button>
                {planner.blocks
                  .filter((b) => b.start < +addDays(d, 1) && b.end > +d)
                  .map((b) => (
                    <button
                      className="month-block"
                      key={b.id}
                      style={{ borderLeftColor: blockColor(b, tasks) }}
                      onClick={() => {
                        focusTask(b.taskId, b.id);
                      }}
                    >
                      {tasks.find((t) => t.id === b.taskId)?.title || b.title} ·{' '}
                      {new Date(b.start).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </button>
                  ))}
              </section>
            ))}
          </div>
        ) : (
          <div className="calendar-scroll">
            <div
              className={`time-calendar ${view === 'day' ? 'single-day' : ''}`}
              style={{
                gridTemplateColumns: `52px repeat(${days.length}, minmax(100px, 1fr))`,
              }}
            >
              <div className="day-heading">Giờ</div>
              {days.map((d) => (
                <div
                  className={`day-heading ${+d === +dayStart(new Date()) ? 'today' : ''}`}
                  key={+d}
                >
                  {d.toLocaleDateString('vi-VN', { weekday: 'short' })}
                  <strong>{shortDate(d)}</strong>
                </div>
              ))}
              <div className="hours-axis">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h}>{String(h).padStart(2, '0')}:00</div>
                ))}
              </div>
              {days.map((d) => (
                <div
                  key={+d}
                  className="day-column"
                  aria-label={`Lịch ${shortDate(d)}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => !locked && drop(e, d)}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <button
                      key={h}
                      className="hour-slot"
                      aria-label={`Lên lịch ${shortDate(d)} ${h}:00`}
                      disabled={locked || !tasks.length}
                      onClick={() => {
                        const start = new Date(d);
                        start.setHours(h);
                        newBlock(undefined, +start);
                      }}
                    />
                  ))}
                  {layoutDay(planner.blocks, d).map(
                    ({ block: b, top, height, lane, lanes }) => (
                      <div
                        key={b.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Time Block ${tasks.find((t) => t.id === b.taskId)?.title || b.title}`}
                        className="time-block"
                        style={{
                          top,
                          height,
                          width: `calc(${100 / lanes}% - 4px)`,
                          left: `calc(${(lane * 100) / lanes}% + 2px)`,
                          background: blockColor(b, tasks),
                        }}
                        draggable={!locked && !resizing}
                        onDragStart={(e) =>
                          e.dataTransfer.setData('application/lbd-block', b.id)
                        }
                        onClick={() => {
                          focusTask(b.taskId, b.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            focusTask(b.taskId, b.id);
                          }
                        }}
                      >
                        <button
                          className="edit-block"
                          aria-label={`Sửa lịch ${b.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDraft({ ...b });
                            setError('');
                          }}
                        >
                          ✎
                        </button>
                        <span
                          className="priority-tag"
                          style={{
                            background: groups.find(
                              (g) =>
                                g.id ===
                                tasks.find((t) => t.id === b.taskId)?.group,
                            )?.color,
                          }}
                        >
                          {groups.find(
                            (g) =>
                              g.id ===
                              tasks.find((t) => t.id === b.taskId)?.group,
                          )?.name || 'Task đã xóa'}
                        </span>
                        <strong>
                          {tasks.find((t) => t.id === b.taskId)?.title ||
                            b.title}
                        </strong>
                        <small>
                          {new Date(b.start).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          –{' '}
                          {new Date(b.end).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </small>
                        <button
                          className="resize-handle"
                          aria-label={`Đổi thời lượng ${b.title}`}
                          disabled={locked}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            resize.current = {
                              id: b.id,
                              y: e.clientY,
                              end: b.end,
                              start: b.start,
                            };
                            setResizing(true);
                            setResizeEnd(b.end);
                          }}
                          onPointerMove={(e) => {
                            const r = resize.current;
                            if (r)
                              setResizeEnd(
                                Math.max(
                                  r.start + 900000,
                                  r.end +
                                    Math.round((e.clientY - r.y) / 15) * 900000,
                                ),
                              );
                          }}
                          onPointerUp={(e) => {
                            e.stopPropagation();
                            const r = resize.current;
                            if (r && resizeEnd)
                              persist(
                                planner.blocks.map((x) =>
                                  x.id === r.id ? { ...x, end: resizeEnd } : x,
                                ),
                              );
                            resize.current = null;
                            setResizeEnd(null);
                            setResizing(false);
                          }}
                          onPointerCancel={() => {
                            resize.current = null;
                            setResizeEnd(null);
                            setResizing(false);
                          }}
                        >
                          ═
                        </button>
                      </div>
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {resizing && resizeEnd && (
          <p role="status">
            Kết thúc mới: {dateInput(resizeEnd).replace('T', ' ')}
          </p>
        )}
      </div>
      {draft && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-title"
            className="block-editor"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setDraft(null);
              if (e.key === 'Tab') {
                const els = e.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not(:disabled), input, select',
                );
                const first = els[0],
                  last = els[els.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <h2 id="block-title">Time Block</h2>
            {draft &&
              (draft.end - draft.start) / 1000 <
                plannedTask(tasks.find((t) => t.id === draft.taskId)).total && (
                <p className="schedule-warning">
                  Block ngắn hơn tổng Focus và nghỉ đã thiết lập. Gợi ý tăng giờ
                  kết thúc để đủ{' '}
                  {Math.ceil(
                    plannedTask(tasks.find((t) => t.id === draft.taskId))
                      .total / 60,
                  )}{' '}
                  phút.
                </p>
              )}
            <p>{tasks.find((t) => t.id === draft.taskId)?.notes}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  !Number.isFinite(draft.start) ||
                  !Number.isFinite(draft.end) ||
                  draft.end <= draft.start
                ) {
                  setError('Giờ kết thúc phải sau giờ bắt đầu.');
                  return;
                }
                const title =
                  tasks.find((t) => t.id === draft.taskId)?.title ||
                  draft.title;
                if (
                  persist([
                    ...planner.blocks.filter((b) => b.id !== draft.id),
                    { ...draft, title },
                  ])
                )
                  setDraft(null);
              }}
            >
              <label>
                Task liên kết
                <select
                  autoFocus
                  value={draft.taskId}
                  required
                  onChange={(e) =>
                    setDraft({ ...draft, taskId: e.target.value })
                  }
                >
                  {!tasks.some((t) => t.id === draft.taskId) && (
                    <option value={draft.taskId}>
                      {draft.title || 'Chọn Task'} (đã xóa)
                    </option>
                  )}
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Bắt đầu
                <input
                  type="datetime-local"
                  required
                  value={
                    Number.isFinite(draft.start) ? dateInput(draft.start) : ''
                  }
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      start: new Date(e.target.value).getTime(),
                    })
                  }
                />
              </label>
              <label>
                Kết thúc
                <input
                  type="datetime-local"
                  required
                  value={Number.isFinite(draft.end) ? dateInput(draft.end) : ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      end: new Date(e.target.value).getTime(),
                    })
                  }
                />
              </label>
              <label>
                Màu Time Block
                <input
                  type="color"
                  value={blockColor(draft, tasks)}
                  onChange={(e) =>
                    setDraft({ ...draft, color: e.target.value })
                  }
                />
              </label>
              <button
                type="button"
                className="button"
                onClick={() => setDraft({ ...draft, color: '' })}
              >
                Theo màu Task
              </button>
              {error && <p role="alert">{error}</p>}
              <div className="editor-actions">
                <button className="button primary" disabled={locked}>
                  Lưu Time Block
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => setDraft(null)}
                >
                  Đóng
                </button>
                {planner.blocks.some((b) => b.id === draft.id) && (
                  <button
                    type="button"
                    className="button"
                    disabled={locked}
                    onClick={() => {
                      if (
                        window.confirm('Xóa Time Block này?') &&
                        persist(planner.blocks.filter((b) => b.id !== draft.id))
                      )
                        setDraft(null);
                    }}
                  >
                    Xóa Time Block
                  </button>
                )}
                <button
                  type="button"
                  className="button"
                  disabled={!tasks.some((t) => t.id === draft.taskId)}
                  onClick={() => {
                    focusTask(draft.taskId, draft.id);
                    setDraft(null);
                  }}
                >
                  Mở Focus cho Task
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
