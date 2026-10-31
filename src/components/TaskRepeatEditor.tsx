import type { Task } from '../tasks';
import { localDate } from '../habits';
import { previewTaskRepeat, type TaskRepeatSettings } from '../taskRecurrence';
const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export default function TaskRepeatEditor({
  settings,
  change,
  series,
  scope,
  setScope,
  instanceDate,
  locked = false,
  effectiveDate,
}: {
  settings: TaskRepeatSettings;
  change: (s: TaskRepeatSettings) => void;
  series?: Task;
  scope: 'single' | 'future';
  setScope: (s: 'single' | 'future') => void;
  instanceDate?: string;
  locked?: boolean;
  effectiveDate?: string;
}) {
  const disabled = locked || (!!series && scope === 'single');
  const effective =
    effectiveDate ??
    (series
      ? instanceDate && instanceDate > localDate(new Date())
        ? instanceDate
        : localDate(new Date())
      : settings.startDate);
  const preview = previewTaskRepeat(settings, series?.repeat, effective);
  return (
    <fieldset className="task-repeat-editor">
      <legend>Lặp lại Task</legend>
      {series && (
        <label>
          Phạm vi chỉnh sửa
          <select
            aria-label="Phạm vi chỉnh sửa Task lặp"
            value={scope}
            onChange={(e) => setScope(e.target.value as 'single' | 'future')}
          >
            <option value="single">Chỉ lần này</option>
            <option value="future">Các lần tương lai</option>
          </select>
        </label>
      )}
      <label>
        Kiểu lặp
        <select
          aria-label="Kiểu lặp Task"
          disabled={disabled}
          value={settings.mode}
          onChange={(e) =>
            change({ ...settings, mode: e.target.value as 'none' | 'weekly' })
          }
        >
          <option value="none">Không lặp</option>
          <option value="weekly">Chọn ngày trong tuần</option>
        </select>
      </label>
      {settings.mode === 'weekly' && (
        <>
          <label>
            Ngày bắt đầu Task lặp
            <input
              type="date"
              aria-label="Ngày bắt đầu Task lặp"
              value={settings.startDate}
              disabled={disabled}
              required
              onChange={(e) =>
                change({ ...settings, startDate: e.target.value })
              }
            />
          </label>
          <fieldset className="task-repeat-days">
            <legend>Ngày lặp lại Task</legend>
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <label
                key={day}
                className={settings.days.includes(day) ? 'selected' : ''}
              >
                <input
                  type="checkbox"
                  aria-label={`Task lặp ${weekdays[day]}`}
                  disabled={disabled}
                  checked={settings.days.includes(day)}
                  onChange={() =>
                    change({
                      ...settings,
                      days: settings.days.includes(day)
                        ? settings.days.filter((d) => d !== day)
                        : [...settings.days, day],
                    })
                  }
                />
                {weekdays[day]}
              </label>
            ))}
          </fieldset>
          <fieldset className="task-repeat-ending">
            <legend>Kết thúc Task lặp</legend>
            <label>
              <input
                type="radio"
                name="task-repeat-ending"
                disabled={disabled}
                checked={!settings.ending}
                onChange={() => change({ ...settings, ending: undefined })}
              />
              Không giới hạn số lần
            </label>
            <label>
              <input
                type="radio"
                name="task-repeat-ending"
                disabled={disabled}
                checked={settings.ending?.type === 'count'}
                onChange={() =>
                  change({ ...settings, ending: { type: 'count', count: 10 } })
                }
              />
              Sau{' '}
              <input
                aria-label="Số lần Task xuất hiện"
                type="number"
                min={1}
                step={1}
                disabled={disabled || settings.ending?.type !== 'count'}
                required={settings.ending?.type === 'count'}
                value={
                  settings.ending?.type === 'count' ? settings.ending.count : 10
                }
                onChange={(e) =>
                  change({
                    ...settings,
                    ending: { type: 'count', count: Number(e.target.value) },
                  })
                }
              />{' '}
              lần xuất hiện
            </label>
            <label>
              <input
                type="radio"
                name="task-repeat-ending"
                disabled={disabled}
                checked={settings.ending?.type === 'date'}
                onChange={() =>
                  change({
                    ...settings,
                    ending: { type: 'date', date: settings.startDate },
                  })
                }
              />
              Đến ngày{' '}
              <input
                aria-label="Ngày kết thúc Task lặp"
                type="date"
                min={settings.startDate}
                disabled={disabled || settings.ending?.type !== 'date'}
                required={settings.ending?.type === 'date'}
                value={
                  settings.ending?.type === 'date'
                    ? settings.ending.date
                    : settings.startDate
                }
                onChange={(e) =>
                  change({
                    ...settings,
                    ending: { type: 'date', date: e.target.value },
                  })
                }
              />
            </label>
          </fieldset>
          <p className="task-repeat-preview">
            {[1, 2, 3, 4, 5, 6, 0]
              .filter((d) => settings.days.includes(d))
              .map((d) => weekdays[d])
              .join(', ')}{' '}
            ·{' '}
            {settings.ending?.type === 'count'
              ? `Tổng ${settings.ending.count} lần`
              : settings.ending?.type === 'date'
                ? `Đến ${settings.ending.date}`
                : 'Không giới hạn'}
            <br />
            {series && scope === 'single'
              ? 'Đang sửa riêng lần này; quy tắc chuỗi không thay đổi.'
              : preview.length
                ? `Các ngày tiếp theo: ${preview.join(', ')}`
                : 'Không có ngày xuất hiện trong khoảng xem trước.'}
          </p>
        </>
      )}
      {series && scope === 'future' && (
        <p className="task-repeat-preview">
          Áp dụng từ {effective}; giữ lịch sử và lần hôm nay. Checklist, tài
          liệu và thứ tự đang chỉnh trong chế độ này chỉ được lưu khi nhấn Lưu
          Task.
        </p>
      )}
      <small>
        Có giờ dự kiến: tự tạo Time Block cho các lần hợp lệ. Chưa có giờ: chọn
        giờ trong phần bên dưới. Ngày bỏ lỡ vẫn tính một lần. Mỗi lần có trạng
        thái riêng; Checklist và tài liệu được sao chép độc lập. Khi sửa tương
        lai, giữ các lần đã hoàn thành, có Focus hoặc đã chỉnh riêng; lịch sử cũ
        không bị viết lại.
      </small>
      {series && scope === 'single' && (
        <small>Để đổi quy tắc lặp, chọn phạm vi “Các lần tương lai”.</small>
      )}
    </fieldset>
  );
}
