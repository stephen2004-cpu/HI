import type { Task } from '../tasks';
import type { Snapshot } from '../engine';
import { duration } from '../engine';
import { plannedSeconds, type Planner } from '../planner';
type Props = {
  tasks: Task[];
  planner: Planner;
  snapshot: Snapshot;
  overview?: boolean;
  go: (screen: string) => void;
};
export default function Insights({
  tasks,
  planner,
  snapshot,
  overview,
  go,
}: Props) {
  const ids = [
    ...new Set([
      ...tasks.map((t) => t.id),
      ...planner.blocks.map((b) => b.taskId),
      ...snapshot.history.flatMap((h) => (h.taskId ? [h.taskId] : [])),
    ]),
  ];
  const actual = (id: string) =>
    snapshot.history
      .filter((h) => h.taskId === id)
      .reduce((n, h) => n + (h.actualSeconds ?? 0), 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  return (
    <section className="insights">
      <div className="eyebrow">NHỊP LÀM VIỆC CỦA BẠN</div>
      <h1>{overview ? 'Tổng quan' : 'Thống kê'}</h1>
      <div className="metric-grid">
        <article>
          <span>Task chưa hoàn thành</span>
          <strong>{tasks.filter((t) => !t.completed).length}</strong>
        </article>
        <article>
          <span>Planned Time</span>
          <strong>
            {duration(
              planner.blocks.reduce((n, b) => n + (b.end - b.start) / 1000, 0),
            )}
          </strong>
        </article>
        <article>
          <span>Actual Time đã ghi nhận</span>
          <strong>
            {duration(
              snapshot.history.reduce((n, h) => n + (h.actualSeconds ?? 0), 0),
            )}
          </strong>
        </article>
      </div>
      {overview ? (
        <>
          <h2>Hôm nay</h2>
          {planner.blocks
            .filter((b) => b.start < +tomorrow && b.end > +today)
            .sort((a, b) => a.start - b.start)
            .map((b) => (
              <p key={b.id}>
                {new Date(b.start).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {tasks.find((t) => t.id === b.taskId)?.title || b.title}
              </p>
            ))}
          <p>
            {snapshot.run
              ? `Focus đang ${snapshot.run.status === 'paused' ? 'tạm dừng' : 'chạy'}. Bạn có thể quay lại mà không mất tiến trình.`
              : 'Chưa có phiên Focus đang chạy.'}
          </p>
          <button className="button primary" onClick={() => go('Lịch')}>
            Mở lịch
          </button>{' '}
          <button className="button" onClick={() => go('Focus')}>
            Mở Focus
          </button>
        </>
      ) : (
        <>
          <p>
            Planned là tổng thời lượng các block (block chồng lấn được cộng
            riêng). Actual chỉ cộng thời gian tập trung của các phiên đã ghi
            lịch sử, không gồm nghỉ, tạm dừng hoặc phiên đang chạy. Báo cáo dùng
            tối đa 1.000 bản ghi lịch sử còn lưu; lịch sử cũ không có số đo
            Actual sẽ không được ước đoán.
          </p>
          <div className="report-scroll">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Planned Time</th>
                  <th>Actual Time</th>
                  <th>Chênh lệch Actual − Planned</th>
                </tr>
              </thead>
              <tbody>
                {ids.map((id) => {
                  const planned = plannedSeconds(planner.blocks, id),
                    spent = actual(id);
                  return (
                    <tr key={id}>
                      <td>
                        {tasks.find((t) => t.id === id)?.title ||
                          `${planner.blocks.find((b) => b.taskId === id)?.title || 'Task'} (đã xóa)`}
                      </td>
                      <td>{duration(planned)}</td>
                      <td>{duration(spent)}</td>
                      <td>
                        {spent >= planned ? '+' : '−'}
                        {duration(Math.abs(spent - planned))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            {
              snapshot.history.filter((h) => h.actualSeconds === undefined)
                .length
            }{' '}
            bản ghi cũ chưa có số đo Actual.
          </p>
        </>
      )}
    </section>
  );
}
