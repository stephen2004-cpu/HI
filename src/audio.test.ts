import { beforeEach, afterEach, expect, it, vi } from 'vitest';
let created: {
  stop: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}[];
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  created = [];
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running';
      currentTime = 0;
      destination = {};
      createOscillator() {
        const node = {
          frequency: { value: 0 },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          disconnect: vi.fn(),
          onended: null,
        };
        created.push(node);
        return node;
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('repeats an alarm, replaces rather than stacks it, and stops sounding voices immediately', async () => {
  const a = await import('./audio');
  await a.unlockAudio();
  a.startAlarm('bell', 60);
  expect(created).toHaveLength(3);
  vi.advanceTimersByTime(5400);
  expect(created).toHaveLength(12);
  a.startAlarm('digital', 40);
  expect(vi.getTimerCount()).toBe(1);
  expect(
    created.slice(0, 12).every((n) => n.disconnect.mock.calls.length === 1),
  ).toBe(true);
  const count = created.length;
  a.stopAlarm();
  expect(
    created.every((n) => n.stop.mock.calls.some((c) => c.length === 0)),
  ).toBe(true);
  vi.advanceTimersByTime(10000);
  expect(created).toHaveLength(count);
  expect(vi.getTimerCount()).toBe(0);
});
it('never schedules sound when silent or volume is zero, and cancels an existing alarm', async () => {
  const a = await import('./audio');
  await a.unlockAudio();
  a.startAlarm('bell', 60);
  a.startAlarm('bell', 0);
  a.startAlarm('silent', 60);
  vi.advanceTimersByTime(10000);
  expect(created).toHaveLength(3);
  expect(vi.getTimerCount()).toBe(0);
});
