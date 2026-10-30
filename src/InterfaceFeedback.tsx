import { useEffect } from 'react';

/** Presentation only: no application state, storage, timers, sound or API access. */
export default function InterfaceFeedback() {
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Set<Animation>();
    const frames = new Set<number>();
    let dragged: HTMLElement | null = null;
    let destination: HTMLElement | null = null;
    const nextFrame = (work: () => void) => {
      const id = requestAnimationFrame(() => {
        frames.delete(id);
        work();
      });
      frames.add(id);
    };
    const animate = (
      element: Element | null,
      keyframes: Keyframe[],
      duration = 180,
    ) => {
      if (!element?.isConnected || preference.matches || !element.animate)
        return;
      const animation = element.animate(keyframes, {
        duration,
        easing: 'cubic-bezier(.2,.8,.2,1)',
      });
      animations.add(animation);
      void animation.finished.then(
        () => animations.delete(animation),
        () => animations.delete(animation),
      );
    };
    const preferenceChanged = () => {
      if (preference.matches)
        for (const animation of animations) animation.cancel();
    };
    const pageChanged = () =>
      nextFrame(() => {
        for (const animation of animations) animation.cancel();
        const screen = document.querySelector(
          'main > :is(.calendar-screen,.task-board,.habit-tracker,.focus-workspace,.insights,.planner-settings)',
        );
        // Opacity only: a transformed ancestor would alter Calendar's pointer geometry.
        animate(screen, [{ opacity: 0.45 }, { opacity: 1 }], 170);
      });
    const changed = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox')
        return;
      nextFrame(() => {
        // Controlled inputs have settled by this frame. A rejected save does not celebrate.
        if (!input.isConnected || !input.checked) return;
        if (input.closest('.checklist-row'))
          animate(
            input,
            [
              { transform: 'scale(.85)' },
              { transform: 'scale(1.12)', offset: 0.6 },
              { transform: 'scale(1)' },
            ],
            200,
          );
        const task = input.closest('.task-card.task-done');
        if (task)
          animate(
            task,
            [
              { boxShadow: '0 0 0 0 #d5ac6400' },
              { boxShadow: '0 0 0 3px #d5ac6470', offset: 0.4 },
              { boxShadow: '0 0 0 0 #d5ac6400' },
            ],
            220,
          );
      });
    };
    const habitClicked = (event: MouseEvent) => {
      const cell =
        event.target instanceof Element
          ? event.target.closest('.habit-cell')
          : null;
      if (
        !cell ||
        cell.classList.contains('done') ||
        cell.hasAttribute('disabled')
      )
        return;
      nextFrame(() => {
        if (cell.classList.contains('done'))
          animate(
            cell.querySelector('svg'),
            [
              { transform: 'scale(.6)', opacity: 0.3 },
              { transform: 'scale(1.12)', opacity: 1, offset: 0.7 },
              { transform: 'scale(1)', opacity: 1 },
            ],
            200,
          );
      });
    };
    const clearDestination = () => {
      if (destination) {
        delete destination.dataset.uiDropTarget;
        destination.style.removeProperty('--ui-drop-y');
      }
      destination = null;
    };
    const endDrag = () => {
      if (dragged) delete dragged.dataset.uiDragSource;
      dragged = null;
      clearDestination();
    };
    const startDrag = (event: DragEvent) => {
      endDrag();
      const source =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(
              '.time-block,.unscheduled-task,.task-card',
            )
          : null;
      if (source?.getAttribute('draggable') === 'true') {
        dragged = source;
        dragged.dataset.uiDragSource = '';
      }
    };
    const over = (event: DragEvent) => {
      if (!dragged) return;
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('.day-column,.quadrant')
          : null;
      if (target !== destination) {
        clearDestination();
        destination = target;
        if (destination) destination.dataset.uiDropTarget = '';
      }
      if (destination?.classList.contains('day-column')) {
        destination.style.setProperty(
          '--ui-drop-y',
          `${event.clientY - destination.getBoundingClientRect().top}px`,
        );
      }
    };
    const left = (event: DragEvent) => {
      if (
        destination &&
        event.target instanceof Node &&
        destination.contains(event.target) &&
        (!(event.relatedTarget instanceof Node) ||
          !destination.contains(event.relatedTarget))
      )
        clearDestination();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') endDrag();
    };
    window.addEventListener('hashchange', pageChanged);
    preference.addEventListener('change', preferenceChanged);
    document.addEventListener('change', changed, true);
    document.addEventListener('click', habitClicked, true);
    document.addEventListener('dragstart', startDrag, true);
    document.addEventListener('dragover', over, true);
    document.addEventListener('dragleave', left, true);
    document.addEventListener('drop', endDrag, true);
    document.addEventListener('dragend', endDrag, true);
    document.addEventListener('keydown', keyDown, true);
    window.addEventListener('blur', endDrag);
    return () => {
      for (const id of frames) cancelAnimationFrame(id);
      for (const animation of animations) animation.cancel();
      endDrag();
      window.removeEventListener('hashchange', pageChanged);
      preference.removeEventListener('change', preferenceChanged);
      document.removeEventListener('change', changed, true);
      document.removeEventListener('click', habitClicked, true);
      document.removeEventListener('dragstart', startDrag, true);
      document.removeEventListener('dragover', over, true);
      document.removeEventListener('dragleave', left, true);
      document.removeEventListener('drop', endDrag, true);
      document.removeEventListener('dragend', endDrag, true);
      document.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('blur', endDrag);
    };
  }, []);
  return null;
}
