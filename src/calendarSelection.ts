export const selectionMinute = (y: number, top: number, height: number) =>
  Math.max(
    0,
    Math.min(1440, Math.round((((y - top) / height) * 1440) / 15) * 15),
  );
export function selectedRange(anchor: number, end: number) {
  const start = Math.min(anchor, end),
    finish = Math.max(anchor, end);
  return { start, end: Math.min(1440, Math.max(start + 15, finish)) };
}
