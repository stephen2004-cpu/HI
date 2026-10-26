import { useState } from 'react';
import { plannedTask, type Task } from '../tasks';
import type { Snapshot } from '../engine';
import { duration } from '../engine';
import { plannedSeconds, weekStart, addDays, type Planner } from '../planner';
import { assessment, suggestion, totals, type Review } from '../performance';
type Props = {
  tasks: Task[];
  planner: Planner;
  snapshot: Snapshot;
  overview?: boolean;
  go: (s: string) => void;
  focusTask: (id: string, blockId?: string) => void;
  reviews: Review[];
};
export default function Insights({
  tasks,
  planner,
  snapshot,
  overview,
  go,
  focusTask,
  reviews,
}: Props) {
  const [period, setPeriod] = useState('all'),
    [date, setDate] = useState(new Date().toLocaleDateString('en-CA')),
    [taskFilter, setTaskFilter] = useState('');
  const base = new Date(`${date}T00:00:00`),
    start = period === 'week' ? +weekStart(base, 1) : +base,
    end = period === 'week' ? +addDays(new Date(start), 7) : +addDays(base, 1);
  const history = snapshot.history.filter(
    (h) =>
      (!taskFilter || h.taskId === taskFilter) &&
      (period === 'all' || (h.end >= start && h.end < end)),
  );
  const blocks = planner.blocks.filter(
    (b) =>
      (!taskFilter || b.taskId === taskFilter) &&
      (period === 'all' || (b.start < end && b.end > start)),
  );
  const ids = [
    ...new Set([
      ...tasks
        .filter((t) => !taskFilter || t.id === taskFilter)
        .map((t) => t.id),
      ...blocks.map((b) => b.taskId),
      ...history.flatMap((h) => (h.taskId ? [h.taskId] : [])),
    ]),
  ];
  const actual = (id: string) => totals(history.filter((h) => h.taskId === id));
  const plan = (id: string) =>
    actual(id).planned ??
    (tasks.some((t) => t.id === id)
      ? plannedTask(tasks.find((t) => t.id === id)).focus
      : undefined);
  const done = (id: string) => !!tasks.find((t) => t.id === id)?.completed;
  const sum = totals(history),
    overruns = ids.filter(
      (id) => assessment(plan(id), actual(id).actual, done(id)).delta! > 0,
    ),
    onTime = ids.filter(
      (id) =>
        done(id) &&
        actual(id).actual !== undefined &&
        plan(id)! >= actual(id).actual!,
    );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = addDays(today, 1);
  const upcoming = [...planner.blocks]
    .filter((b) => b.end > Date.now())
    .sort((a, b) => a.start - b.start);
  const hero =
    tasks.find((t) => t.id === snapshot.run?.taskId) ||
    tasks.find((t) => t.id === upcoming[0]?.taskId && !t.completed) ||
    tasks.find((t) => !t.completed && t.group === 'do') ||
    tasks.find((t) => !t.completed);
  const selectedReviews = reviews.filter(
    (r) =>
      (!taskFilter || r.taskId === taskFilter) &&
      (period === 'all' || (r.at >= start && r.at < end)),
  );
  return (
    <section className="insights">
      <div className="eyebrow">
        HOÀN THÀNH ĐIỀU QUAN TRỌNG TRONG THỜI GIAN BẠN ĐẶT RA
      </div>
      <h1>{overview ? 'Tổng quan' : 'Thống kê'}</h1>
      {!overview && (
        <div className="report-filters">
          <label>
            Khoảng thống kê
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="all">Tất cả</option>
              <option value="day">Ngày</option>
              <option value="week">Tuần</option>
            </select>
          </label>
          <label>
            Ngày tham chiếu
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Lọc Task
            <select
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value)}
            >
              <option value="">Tất cả Task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {overview && hero && (
        <article className="dashboard-hero">
          <span>Điều quan trọng tiếp theo</span>
          <h2>{hero.title}</h2>
          <p>Planned Focus: {duration(plannedTask(hero).focus)}</p>
          <p>Expected Output: {hero.expectedOutput || 'Chưa thiết lập'}</p>
          <button
            className="button primary"
            onClick={() =>
              focusTask(hero.id, upcoming.find((b) => b.taskId === hero.id)?.id)
            }
          >
            Bắt đầu hoàn thành
          </button>
        </article>
      )}
      <div className="metric-grid">
        <article>
          <span>Task chưa hoàn thành / đã hoàn thành</span>
          <strong>
            {tasks.filter((t) => !t.completed).length} /{' '}
            {tasks.filter((t) => t.completed).length}
          </strong>
        </article>
        <article>
          <span>Planned Calendar Duration</span>
          <strong>
            {duration(blocks.reduce((n, b) => n + (b.end - b.start) / 1000, 0))}
          </strong>
        </article>
        <article>
          <span>Actual Focus Time đã lưu</span>
          <strong>
            {sum.actual === undefined
              ? 'Chưa có dữ liệu'
              : duration(sum.actual)}
          </strong>
        </article>
        <article>
          <span>Task vượt kế hoạch / hoàn thành trong kế hoạch</span>
          <strong>
            {overruns.length} / {onTime.length}
          </strong>
        </article>
        <article>
          <span>Actual Break Time</span>
          <strong>
            {sum.rest === undefined ? 'Chưa có dữ liệu' : duration(sum.rest)}
          </strong>
        </article>
        <article>
          <span>Tổng thời gian vượt</span>
          <strong>
            {duration(
              overruns.reduce(
                (n, id) =>
                  n + Math.max(0, (actual(id).actual ?? 0) - (plan(id) ?? 0)),
                0,
              ),
            )}
          </strong>
        </article>
      </div>
      {overview ? (
        <>
          <h2>Công việc sắp đến giờ</h2>
          {upcoming.slice(0, 8).map((b) => (
            <p key={b.id}>
              <button
                className="button outline"
                onClick={() => focusTask(b.taskId, b.id)}
              >
                {new Date(b.start).toLocaleString('vi-VN')} ·{' '}
                {tasks.find((t) => t.id === b.taskId)?.title || b.title}
              </button>
            </p>
          ))}
          <button className="button" onClick={() => go('Lịch')}>
            Mở lịch
          </button>{' '}
          <button className="button" onClick={() => go('Focus')}>
            Mở Focus
          </button>
        </>
      ) : (
        <>
          <p>
            Actual chỉ lấy phiên đã ghi lịch sử, không gồm tạm dừng. Tối đa
            1.000 bản ghi còn lưu. Dữ liệu cũ thiếu số đo hiển thị “Chưa có dữ
            liệu”. Planned Focus dùng bản chụp khi bắt đầu lượt đầu; sửa Task
            không sửa kế hoạch cũ. Lọc ngày/tuần tính Actual theo thời điểm kết
            thúc phiên, Calendar theo block giao khoảng chọn (cộng toàn bộ
            block).
          </p>
          <div className="report-scroll">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Planned Focus</th>
                  <th>Planned Calendar</th>
                  <th>Actual Focus</th>
                  <th>Chênh lệch</th>
                  <th>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {ids.map((id) => {
                  const t = tasks.find((t) => t.id === id),
                    s = actual(id),
                    p = plan(id),
                    a = assessment(p, s.actual, done(id)),
                    tip = suggestion(id, reviews);
                  return (
                    <tr key={id}>
                      <td>
                        {t?.title ||
                          `${blocks.find((b) => b.taskId === id)?.title || 'Task'} (đã xóa)`}
                      </td>
                      <td>
                        {p === undefined ? 'Chưa có dữ liệu' : duration(p)}
                      </td>
                      <td>{duration(plannedSeconds(blocks, id))}</td>
                      <td>
                        {s.actual === undefined
                          ? 'Chưa có dữ liệu'
                          : duration(s.actual)}
                      </td>
                      <td>
                        {a.delta === undefined
                          ? 'Chưa có dữ liệu'
                          : `${a.delta >= 0 ? '+' : '−'}${duration(Math.abs(a.delta))} (${a.percent!.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%)`}
                      </td>
                      <td>
                        {a.text}
                        <p>
                          {t?.completed
                            ? 'Đã xác nhận hoàn thành'
                            : 'Chưa hoàn thành'}{' '}
                          ·{' '}
                          {reviews.some((r) => r.taskId === id && r.expectedMet)
                            ? 'Có lần xác nhận đạt Expected Output'
                            : 'Chưa xác nhận đạt Expected Output'}
                        </p>
                        <p>{tip.advice}</p>
                        <p>
                          {tip.seconds === undefined
                            ? 'Chưa đủ dữ liệu để đề xuất thời gian phù hợp.'
                            : `Tham khảo trung vị ${tip.count} lần đạt kết quả: ${duration(tip.seconds)}`}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <h2>Theo Time Block</h2>
          <div className="report-scroll">
            <table>
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Planned Focus</th>
                  <th>Planned Calendar</th>
                  <th>Actual Focus</th>
                  <th>Chênh lệch và kết quả</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => {
                  const entries = history.filter((h) => h.blockId === b.id),
                    s = totals(entries),
                    a = assessment(s.planned, s.actual, done(b.taskId));
                  return (
                    <tr key={b.id}>
                      <td>
                        {b.title} · {new Date(b.start).toLocaleString('vi-VN')}
                      </td>
                      <td>
                        {s.planned === undefined
                          ? 'Chưa có bản chụp'
                          : duration(s.planned)}
                      </td>
                      <td>
                        {duration(
                          [...entries]
                            .sort((a, b) => a.start - b.start)
                            .find((h) => h.plannedCalendarSeconds !== undefined)
                            ?.plannedCalendarSeconds ??
                            (b.end - b.start) / 1000,
                        )}
                      </td>
                      <td>
                        {s.actual === undefined
                          ? 'Chưa có dữ liệu'
                          : duration(s.actual)}
                      </td>
                      <td>
                        {a.delta === undefined
                          ? 'Chưa có dữ liệu'
                          : `${a.delta >= 0 ? '+' : '−'}${duration(Math.abs(a.delta))} (${a.percent!.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%)`}
                        <p>{a.text}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <h2>Xu hướng qua các lượt thực hiện</h2>
          {[...selectedReviews]
            .sort((a, b) => a.at - b.at)
            .map((r) => (
              <p key={r.runId}>
                {new Date(r.at).toLocaleString('vi-VN')} ·{' '}
                {tasks.find((t) => t.id === r.taskId)?.title || 'Task đã xóa'} ·
                Planned {duration(r.planned)} / Actual {duration(r.actual)} ·{' '}
                {r.completed ? 'Đã hoàn thành' : 'Còn tiếp tục'} ·{' '}
                {r.expectedMet ? 'Đạt kết quả' : 'Chưa xác nhận kết quả'} ·{' '}
                {r.reason || 'Chưa ghi lý do'}
              </p>
            ))}
          <h2>Lý do thường gặp</h2>
          {[
            ...new Set(selectedReviews.map((r) => r.reason).filter(Boolean)),
          ].map((reason) => (
            <p key={reason}>
              {reason}:{' '}
              {selectedReviews.filter((r) => r.reason === reason).length} lượt
            </p>
          ))}
          <p>
            Gợi ý dùng quy tắc trung vị 3–5 lượt cùng Task đã hoàn thành và đạt
            kết quả; không phải mô hình AI dự đoán. Không tự sửa thời lượng.
          </p>
        </>
      )}
    </section>
  );
}
