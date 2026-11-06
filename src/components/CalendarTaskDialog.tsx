import { useEffect, useRef } from 'react';
import TaskBoard from './TaskBoard';
import { dateInput, type Planner, type TimeBlock } from '../planner';
import type { Habit } from '../habits';
export default function CalendarTaskDialog({
  range,
  planner,
  blocks,
  habits,
  onRange,
  locked,
  close,
  saved,
}: {
  range: { start: number; end: number };
  planner: Planner;
  blocks: TimeBlock[];
  habits: Habit[];
  onRange: (from: Date, to: Date) => void;
  locked: boolean;
  close: () => void;
  saved: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="calendar-task-dialog"
      aria-labelledby="calendar-task-title"
      onClose={close}
    >
      <h2 id="calendar-task-title">Tạo Task từ Calendar</h2>
      <TaskBoard
        editorOnly
        initialDraft={{
          plannedStart: dateInput(range.start),
          timing: {
            mode: 'timer',
            focusMinutes: (range.end - range.start) / 60000,
            focusCount: 1,
            breakMinutes: 0,
          },
        }}
        planner={planner}
        visibleBlocks={blocks}
        habits={habits}
        onRange={onRange}
        plannerError={locked}
        scheduleTask={() => {}}
        onCancel={() => dialog.current?.close()}
        onSaved={(message) => {
          saved(message);
          dialog.current?.close();
        }}
      />
    </dialog>
  );
}
