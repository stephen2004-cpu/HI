import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { selectionMinute, selectedRange } from './calendarSelection';
export default function useCalendarSelection(
  enabled: boolean,
  resetKey: string,
  select?: (start: number, end: number) => void,
) {
  const [selection, setSelection] = useState<{
    day: number;
    start: number;
    end: number;
  } | null>(null);
  const gesture = useRef<{
    pointer: number;
    day: number;
    anchor: number;
    y: number;
    element: HTMLElement;
    active: boolean;
  } | null>(null);
  const suppress = useRef(false),
    latest = useRef(select);
  latest.current = select;
  useEffect(() => {
    gesture.current = null;
    setSelection(null);
    if (!enabled) return;
    const clear = () => {
      if (gesture.current?.active) suppress.current = true;
      gesture.current = null;
      setSelection(null);
    };
    const move = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointer) return;
      if (!e.buttons) {
        clear();
        return;
      }
      const rect = g.element.getBoundingClientRect(),
        minute = selectionMinute(e.clientY, rect.top, rect.height);
      if (!g.active && (Math.abs(e.clientY - g.y) < 6 || minute === g.anchor))
        return;
      g.active = true;
      e.preventDefault();
      setSelection({ day: g.day, ...selectedRange(g.anchor, minute) });
    };
    const up = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointer) return;
      if (g.active) {
        suppress.current = true;
        const rect = g.element.getBoundingClientRect(),
          r = selectedRange(
            g.anchor,
            selectionMinute(e.clientY, rect.top, rect.height),
          );
        const a = new Date(g.day),
          b = new Date(g.day);
        a.setMinutes(r.start);
        b.setMinutes(r.end);
        clear();
        latest.current?.(+a, +b);
      } else clear();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && gesture.current) {
        e.preventDefault();
        clear();
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', clear);
    window.addEventListener('blur', clear);
    window.addEventListener('keydown', key);
    return () => {
      gesture.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', clear);
      window.removeEventListener('blur', clear);
      window.removeEventListener('keydown', key);
    };
  }, [enabled, resetKey]);
  return {
    selection,
    down: (e: ReactPointerEvent<HTMLElement>, day: Date) => {
      suppress.current = false;
      if (
        !enabled ||
        e.pointerType !== 'mouse' ||
        e.button !== 0 ||
        e.isPrimary === false ||
        !(e.target instanceof Element) ||
        e.target.closest('.time-block')
      )
        return;
      if (e.target !== e.currentTarget && !e.target.closest('.hour-slot'))
        return;
      const rect = e.currentTarget.getBoundingClientRect();
      gesture.current = {
        pointer: e.pointerId,
        day: +day,
        anchor: Math.min(
          1425,
          selectionMinute(e.clientY, rect.top, rect.height),
        ),
        y: e.clientY,
        element: e.currentTarget,
        active: false,
      };
    },
    click: (e: React.MouseEvent) => {
      if (suppress.current) {
        e.preventDefault();
        e.stopPropagation();
        suppress.current = false;
      }
    },
  };
}
