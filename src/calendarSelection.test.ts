import { expect, it } from 'vitest';
import { selectionMinute, selectedRange } from './calendarSelection';
it('snaps to quarter hours using the current scrolled column bounds', () => {
  expect(selectionMinute(100 + 540, 100, 1440)).toBe(540);
  expect(selectionMinute(100 + 547, 100, 1440)).toBe(540);
  expect(selectionMinute(100 + 548, 100, 1440)).toBe(555);
  expect(selectionMinute(630, -90, 1440)).toBe(720);
  expect(selectionMinute(-500, 0, 1440)).toBe(0);
  expect(selectionMinute(2000, 0, 1440)).toBe(1440);
});
it('normalizes reverse selections and keeps a positive quarter-hour range', () => {
  expect(selectedRange(540, 630)).toEqual({ start: 540, end: 630 });
  expect(selectedRange(630, 540)).toEqual({ start: 540, end: 630 });
  expect(selectedRange(540, 540)).toEqual({ start: 540, end: 555 });
  expect(selectedRange(1425, 1440)).toEqual({ start: 1425, end: 1440 });
});
