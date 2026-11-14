export default function TaskScopeChoice({
  name,
  description,
  onSingle,
  onAll,
  onCancel,
  busy = false,
  error = '',
}: {
  name: string;
  description: string;
  onSingle: () => void;
  onAll: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
}) {
  return (
    <div
      role="group"
      aria-label={name}
      className="task-scope-choice"
      data-workspace-editing="true"
    >
      <p>{description}</p>
      {error && <p role="alert">{error}</p>}
      <div className="scope-actions">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={onSingle}
        >
          Chỉ lần này
        </button>
        <button
          type="button"
          className="button outline"
          disabled={busy}
          onClick={onAll}
        >
          Toàn bộ chuỗi lặp
        </button>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={onCancel}
        >
          Hủy
        </button>
      </div>
      <small>
        Trạng thái hoàn thành, tiến độ từng lần và lịch sử Focus được giữ riêng.
      </small>
    </div>
  );
}
