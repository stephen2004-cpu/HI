import { describe, it, expect } from 'vitest';
import { advance, begin, defaults, remaining, type Session } from './engine';
const sessions: Session[] = [
  { ...defaults[0], seconds: 2 },
  { ...defaults[1], seconds: 1 },
  { ...defaults[2], seconds: 2 },
];
describe('Absolute-deadline timer', () => {
  it('catches up every expired session after a background-tab delay', () => {
    const result = advance(
      { run: begin('study', sessions, false, 1000), history: [] },
      4500,
    );
    expect(result.completed).toHaveLength(2);
    expect(result.snapshot.run?.index).toBe(2);
    expect(result.snapshot.run?.deadline).toBe(6000);
    expect(remaining(result.snapshot.run!, 4500)).toBe(1500);
    expect(result.snapshot.history.map((h) => [h.start, h.end])).toEqual([
      [3000, 4000],
      [1000, 3000],
    ]);
  });
  it('completes timer exactly once at deadline and preserves its configured duration', () => {
    const result = advance(
      { run: begin('timer', sessions.slice(0, 1), false, 1000), history: [] },
      3000,
    );
    expect(result.snapshot.run).toBeNull();
    expect(result.snapshot.history[0]).toMatchObject({
      seconds: 2,
      start: 1000,
      end: 3000,
      status: 'completed',
    });
    expect(advance(result.snapshot, 8000).snapshot.history).toHaveLength(1);
  });
  it('does not consume paused time and resumes from saved remaining duration', () => {
    const run = begin('timer', sessions.slice(0, 1), false, 1000);
    run.remaining = 1000;
    run.status = 'paused';
    expect(advance({ run, history: [] }, 100000).snapshot.run?.remaining).toBe(
      1000,
    );
    run.status = 'running';
    run.deadline = 101000;
    expect(advance({ run, history: [] }, 100999).snapshot.run).not.toBeNull();
    expect(advance({ run, history: [] }, 101000).snapshot.run).toBeNull();
  });
  it('loops to the first session with no time drift', () => {
    const result = advance(
      { run: begin('study', sessions, true, 1000), history: [] },
      6000,
    );
    expect(result.snapshot.run?.index).toBe(0);
    expect(result.snapshot.run?.deadline).toBe(8000);
    expect(result.snapshot.history).toHaveLength(3);
  });
  it('bounds recovery work after a very long looping absence', () => {
    const result = advance(
      { run: begin('study', sessions, true, 0), history: [] },
      1000 * 60 * 60 * 24 * 30,
    );
    expect(result.omitted).toBeGreaterThan(1000);
    expect(result.completed.length).toBeLessThan(1010);
    expect(result.snapshot.run!.deadline).toBeGreaterThan(
      1000 * 60 * 60 * 24 * 30,
    );
  });
  it('restores serialized active sessions using the original absolute deadline', () => {
    const stored = JSON.parse(
      JSON.stringify({
        run: begin('study', sessions, false, 1000),
        history: [],
      }),
    );
    expect(advance(stored, 7000).snapshot.run).toBeNull();
    expect(advance(stored, 7000).snapshot.history).toHaveLength(3);
  });
});
