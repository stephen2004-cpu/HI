import { Coffee, BookOpen, Plus, Trash2, GripVertical } from 'lucide-react';
import { duration, uid, type Session, type Sound } from '../engine';
export const soundNames: Record<Sound, string> = {
  bell: 'Chuông trong trẻo',
  soft: 'Giai điệu dịu nhẹ',
  digital: 'Tín hiệu điện tử',
  silent: 'Không âm thanh',
};
export default function SessionEditor({
  sessions,
  onChange,
  disabled,
  loop,
  onLoop,
}: {
  sessions: Session[];
  onChange: (s: Session[]) => void;
  disabled: boolean;
  loop: boolean;
  onLoop: (v: boolean) => void;
}) {
  const update = (id: string, patch: Partial<Session>) =>
    onChange(sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  return (
    <section className="session-editor">
      <div className="section-heading">
        <div>
          <h2>Thiết kế nhịp học của bạn</h2>
          <p>Chậm một chút. Đi xa hơn.</p>
        </div>
        <span className="tag">{sessions.length} PHIÊN</span>
      </div>
      <div className="session-list">
        {sessions.map((s, i) => (
          <div className={`session-row ${s.kind}`} key={s.id}>
            <GripVertical className="grip" size={16} />
            <span className="session-number">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="session-icon">
              {s.kind === 'study' ? (
                <BookOpen size={18} />
              ) : (
                <Coffee size={18} />
              )}
            </span>
            <label className="session-title">
              <span>{s.kind === 'study' ? 'Học tập' : 'Nghỉ ngơi'}</span>
              <input
                aria-label={`Tên phiên ${i + 1}`}
                maxLength={80}
                value={s.name}
                disabled={disabled}
                onChange={(e) => update(s.id, { name: e.target.value })}
              />
            </label>
            <label className="session-duration">
              <input
                aria-label={`Số phút phiên ${i + 1}`}
                type="number"
                min="0.0166666667"
                max="5999"
                step="any"
                value={Number((s.seconds / 60).toFixed(4))}
                disabled={disabled}
                onChange={(e) =>
                  update(s.id, {
                    seconds: Math.max(
                      1,
                      Math.min(359940, Math.round(Number(e.target.value) * 60)),
                    ),
                  })
                }
              />
              <span>phút</span>
            </label>
            <select
              aria-label={`Âm thanh phiên ${i + 1}`}
              value={s.sound}
              disabled={disabled}
              onChange={(e) => update(s.id, { sound: e.target.value as Sound })}
            >
              {Object.entries(soundNames).map(([v, n]) => (
                <option value={v} key={v}>
                  {n}
                </option>
              ))}
            </select>
            <button
              className="icon-button delete"
              aria-label={`Xóa phiên ${i + 1}`}
              disabled={disabled || sessions.length === 1}
              onClick={() => onChange(sessions.filter((x) => x.id !== s.id))}
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
      </div>
      <div className="session-actions">
        <div className="add-buttons">
          {(['study', 'break'] as const).map((kind) => (
            <button
              className="button small outline"
              disabled={disabled || sessions.length >= 50}
              key={kind}
              onClick={() =>
                onChange([
                  ...sessions,
                  {
                    id: uid(),
                    kind,
                    name: kind === 'study' ? 'Phiên học mới' : 'Nghỉ ngơi',
                    seconds: kind === 'study' ? 1800 : 300,
                    sound: kind === 'study' ? 'bell' : 'soft',
                  },
                ])
              }
            >
              <Plus size={15} />
              {kind === 'study' ? 'Thêm phiên học' : 'Thêm nghỉ ngơi'}
            </button>
          ))}
        </div>
        <label className="switch-label">
          <input
            type="checkbox"
            role="switch"
            disabled={disabled}
            checked={loop}
            onChange={(e) => onLoop(e.target.checked)}
          />
          <span className="switch" />
          Lặp lại chuỗi
        </label>
      </div>
      <div className="total-time">
        Tổng thời gian dự kiến{' '}
        <strong>{duration(sessions.reduce((n, s) => n + s.seconds, 0))}</strong>
      </div>
    </section>
  );
}
