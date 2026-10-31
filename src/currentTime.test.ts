import { afterEach, expect, it } from 'vitest';
import { localNowPosition } from './currentTime';
const original = process.env.TZ;
afterEach(() => {
  if (original === undefined) delete process.env.TZ;
  else process.env.TZ = original;
});
it.each([
  [9, 0, 540],
  [12, 30, 750],
  [14, 45, 885],
  [23, 59, 1439],
])(
  'places local %i:%i at pixel %i on the existing one-minute grid',
  (hour, minute, pixel) => {
    const today = new Date(2026, 9, 31);
    expect(localNowPosition(today, new Date(2026, 9, 31, hour, minute))).toBe(
      pixel,
    );
    expect(
      localNowPosition(
        new Date(2026, 9, 30),
        new Date(2026, 9, 31, hour, minute),
      ),
    ).toBeNull();
  },
);
it('uses device timezone and local date across midnight instead of UTC hours', () => {
  process.env.TZ = 'Asia/Ho_Chi_Minh';
  const instant = new Date('2026-10-30T18:30:00Z');
  expect(localNowPosition(new Date(2026, 9, 31), instant)).toBe(90);
  process.env.TZ = 'America/Los_Angeles';
  expect(localNowPosition(new Date(2026, 9, 30), instant)).toBe(690);
  expect(localNowPosition(new Date(2026, 9, 31), instant)).toBeNull();
});
