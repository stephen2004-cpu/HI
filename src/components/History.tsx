import { Clock3, Download, Trash2, Check, Square } from 'lucide-react';
import { duration, type RecordEntry } from '../engine';
const date = (t: number) =>
  new Date(t).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
export function exportHistory(history: RecordEntry[]) {
  const cell = (v: string) =>
    '"' + v.replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
  const rows = [
    [
      'Tên phiên',
      'Loại phiên',
      'Thời lượng (giây)',
      'Bắt đầu',
      'Kết thúc',
      'Trạng thái',
    ],
    ...history.map((h) => [
      h.name,
      h.type,
      String(h.seconds),
      date(h.start),
      date(h.end),
      h.status === 'completed' ? 'Hoàn thành' : 'Dừng sớm',
    ]),
  ];
  const url = URL.createObjectURL(
    new Blob(
      ['\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n')],
      { type: 'text/csv;charset=utf-8;' },
    ),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `lbd-focus-lich-su-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function History({
  history,
  onClear,
}: {
  history: RecordEntry[];
  onClear: () => void;
}) {
  return (
    <section className="history">
      <div className="section-heading">
        <div className="history-title">
          <span className="history-icon">
            <Clock3 size={21} />
          </span>
          <div>
            <h2>Những khoảnh khắc tập trung</h2>
            <p>Lịch sử của bạn, được lưu ngay trên thiết bị này.</p>
          </div>
        </div>
        <div className="history-actions">
          <button
            disabled={!history.length}
            className="text-button"
            onClick={() => exportHistory(history)}
          >
            <Download size={15} />
            Xuất CSV
          </button>
          <button
            disabled={!history.length}
            aria-label="Xóa toàn bộ lịch sử"
            className="icon-button"
            onClick={onClear}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {!history.length ? (
        <div className="empty-history">
          <div className="empty-icon">
            <Clock3 size={27} />
          </div>
          <h3>Mỗi phút tập trung đều có ý nghĩa</h3>
          <p>Hoàn thành phiên đầu tiên để bắt đầu hành trình của bạn.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tên phiên</th>
                <th>Loại phiên</th>
                <th>Thời lượng</th>
                <th>Bắt đầu</th>
                <th>Kết thúc</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.name}</td>
                  <td>{h.type}</td>
                  <td>{duration(h.seconds)}</td>
                  <td>{date(h.start)}</td>
                  <td>{date(h.end)}</td>
                  <td>
                    <span className={`status ${h.status}`}>
                      {h.status === 'completed' ? (
                        <Check size={12} />
                      ) : (
                        <Square size={10} />
                      )}{' '}
                      {h.status === 'completed' ? 'Hoàn thành' : 'Dừng sớm'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {history.length > 0 && (
        <p className="history-note">
          Lưu tối đa 1.000 phiên gần nhất · Thời gian theo múi giờ thiết bị
        </p>
      )}
    </section>
  );
}
