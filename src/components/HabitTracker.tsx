import { useState } from 'react';
import {
  Check,
  Moon,
  Plus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Play,
  Pencil,
} from 'lucide-react';
import { addDays, weekStart } from '../planner';
import {
  cycleLog,
  habitProgress,
  loadHabits,
  localDate,
  saveHabits,
  type Habit,
} from '../habits';
const blank: Omit<Habit, 'id' | 'logs'> = {
  name: '',
  category: 'Cá nhân',
  days: [1, 3, 5],
  weeklyTarget: 3,
  minutes: 25,
  archived: false,
};
const weekday = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export default function HabitTracker({
  connect,
}: {
  connect: (h: Habit, date: string, destination: 'calendar' | 'focus') => void;
}) {
  const [loaded] = useState(loadHabits),
    [habits, setHabits] = useState(loaded.habits),
    [error, setError] = useState(
      loaded.error
        ? 'Không đọc được dữ liệu thói quen. Giữ nguyên dữ liệu gốc và tạm khóa chỉnh sửa.'
        : '',
    ),
    [draft, setDraft] = useState(blank),
    [editing, setEditing] = useState<string | null>(null),
    [view, setView] = useState<'week' | 'month'>('week'),
    [date, setDate] = useState(new Date()),
    [showArchived, setShowArchived] = useState(false),
    [occurrence, setOccurrence] = useState(localDate(new Date()));
  const start = weekStart(date, 1),
    days =
      view === 'week'
        ? Array.from({ length: 7 }, (_, i) => addDays(start, i))
        : Array.from(
            {
              length: new Date(
                date.getFullYear(),
                date.getMonth() + 1,
                0,
              ).getDate(),
            },
            (_, i) => new Date(date.getFullYear(), date.getMonth(), i + 1),
          );
  const commit = (next: Habit[]) => {
    if (loaded.error) return false;
    if (!saveHabits(next)) {
      setError(
        'Không lưu được thói quen. Kiểm tra quyền hoặc dung lượng lưu trữ, rồi thử lại.',
      );
      return false;
    }
    setHabits(next);
    setError('');
    return true;
  };
  return (
    <section className="habit-tracker">
      <div className="habit-heading">
        <div>
          <div className="eyebrow">THỰC HIỆN TỪNG NGÀY, TIẾN BỘ TỪNG TUẦN</div>
          <h1>Thói quen của tôi</h1>
          <p>
            Tạo một lần, tự đánh dấu mỗi ngày. Thói quen không phải Task một
            lần.
          </p>
        </div>
        <span className="habit-badge">HABITS</span>
      </div>
      {error && <p role="alert">{error}</p>}
      <form
        className="habit-form workspace-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.name.trim() || !draft.days.length) return;
          const h: Habit = {
            ...draft,
            name: draft.name.trim(),
            id: editing ?? crypto.randomUUID(),
            logs: habits.find((h) => h.id === editing)?.logs ?? {},
          };
          if (
            commit(
              editing
                ? habits.map((x) => (x.id === editing ? h : x))
                : [...habits, h],
            )
          ) {
            setDraft(blank);
            setEditing(null);
          }
        }}
      >
        <label>
          Tên thói quen
          <input
            value={draft.name}
            required
            maxLength={120}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          Nhóm thói quen
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          >
            {['Cá nhân', 'Học tập', 'Sức khỏe', 'Công việc'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Mục tiêu mỗi tuần
          <input
            type="number"
            min={1}
            max={draft.days.length || 1}
            required
            value={draft.weeklyTarget}
            onChange={(e) =>
              setDraft({ ...draft, weeklyTarget: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Phút khi kết nối Focus
          <input
            type="number"
            min={1}
            max={1440}
            required
            value={draft.minutes}
            onChange={(e) =>
              setDraft({ ...draft, minutes: Number(e.target.value) })
            }
          />
        </label>
        <fieldset className="habit-repeat">
          <legend>Ngày lặp lại</legend>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={draft.days.includes(d)}
                onChange={() => {
                  const days = draft.days.includes(d)
                    ? draft.days.filter((n) => n !== d)
                    : [...draft.days, d];
                  setDraft({
                    ...draft,
                    days,
                    weeklyTarget: Math.max(
                      1,
                      Math.min(draft.weeklyTarget, days.length),
                    ),
                  });
                }}
              />
              {weekday[d]}
            </label>
          ))}
        </fieldset>
        <button
          className="button primary"
          disabled={loaded.error || !draft.days.length}
        >
          <Plus size={16} />
          {editing ? 'Lưu thói quen' : 'Tạo thói quen'}
        </button>
        {editing && (
          <button
            type="button"
            className="button outline"
            onClick={() => {
              setEditing(null);
              setDraft(blank);
            }}
          >
            Hủy sửa thói quen
          </button>
        )}
      </form>
      <div className="habit-toolbar">
        <div>
          <button
            className="icon-button"
            aria-label="Khoảng thói quen trước"
            onClick={() =>
              setDate(
                view === 'week'
                  ? addDays(date, -7)
                  : new Date(date.getFullYear(), date.getMonth() - 1, 1),
              )
            }
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="button outline"
            onClick={() => setDate(new Date())}
          >
            Hôm nay
          </button>
          <button
            className="icon-button"
            aria-label="Khoảng thói quen sau"
            onClick={() =>
              setDate(
                view === 'week'
                  ? addDays(date, 7)
                  : new Date(date.getFullYear(), date.getMonth() + 1, 1),
              )
            }
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <strong>
          {view === 'week'
            ? `${localDate(start)} — ${localDate(addDays(start, 6))}`
            : date.toLocaleDateString('vi-VN', {
                month: 'long',
                year: 'numeric',
              })}
        </strong>
        <label>
          Xem thói quen
          <select
            aria-label="Xem thói quen"
            value={view}
            onChange={(e) => setView(e.target.value as typeof view)}
          >
            <option value="week">Tuần</option>
            <option value="month">Tháng</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Hiện thói quen đã lưu trữ
        </label>
      </div>
      <div className="habit-table-scroll">
        <table className="habit-table">
          <thead>
            <tr>
              <th>Thói quen</th>
              {days.map((d) => (
                <th key={+d}>
                  {weekday[d.getDay()]}
                  <small>
                    {d.getDate()}/{d.getMonth() + 1}
                  </small>
                </th>
              ))}
              <th>Tiến độ</th>
            </tr>
          </thead>
          <tbody>
            {habits
              .filter((h) => showArchived || !h.archived)
              .map((h) => {
                const p = habitProgress(h, date);
                return (
                  <tr key={h.id}>
                    <th>
                      <strong>{h.name}</strong>
                      <small>
                        {h.category}
                        {h.archived ? ' · Đã lưu trữ' : ''}
                      </small>
                      <button
                        className="habit-edit"
                        aria-label={`Sửa thói quen ${h.name}`}
                        disabled={loaded.error}
                        onClick={() => {
                          setEditing(h.id);
                          setDraft({ ...h });
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                    </th>
                    {days.map((d) => {
                      const key = localDate(d),
                        status = h.logs[key],
                        scheduled = h.days.includes(d.getDay());
                      return (
                        <td key={key}>
                          <button
                            className={`habit-cell ${status ?? ''}`}
                            aria-label={`${h.name} ${key}: ${status === 'done' ? 'Đã làm' : status === 'rest' ? 'Tạm nghỉ' : 'Chưa nhập'}`}
                            title={
                              !scheduled ? 'Không thuộc lịch lặp' : undefined
                            }
                            disabled={
                              loaded.error ||
                              h.archived ||
                              key > localDate(new Date()) ||
                              !scheduled
                            }
                            onClick={() =>
                              commit(
                                habits.map((x) =>
                                  x.id === h.id ? cycleLog(x, key) : x,
                                ),
                              )
                            }
                          >
                            {status === 'done' ? (
                              <Check size={19} />
                            ) : status === 'rest' ? (
                              <Moon size={17} />
                            ) : (
                              '—'
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td>
                      <strong>
                        {p.weekDone}/{h.weeklyTarget} tuần
                      </strong>
                      <small>
                        {p.monthDone}/{p.monthScheduled} ngày lên lịch trong
                        tháng
                      </small>
                      <small>Chuỗi: {p.streak} lần theo lịch</small>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {!habits.length && (
        <p className="habit-empty">
          Chưa có thói quen. Tạo thói quen của bạn để bắt đầu.
        </p>
      )}
      <p className="habit-legend">
        <span>
          <Check size={16} /> Đã làm
        </span>
        <span>— Chưa nhập</span>
        <span>
          <Moon size={16} /> Tạm nghỉ
        </span>
      </p>
      <p className="muted">
        Bấm một ô để chuyển: Chưa nhập → Đã làm → Tạm nghỉ → Chưa nhập. Chưa
        nhập không có nghĩa là thất bại. Không ghi nhận trước ngày thực tế.
      </p>
      <section className="workspace-card habit-connections">
        <h2>Kết nối với Lịch và Focus</h2>
        <p>
          Chỉ tạo một công việc cho lần thực hiện bạn chọn. Hoàn thành timer
          không tự đánh dấu thói quen.
        </p>
        <label>
          Ngày thực hiện
          <input
            type="date"
            required
            value={occurrence}
            onChange={(e) => setOccurrence(e.target.value)}
          />
        </label>
        {habits
          .filter((h) => !h.archived)
          .map((h) => (
            <div className="habit-connect-row" key={h.id}>
              <strong>{h.name}</strong>
              <button
                className="button outline"
                disabled={loaded.error || !occurrence}
                onClick={() => connect(h, occurrence, 'calendar')}
              >
                <CalendarDays size={16} />
                Lên lịch {h.name}
              </button>
              <button
                className="button outline"
                disabled={loaded.error || !occurrence}
                onClick={() => connect(h, occurrence, 'focus')}
              >
                <Play size={16} />
                Focus {h.name}
              </button>
              <button
                className="text-button"
                disabled={loaded.error}
                onClick={() => {
                  if (
                    window.confirm(
                      `Lưu trữ thói quen “${h.name}”? Các dấu đã ghi vẫn được giữ.`,
                    )
                  )
                    commit(
                      habits.map((x) =>
                        x.id === h.id ? { ...x, archived: true } : x,
                      ),
                    );
                }}
              >
                Lưu trữ
              </button>
            </div>
          ))}
        {habits
          .filter((h) => h.archived && showArchived)
          .map((h) => (
            <button
              key={h.id}
              className="button outline"
              disabled={loaded.error}
              onClick={() =>
                commit(
                  habits.map((x) =>
                    x.id === h.id ? { ...x, archived: false } : x,
                  ),
                )
              }
            >
              Khôi phục {h.name}
            </button>
          ))}
        <p className="muted">
          Mục tiêu tuần tính số lần đã làm. Mẫu số tháng là số ngày được lên
          lịch trong tháng; tạm nghỉ không phá chuỗi, ngày theo lịch chưa nhập
          đã qua sẽ ngắt chuỗi.
        </p>
      </section>
    </section>
  );
}
