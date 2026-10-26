import { useState, useEffect } from 'react';
import type { Task } from '../tasks';
import { Checklist } from './TaskSetup';
import { duration, type Snapshot } from '../engine';
import {
  assessment,
  reasons,
  suggestion,
  totals,
  type Review,
} from '../performance';
export default function FocusDetails({
  task,
  change,
  snapshot,
  blockId,
  reviews,
  reviewError,
  saveReview,
}: {
  task: Task;
  change: (p: Partial<Task>) => boolean;
  snapshot: Snapshot;
  blockId?: string;
  reviews: Review[];
  reviewError: boolean;
  saveReview: (r: Review) => boolean;
}) {
  const records = snapshot.history.filter((r) => r.taskId === task.id),
    sum = totals(records),
    latest = records.find(
      (r) => r.focusRunId && r.focusRunId !== snapshot.run?.focusRunId,
    );
  const [reason, setReason] = useState(''),
    [comment, setComment] = useState(''),
    [expectedMet, setExpectedMet] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    const existing = reviews.find((r) => r.runId === latest?.focusRunId);
    setReason(existing?.reason ?? '');
    setComment(existing?.comment ?? '');
    setExpectedMet(existing?.expectedMet ?? false);
  }, [latest?.focusRunId, reviews]);
  const evaluation = assessment(sum.planned, sum.actual, task.completed),
    tip = suggestion(task.id, reviews);
  return (
    <aside className="focus-details">
      <div className="eyebrow">FOCUS WORKSPACE</div>
      <h2>{task.title}</h2>
      <p>
        {blockId
          ? `Liên kết Time Block: ${blockId.slice(0, 8)}`
          : 'Phiên không gắn Time Block'}
      </p>
      <Checklist task={task} change={change} />
      <label>
        Notes — Thông tin làm việc
        <textarea
          value={task.notes}
          onChange={(e) => change({ notes: e.target.value })}
        />
      </label>
      <h3>Expected Output</h3>
      <p className="output-text">
        {task.expectedOutput || 'Chưa thiết lập kết quả cần đạt.'}
      </p>
      <label>
        Actual Output — Kết quả thực tế
        <textarea
          value={task.actualOutput ?? ''}
          onChange={(e) => change({ actualOutput: e.target.value })}
        />
      </label>
      <p>
        Actual Focus đã lưu:{' '}
        {sum.actual === undefined ? 'Chưa có dữ liệu' : duration(sum.actual)} ·
        Actual Break:{' '}
        {sum.rest === undefined ? 'Chưa có dữ liệu' : duration(sum.rest)}
      </p>
      <p>{evaluation.text}</p>
      {!snapshot.run && latest && (
        <section className="session-review">
          <h3>Ghi nhận kết quả phiên</h3>
          <p>
            Hết giờ không tự hoàn thành Task. Bạn có thể ghi nhận kết quả hoặc
            tiếp tục một phiên nữa.
          </p>
          <label>
            Lý do chênh lệch
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Chưa chọn</option>
              {reasons.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Ghi chú kết quả
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={expectedMet}
              onChange={(e) => setExpectedMet(e.target.checked)}
            />{' '}
            Đã đạt Expected Output
          </label>
          <button
            className="button primary"
            disabled={reviewError}
            onClick={() => {
              const run = records.filter(
                  (r) => r.focusRunId === latest.focusRunId,
                ),
                s = totals(run);
              const review: Review = {
                runId: latest.focusRunId!,
                taskId: task.id,
                at: Date.now(),
                completed: task.completed,
                expectedMet,
                reason,
                comment,
                actualOutput: task.actualOutput ?? '',
                planned: s.planned ?? 0,
                actual: s.actual ?? 0,
              };
              if (saveReview(review)) setMessage('Đã lưu kết quả phiên.');
              else setMessage('Không lưu được kết quả.');
            }}
          >
            Lưu kết quả phiên
          </button>
          <button
            className="button outline"
            onClick={() =>
              change({
                completed: !task.completed,
                status: task.completed ? 'doing' : 'done',
              })
            }
          >
            {task.completed ? 'Tiếp tục Task' : 'Xác nhận Task hoàn thành'}
          </button>
          <p role="status">{message}</p>
        </section>
      )}
      <h3>Gợi ý cho lần làm tiếp theo</h3>
      <p>{tip.advice}</p>
      <p>
        {tip.seconds === undefined
          ? 'Chưa đủ dữ liệu để đề xuất thời gian phù hợp.'
          : `Trung vị ${tip.count} lần hoàn thành đạt kết quả: ${duration(tip.seconds)}. Đây là quy tắc tham khảo, không phải dự đoán AI.`}
      </p>
      <button
        className="button outline"
        onClick={() => setMessage('Giữ nguyên thời gian đã đặt.')}
      >
        Giữ thời gian cũ
      </button>
      {tip.seconds !== undefined && (
        <button
          className="button"
          disabled={!!snapshot.run}
          onClick={() => {
            if (
              change({
                timing: {
                  mode: 'timer',
                  focusMinutes: Math.ceil(tip.seconds! / 60),
                  focusCount: 1,
                  breakMinutes: 0,
                },
              })
            )
              setMessage('Đã áp dụng cho phiên sau, không sửa lịch sử.');
          }}
        >
          Áp dụng thời gian gợi ý cho lần sau
        </button>
      )}
      <p>
        Tự nhập thời gian mới tại Task Setup. Chỉ áp dụng sau khi kết thúc phiên
        hiện tại.
      </p>
    </aside>
  );
}
