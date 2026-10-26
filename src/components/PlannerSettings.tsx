import { useState } from 'react';
import type { Planner } from '../planner';
export default function PlannerSettings({
  planner,
  update,
  locked,
}: {
  planner: Planner;
  update: (p: Planner) => boolean;
  locked: boolean;
}) {
  const [notice, setNotice] = useState('');
  return (
    <section className="planner-settings">
      <h1>Cài đặt</h1>
      <h2>Lịch & thời gian</h2>
      <label>
        Ngày đầu tuần
        <select
          disabled={locked}
          value={planner.preferences.weekStart}
          onChange={(e) =>
            update({
              ...planner,
              preferences: {
                ...planner.preferences,
                weekStart: Number(e.target.value) as 0 | 1,
              },
            })
          }
        >
          <option value={1}>Thứ Hai</option>
          <option value={0}>Chủ Nhật</option>
        </select>
      </label>
      <label>
        Thời lượng block mặc định
        <select
          disabled={locked}
          value={planner.preferences.blockMinutes}
          onChange={(e) =>
            update({
              ...planner,
              preferences: {
                ...planner.preferences,
                blockMinutes: Number(e.target.value),
              },
            })
          }
        >
          {[15, 30, 45, 60, 90, 120].map((n) => (
            <option key={n} value={n}>
              {n} phút
            </option>
          ))}
        </select>
      </label>
      <p>
        Múi giờ: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Lịch dùng
        giờ địa phương của trình duyệt; khi đổi múi giờ, cùng một thời điểm có
        thể hiển thị giờ khác.
      </p>
      <h2>Dữ liệu của bạn</h2>
      <p>
        Dữ liệu được giữ trên trình duyệt hiện tại, chưa đồng bộ thiết bị. Nên
        dùng một tab chỉnh sửa. Bản sao lưu có thể chứa tên và ghi chú cá nhân.
      </p>
      <button
        className="button primary"
        onClick={() => {
          try {
            const data = Object.fromEntries(
              [
                'lbd-focus-v1',
                'lbd-focus-v2-timer',
                'lbd-focus-v2-tasks',
                'lbd-focus-v2-planner',
                'lbd-focus-v2-reviews',
                'lbd-focus-v2-habits',
              ].map((k) => [k, localStorage.getItem(k)]),
            );
            const url = URL.createObjectURL(
              new Blob(
                [
                  JSON.stringify(
                    { version: 1, exportedAt: new Date().toISOString(), data },
                    null,
                    2,
                  ),
                ],
                { type: 'application/json' },
              ),
            );
            const a = document.createElement('a');
            a.href = url;
            a.download = 'lbd-focus-backup.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setNotice('Đã xuất bản sao lưu JSON.');
          } catch {
            setNotice('Không đọc được dữ liệu để sao lưu.');
          }
        }}
      >
        Xuất bản sao lưu JSON
      </button>
      <p role="status">{notice}</p>
      <p>
        Âm lượng và thông báo được điều chỉnh tại màn hình Focus. Dữ liệu V1 chỉ
        được đọc, không bị ghi đè.
      </p>
    </section>
  );
}
