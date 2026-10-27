import * as workspaceStorage from './workspaceStorage';
import type { Task } from './tasks';
import { groups } from './tasks';
export type TimeBlock = {
  recurringHabitId?: string;
  habitDate?: string;
  habitOverride?: boolean;
  cancelled?: boolean;
  id: string;
  taskId: string;
  title: string;
  start: number;
  end: number;
  color: string;
};
export type Preferences = { weekStart: 0 | 1; blockMinutes: number };
export type Planner = {
  version: 1;
  blocks: TimeBlock[];
  preferences: Preferences;
};
export const PLANNER_KEY = 'lbd-focus-v2-planner';
export const defaultPlanner: Planner = {
  version: 1,
  blocks: [],
  preferences: { weekStart: 1, blockMinutes: 60 },
};
export const validBlock = (b: TimeBlock) =>
  b &&
  typeof b.id === 'string' &&
  typeof b.taskId === 'string' &&
  typeof b.title === 'string' &&
  (b.recurringHabitId === undefined ||
    typeof b.recurringHabitId === 'string') &&
  (b.habitDate === undefined ||
    (typeof b.habitDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(b.habitDate))) &&
  (b.cancelled === undefined || typeof b.cancelled === 'boolean') &&
  (b.habitOverride === undefined || typeof b.habitOverride === 'boolean') &&
  Number.isFinite(b.start) &&
  Number.isFinite(b.end) &&
  b.start >= 0 &&
  b.end > b.start &&
  (b.color === '' || /^#[a-f\d]{6}$/i.test(b.color));
export function loadPlanner(): { data: Planner; error: boolean } {
  try {
    const raw = workspaceStorage.getItem(PLANNER_KEY);
    if (!raw) return { data: structuredClone(defaultPlanner), error: false };
    const x = JSON.parse(raw) as Planner;
    if (
      x.version !== 1 ||
      !Array.isArray(x.blocks) ||
      !x.blocks.every(validBlock) ||
      new Set(x.blocks.map((b) => b.id)).size !== x.blocks.length ||
      ![0, 1].includes(x.preferences.weekStart) ||
      !Number.isInteger(x.preferences.blockMinutes) ||
      x.preferences.blockMinutes < 15 ||
      x.preferences.blockMinutes > 1440
    )
      throw Error('Invalid planner');
    return { data: x, error: false };
  } catch {
    return { data: structuredClone(defaultPlanner), error: true };
  }
}
export function savePlanner(data: Planner): boolean {
  try {
    workspaceStorage.setItem(PLANNER_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
export function dayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
export function weekStart(date: Date, first: number): Date {
  return addDays(dayStart(date), -((date.getDay() - first + 7) % 7));
}
export function dateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function blockColor(block: TimeBlock, tasks: Task[]): string {
  const t = tasks.find((t) => t.id === block.taskId);
  return (
    block.color ||
    t?.color ||
    groups.find((g) => g.id === t?.group)?.color ||
    '#d5ac64'
  );
}
export function plannedSeconds(blocks: TimeBlock[], taskId: string): number {
  return blocks
    .filter((b) => b.taskId === taskId)
    .reduce((n, b) => n + (b.end - b.start) / 1000, 0);
}
// Lay out connected overlapping events together, including events crossing midnight.
export function layoutDay(blocks: TimeBlock[], day: Date) {
  const start = dayStart(day).getTime(),
    end = addDays(dayStart(day), 1).getTime();
  const items = blocks
    .filter((b) => b.start < end && b.end > start)
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const result: {
    block: TimeBlock;
    lane: number;
    lanes: number;
    top: number;
    height: number;
  }[] = [];
  let cluster: typeof result = [],
    clusterEnd = 0;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((x) => x.lane + 1));
    cluster.forEach((x) => {
      x.lanes = lanes;
      result.push(x);
    });
    cluster = [];
  };
  for (const block of items) {
    if (cluster.length && block.start >= clusterEnd) flush();
    const occupied = new Set(
      cluster.filter((x) => x.block.end > block.start).map((x) => x.lane),
    );
    let lane = 0;
    while (occupied.has(lane)) lane++;
    const a = new Date(Math.max(start, block.start)),
      b = new Date(Math.min(end, block.end));
    const top = a.getHours() * 60 + a.getMinutes();
    const bottom = block.end >= end ? 1440 : b.getHours() * 60 + b.getMinutes();
    cluster.push({
      block,
      lane,
      lanes: 1,
      top,
      height: Math.max(15, bottom - top),
    });
    clusterEnd = Math.max(cluster.length === 1 ? 0 : clusterEnd, block.end);
  }
  flush();
  return result;
}
