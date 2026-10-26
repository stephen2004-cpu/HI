import { useState, type FormEvent } from 'react';
import {
  groups,
  moveTask,
  readTasks,
  writeTasks,
  type Group,
  type Task,
} from '../tasks';
const empty = {
  title: '',
  notes: '',
  group: 'do' as Group,
  color: '',
  completed: false,
};
export default function TaskBoard() {
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
  return (
    <section className="task-board" aria-labelledby="tasks-title">
      <h2 id="tasks-title">Task & Ma trận Eisenhower</h2>
      <p>
        Kéo công việc giữa các nhóm hoặc dùng mục “Nhóm ưu tiên”. Màu riêng chỉ
        đổi màu thẻ.
      </p>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={submit} className="task-form">
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
      <div className="eisenhower-grid">
        {groups.map((g) => (
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
              {g.name}{' '}
              <small>
                ({tasks.filter((t) => t.group === g.id && !t.completed).length})
              </small>
            </h3>
            <p>{g.description}</p>
            {tasks
              .filter((t) => t.group === g.id)
              .map((t) => (
                <article
                  className={`task-card ${t.completed ? 'task-done' : ''}`}
                  key={t.id}
                  draggable={!loaded.error}
                  style={{ borderLeftColor: t.color || g.color }}
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
                              ? { ...x, completed: !x.completed }
                              : x,
                          ),
                        )
                      }
                    />
                    <span>{t.title}</span>
                  </label>
                  {t.notes && <p className="task-notes">{t.notes}</p>}
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
                      <button
                        className="button"
                        onClick={() => setDeleting(null)}
                      >
                        Hủy xóa
                      </button>
                    </div>
                  )}
                </article>
              ))}
            {!tasks.some((t) => t.group === g.id) && (
              <p className="task-empty">Chưa có công việc</p>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}
