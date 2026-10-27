import * as workspaceStorage from './workspaceStorage';
import type { RecordEntry } from './engine';
export const reasons = [
  'Công việc nhiều hơn dự kiến',
  'Bị mất tập trung',
  'Bị gián đoạn',
  'Lý do khác',
] as const;
export type Review = {
  runId: string;
  taskId: string;
  at: number;
  completed: boolean;
  expectedMet: boolean;
  reason: string;
  comment: string;
  actualOutput: string;
  planned: number;
  actual: number;
};
export const REVIEW_KEY = 'lbd-focus-v2-reviews';
export function loadReviews(): { reviews: Review[]; error: boolean } {
  try {
    const raw = workspaceStorage.getItem(REVIEW_KEY);
    if (!raw) return { reviews: [], error: false };
    const x = JSON.parse(raw);
    if (
      !Array.isArray(x) ||
      !x.every(validReview) ||
      new Set(x.map((r) => r.runId)).size !== x.length
    )
      throw Error();
    return { reviews: x, error: false };
  } catch {
    return { reviews: [], error: true };
  }
}
export function saveReviews(reviews: Review[]) {
  try {
    workspaceStorage.setItem(REVIEW_KEY, JSON.stringify(reviews));
    if (typeof window !== 'undefined')
      window.dispatchEvent(new Event('lbd-reviews-updated'));
    return true;
  } catch {
    return false;
  }
}
export function assessment(
  planned: number | undefined,
  actual: number | undefined,
  completed: boolean,
) {
  if (planned === undefined || actual === undefined || planned <= 0)
    return {
      text: 'Chưa có dữ liệu so sánh',
      delta: undefined,
      percent: undefined,
    };
  const delta = actual - planned,
    percent = (delta / planned) * 100;
  const min = Math.abs(delta) / 60;
  return {
    delta,
    percent,
    text:
      delta > 0
        ? `Bạn đã dành nhiều hơn ${min.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} phút so với dự kiến.`
        : completed
          ? delta < 0
            ? 'Đã hoàn thành sớm hơn kế hoạch.'
            : 'Đã hoàn thành trong thời gian đã đặt.'
          : 'Task chưa hoàn thành — chưa đánh giá hoàn thành sớm.',
  };
}
export function totals(records: RecordEntry[]) {
  const unique = [...new Map(records.map((r) => [r.id, r])).values()];
  const measured = unique.filter((r) => r.actualSeconds !== undefined);
  return {
    actual: measured.length
      ? measured.reduce((n, r) => n + (r.actualSeconds ?? 0), 0)
      : undefined,
    rest: unique.some((r) => r.breakSeconds !== undefined)
      ? unique.reduce((n, r) => n + (r.breakSeconds ?? 0), 0)
      : undefined,
    planned: [...unique]
      .sort((a, b) => a.start - b.start)
      .find((r) => r.plannedFocusSeconds !== undefined)?.plannedFocusSeconds,
  };
}
export function suggestion(taskId: string, reviews: Review[]) {
  const last = [...reviews]
    .filter((r) => r.taskId === taskId)
    .sort((a, b) => b.at - a.at);
  const reason = last[0]?.reason;
  const advice =
    reason === reasons[0]
      ? 'Xem lại thời lượng kế hoạch hoặc chia công việc thành các bước nhỏ.'
      : reason === reasons[1]
        ? 'Giảm yếu tố gây phân tâm, thử các phiên Focus ngắn hơn; không tự tăng thời lượng.'
        : reason === reasons[2]
          ? 'Chọn khung giờ ít gián đoạn hơn và cân nhắc thêm thời gian dự phòng.'
          : 'Ghi lại kết quả và nguyên nhân để điều chỉnh lần sau.';
  const samples = last
    .filter(
      (r) =>
        r.completed &&
        r.expectedMet &&
        r.actual > 0 &&
        r.reason !== reasons[1] &&
        r.reason !== reasons[2],
    )
    .slice(0, 5)
    .map((r) => r.actual)
    .sort((a, b) => a - b);
  const seconds =
    samples.length >= 3
      ? (samples[Math.floor((samples.length - 1) / 2)] +
          samples[Math.ceil((samples.length - 1) / 2)]) /
        2
      : undefined;
  return {
    advice,
    seconds: reason === reasons[1] ? undefined : seconds,
    count: samples.length,
  };
}

export function validReview(r: Review) {
  return (
    r &&
    typeof r.runId === 'string' &&
    typeof r.taskId === 'string' &&
    Number.isFinite(r.at) &&
    typeof r.completed === 'boolean' &&
    typeof r.expectedMet === 'boolean' &&
    typeof r.reason === 'string' &&
    typeof r.comment === 'string' &&
    typeof r.actualOutput === 'string' &&
    Number.isFinite(r.planned) &&
    r.planned >= 0 &&
    Number.isFinite(r.actual) &&
    r.actual >= 0
  );
}
