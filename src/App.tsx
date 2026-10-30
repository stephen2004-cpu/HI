import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Coffee,
  Expand,
  Headphones,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  advance,
  begin,
  current,
  duration,
  formatClock,
  record,
  remaining,
  uid,
  type Mode,
  type Run,
  type Snapshot,
  type Sound,
} from './engine';
import { load, save, type Saved } from './storage';
import { playSound, unlockAudio, startAlarm, stopAlarm } from './audio';
import SessionEditor from './components/SessionEditor';
import History from './components/History';
import TaskBoard from './components/TaskBoard';
import Calendar from './components/Calendar';
import Insights from './components/Insights';
import PlannerSettings from './components/PlannerSettings';
import {
  readTasks,
  writeTasks,
  timingOf,
  taskSessions,
  plannedTask,
  type Task,
} from './tasks';
import FocusDetails from './components/FocusDetails';
import HabitTracker from './components/HabitTracker';
import { validDate, loadHabits, habitOccurrence, type Habit } from './habits';
import {
  generateHabitRange,
  visibleHabitBlocks,
  applyCalendarEdit,
} from './recurrence';
import { loadReviews, saveReviews, type Review } from './performance';
import { loadPlanner, savePlanner, type Planner } from './planner';
const presets = [15, 30, 60, 120, 300, 600, 900, 1500, 1800, 2700];
export default function App() {
  const screens = [
    'Lịch',
    'Task',
    'Thói quen',
    'Focus',
    'Tổng quan',
    'Thống kê',
    'Cài đặt',
  ];
  const [screen, setScreen] = useState(() =>
    screens.includes(decodeURI(location.hash.slice(1)))
      ? decodeURI(location.hash.slice(1))
      : 'Lịch',
  );
  const [habitState, setHabitState] = useState(loadHabits);
  useEffect(() => {
    const refresh = () => setHabitState(loadHabits());
    window.addEventListener('lbd-habits-updated', refresh);
    return () => window.removeEventListener('lbd-habits-updated', refresh);
  }, []);
  const [calendarDate, setCalendarDate] = useState('');
  const [calendarTaskRequest, setCalendarTaskRequest] = useState<
    { taskId: string; date: string; token: number } | undefined
  >();
  const [taskState, setTaskState] = useState(readTasks);
  const [plannerState] = useState(loadPlanner);
  const [planner, setPlanner] = useState(plannerState.data);
  const [plannerError, setPlannerError] = useState(
    plannerState.error
      ? 'Không đọc được dữ liệu lịch. Dữ liệu gốc được giữ nguyên; lịch tạm khóa chỉnh sửa.'
      : '',
  );
  const [selectedTask, setSelectedTask] = useState(
    () =>
      load().snapshot.run?.taskId ??
      load().snapshot.history.find((h) => h.taskId)?.taskId ??
      '',
  );
  const [selectedBlock, setSelectedBlock] = useState(
    () =>
      load().snapshot.run?.blockId ??
      load().snapshot.history.find((h) => h.taskId)?.blockId ??
      '',
  );
  const [reviewState, setReviewState] = useState(loadReviews);
  useEffect(() => {
    const change = () => setTaskState(readTasks());
    window.addEventListener('lbd-tasks-updated', change);
    return () => window.removeEventListener('lbd-tasks-updated', change);
  }, []);
  const changeTask = (patch: Partial<Task>) => {
    const current = readTasks();
    if (current.error) return false;
    const ok = writeTasks(
      current.tasks.map((t) =>
        t.id === (dataRef.current.snapshot.run?.taskId || selectedTask)
          ? { ...t, ...patch }
          : t,
      ),
    );
    if (!ok)
      setNotice(
        'Không lưu được Task. Hãy kiểm tra quyền hoặc dung lượng lưu trữ.',
      );
    if (ok && patch.timing && !dataRef.current.snapshot.run)
      selectTask(selectedTask, selectedBlock);
    return ok;
  };
  const saveReview = (r: Review) => {
    if (reviewState.error) return false;
    const next = [...reviewState.reviews.filter((x) => x.runId !== r.runId), r];
    if (!saveReviews(next)) return false;
    setReviewState({ reviews: next, error: false });
    return true;
  };
  const navigate = (next: string) => {
    setTaskState(readTasks());
    setScreen(next);
    location.hash = encodeURI(next);
  };
  useEffect(() => {
    const change = () => {
      const next = decodeURI(location.hash.slice(1));
      setScreen(screens.includes(next) ? next : 'Lịch');
      setTaskState(readTasks());
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const updatePlanner = (next: Planner) => {
    if (plannerState.error) return false;
    if (!savePlanner(next)) {
      setPlannerError(
        'Không lưu được lịch. Kiểm tra dung lượng hoặc quyền lưu trữ rồi thử lại.',
      );
      return false;
    }
    setPlanner(next);
    setPlannerError('');
    return true;
  };
  const focusTask = (id: string, blockId?: string) => {
    if (dataRef.current.snapshot.run) {
      setNotice('Đang có phiên Focus; hãy kết thúc phiên trước khi đổi Task.');
      navigate('Focus');
      return;
    }
    selectTask(id, blockId);
    navigate('Focus');
  };
  const connectHabit = (
    habit: Habit,
    date: string,
    destination: 'calendar' | 'focus',
  ) => {
    if (!validDate(date)) {
      setNotice('Chọn ngày thực hiện hợp lệ.');
      return;
    }
    if (destination === 'focus' && dataRef.current.snapshot.run) {
      setNotice(
        'Đang có phiên Focus. Kết thúc phiên trước khi mở lần thực hiện khác.',
      );
      navigate('Focus');
      return;
    }
    const loaded = readTasks();
    if (loaded.error || plannerState.error) {
      setNotice(
        'Không đọc được dữ liệu Task hoặc lịch. Dữ liệu gốc được giữ nguyên.',
      );
      return;
    }
    const id = `habit:${habit.id}:${date}`;
    if (!loaded.tasks.some((t) => t.id === id)) {
      const t: Task = {
        id,
        title: habit.name,
        notes: `Lần thực hiện thói quen ngày ${date}. Đánh dấu thói quen tại trang Thói quen sau khi làm xong.`,
        group: 'schedule',
        color: '',
        completed: false,
        habitId: habit.id,
        habitDate: date,
        timing: {
          mode: 'timer',
          focusMinutes: habit.minutes,
          focusCount: 1,
          breakMinutes: 0,
        },
      };
      if (!writeTasks([...loaded.tasks, t])) {
        setNotice('Không lưu được lần thực hiện. Hãy thử lại.');
        return;
      }
    }
    if (destination === 'calendar') {
      const blockId = `habit-block:${habit.id}:${date}`,
        start =
          habitOccurrence(habit, date)?.start ??
          new Date(
            `${date}T${habit.recurrence?.rules.at(-1)?.time ?? '09:00'}:00`,
          ).getTime();
      if (
        !planner.blocks.some((b) => b.id === blockId) &&
        !updatePlanner({
          ...planner,
          blocks: [
            ...planner.blocks,
            {
              id: blockId,
              ...(habit.recurrence
                ? { recurringHabitId: habit.id, habitDate: date }
                : {}),
              taskId: id,
              title: habit.name,
              start,
              end: start + habit.minutes * 60000,
              color: '',
            },
          ],
        })
      ) {
        setNotice(
          'Đã giữ Task cho lần thực hiện, nhưng chưa lưu được lịch. Có thể thử lại mà không tạo trùng.',
        );
        return;
      }
      setCalendarDate(date);
      navigate('Lịch');
    } else focusTask(id);
  };
  const [data, setData] = useState<Saved>(load);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [mode, setMode] = useState<Mode>(
    () => data.snapshot.run?.mode || 'timer',
  );
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState('');
  const [alarm, setAlarm] = useState<{ message: string; sound: Sound } | null>(
    null,
  );
  const alarmNotification = useRef<Notification | null>(null);
  const silenceAlarm = () => {
    stopAlarm();
    setAlarm(null);
    alarmNotification.current?.close();
    alarmNotification.current = null;
  };
  useEffect(() => {
    if (alarm)
      startAlarm(alarm.sound, data.settings.muted ? 0 : data.settings.volume);
    else stopAlarm();
    return stopAlarm;
  }, [alarm, data.settings.muted, data.settings.volume]);
  useEffect(
    () => () => {
      stopAlarm();
      alarmNotification.current?.close();
    },
    [],
  );
  const [storageError, setStorageError] = useState(false);
  const [confirm, setConfirm] = useState<'stop' | 'clear' | null>(null);
  const [notifications, setNotifications] = useState(false);
  const [focus, setFocus] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const lastSaved = useRef('');
  const run = data.snapshot.run;
  const s = data.settings;
  const linkedBlock = planner.blocks.find(
    (b) => b.id === (run?.blockId || selectedBlock),
  );
  const protectedTaskIds = new Set(
    data.snapshot.history.flatMap((h) => (h.taskId ? [h.taskId] : [])),
  );
  if (run?.taskId) protectedTaskIds.add(run.taskId);
  taskState.tasks
    .filter((t) => t.completed)
    .forEach((t) => protectedTaskIds.add(t.id));
  const displayBlocks = habitState.error
    ? planner.blocks.filter((b) => !b.cancelled)
    : visibleHabitBlocks(
        planner.blocks,
        habitState.habits,
        protectedTaskIds,
        now,
      );
  const displayPlanner = { ...planner, blocks: displayBlocks };
  const ensureHabitRange = (from: Date, to: Date) => {
    const habits = loadHabits(),
      tasks = readTasks();
    if (habits.error || tasks.error || plannerState.error) return;
    const result = generateHabitRange(
      habits.habits,
      planner,
      tasks.tasks,
      from,
      to,
      protectedTaskIds,
    );
    if (result.tasksChanged && !writeTasks(result.tasks)) {
      setPlannerError(
        'Không lưu được các lần Habit. Chưa cập nhật lịch; có thể thử lại mà không tạo trùng.',
      );
      return;
    }
    if (result.blocksChanged) updatePlanner(result.planner);
  };
  const updateCalendar = (next: Planner) =>
    updatePlanner(applyCalendarEdit(planner, displayBlocks, next));
  const active = run ? current(run) : null;
  const seconds = run
    ? remaining(run, now) / 1000
    : mode === 'study'
      ? s.sessions[0].seconds
      : s.hours * 3600 + s.minutes * 60 + s.seconds;
  const [hh, mm, ss] = formatClock(seconds);
  const total = run ? current(run).seconds : seconds;
  const progress = run ? Math.min(100, (seconds / total) * 100) : 100;
  const update = (next: Saved) => {
    dataRef.current = next;
    setData(next);
  };
  const settings = (patch: Partial<Saved['settings']>) =>
    update({
      ...dataRef.current,
      settings: { ...dataRef.current.settings, ...patch },
    });
  const selectTask = (id: string, blockId?: string) => {
    setSelectedTask(id);
    setSelectedBlock(blockId ?? '');
    const t = readTasks().tasks.find((t) => t.id === id);
    if (!t) return;
    const config = timingOf(t),
      sessions = taskSessions(t),
      secs = config.focusMinutes * 60;
    setMode(config.mode);
    settings({
      hours: Math.floor(secs / 3600),
      minutes: Math.floor(secs / 60) % 60,
      seconds: secs % 60,
      name: t.title,
      sessions,
      loop: false,
    });
  };
  const snap = (snapshot: Snapshot) => update({ ...dataRef.current, snapshot });
  const announce = (message: string) => setNotice(message);
  useEffect(() => {
    const tick = () => {
      const time = Date.now();
      setNow(time);
      const d = dataRef.current;
      const result = advance(d.snapshot, time);
      if (result.completed.length) {
        const next = { ...d, snapshot: result.snapshot };
        dataRef.current = next;
        setData(next);
        const finished = result.completed[result.completed.length - 1];
        const nextRun = result.snapshot.run;
        const message = nextRun
          ? `Đã hoàn thành ${finished.name}. Tiếp theo: ${current(nextRun).name}.`
          : `Đã hoàn thành ${finished.name}. Bạn đã làm rất tốt!`;
        setAlarm({ message, sound: finished.sound });
        setNotice(
          result.omitted
            ? `${message} Một số vòng lặp khi vắng mặt đã được bỏ qua.`
            : message,
        );
        if (
          notifications &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            alarmNotification.current?.close();
            // Page notifications do not support action buttons consistently. Clicking
            // this notification acknowledges the same alarm as the in-page button.
            const notification = new Notification('LBD Focus — Tắt chuông', {
              body: message + ' Nhấn thông báo để tắt chuông.',
              tag: 'lbd-focus-alarm',
              silent: true,
            });
            notification.onclick = () => {
              window.focus();
              silenceAlarm();
            };
            alarmNotification.current = notification;
          } catch {
            /* In-page announcement remains available. */
          }
        }
      }
    };
    tick();
    const id = setInterval(tick, 200);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [notifications]);
  useEffect(() => {
    const json = JSON.stringify(data);
    if (json !== lastSaved.current) {
      setStorageError(!save(data));
      lastSaved.current = json;
    }
  }, [data]);
  useEffect(() => {
    const listener = () => setFocus(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', listener);
    return () => document.removeEventListener('fullscreenchange', listener);
  }, []);
  useEffect(() => {
    document.title = run
      ? `${hh}:${mm}:${ss} · LBD Focus`
      : 'LBD Focus — Tập trung vào điều quan trọng';
  }, [hh, mm, ss, !!run]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 9000);
    return () => clearTimeout(t);
  }, [notice]);
  // Actions reconcile an expired deadline before applying user input.
  const fresh = () => {
    const d = dataRef.current;
    const next = { ...d, snapshot: advance(d.snapshot, Date.now()).snapshot };
    update(next);
    return next;
  };
  const start = async () => {
    const d = dataRef.current;
    const secs =
      d.settings.hours * 3600 + d.settings.minutes * 60 + d.settings.seconds;
    if (mode === 'timer' && secs <= 0) {
      announce('Hãy đặt thời gian lớn hơn 0 giây.');
      return;
    }
    const sessions =
      mode === 'timer'
        ? [
            {
              id: uid(),
              name: d.settings.name.trim() || 'Thời gian tập trung',
              kind: 'study' as const,
              seconds: secs,
              sound: 'bell' as const,
            },
          ]
        : d.settings.sessions.map((x, i) => ({
            ...x,
            name: x.name.trim() || `Phiên ${i + 1}`,
          }));
    snap({
      run: {
        ...begin(
          mode,
          sessions,
          mode === 'study' && d.settings.loop,
          Date.now(),
        ),
        taskId: selectedTask || undefined,
        blockId: selectedBlock || undefined,
        plannedFocusSeconds: sessions
          .filter((x) => x.kind === 'study')
          .reduce((n, x) => n + x.seconds, 0),
        plannedBreakSeconds: sessions
          .filter((x) => x.kind === 'break')
          .reduce((n, x) => n + x.seconds, 0),
        plannedCalendarSeconds: selectedBlock
          ? (() => {
              const b = planner.blocks.find((b) => b.id === selectedBlock);
              return b ? (b.end - b.start) / 1000 : undefined;
            })()
          : sessions.reduce((n, x) => n + x.seconds, 0),
      },
      history: d.snapshot.history,
    });
    if (!(await unlockAudio()))
      announce(
        'Chưa kích hoạt được âm thanh. Bạn vẫn nhận thông báo trên trang.',
      );
  };
  const pause = () => {
    const d = fresh();
    const r = d.snapshot.run;
    if (!r) return;
    const time = Date.now();
    snap({
      ...d.snapshot,
      run:
        r.status === 'running'
          ? { ...r, status: 'paused', remaining: remaining(r, time) }
          : { ...r, status: 'running', deadline: time + r.remaining },
    });
    if (r.status === 'paused') void unlockAudio();
  };
  const stop = () => {
    const d = fresh();
    const r = d.snapshot.run;
    if (r)
      snap({
        run: null,
        history: [
          record(r, Date.now(), 'stopped'),
          ...d.snapshot.history,
        ].slice(0, 1000),
      });
    setConfirm(null);
  };
  const restart = () => {
    const d = fresh();
    const r = d.snapshot.run;
    if (!r) return;
    const time = Date.now();
    snap({
      history: [record(r, time, 'stopped'), ...d.snapshot.history].slice(
        0,
        1000,
      ),
      run: {
        ...r,
        remaining: current(r).seconds * 1000,
        deadline: time + current(r).seconds * 1000,
        started: time,
        measured: true,
        focusRunId: uid(),
        status: 'running',
      },
    });
    void unlockAudio();
  };
  const skip = () => {
    const d = fresh();
    const r = d.snapshot.run;
    if (!r) return;
    const time = Date.now();
    let next: Run | null = null;
    if (r.index < r.sessions.length - 1 || r.loop) {
      const index = (r.index + 1) % r.sessions.length;
      const ms = r.sessions[index].seconds * 1000;
      next = {
        ...r,
        index,
        remaining: ms,
        deadline: time + ms,
        started: time,
        measured: true,
      };
    }
    snap({
      run: next,
      history: [record(r, time, 'stopped'), ...d.snapshot.history].slice(
        0,
        1000,
      ),
    });
    announce(
      next
        ? `Đã chuyển sang ${current(next).name}.`
        : 'Đã kết thúc chuỗi học tập.',
    );
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (panel.current?.requestFullscreen)
        await panel.current.requestFullscreen();
      else setFocus(!focus);
    } catch {
      setFocus(!focus);
    }
  };
  const notify = async () => {
    if (!('Notification' in window)) {
      announce(
        'Trình duyệt này chưa hỗ trợ thông báo hệ thống. Thông báo trên trang luôn bật.',
      );
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotifications(permission === 'granted');
      announce(
        permission === 'granted'
          ? 'Đã bật thông báo cho lần sử dụng này.'
          : 'Thông báo trên trang vẫn hoạt động. Bạn có thể cấp quyền trong cài đặt trình duyệt.',
      );
    } catch {
      announce(
        'Không thể bật thông báo hệ thống. Thông báo trên trang vẫn hoạt động.',
      );
    }
  };
  return (
    <div className="app-shell">
      <header className="header">
        <a href="#" className="wordmark" aria-label="LBD Focus trang chủ">
          <span className="brand-symbol">
            <img
              src="/brand/falcon-mark.png"
              alt=""
              width={365}
              height={310}
              decoding="async"
            />
          </span>
          <span>
            LBD<span className="brand-light"> FOCUS</span>
            <small>BY LỘC BOY ĐẢO</small>
          </span>
        </a>
        <div className="header-right">
          <span className="local-badge">
            <span />
            Không gian của riêng bạn
          </span>
          <button
            className={`icon-button ${notifications ? 'gold-text' : ''}`}
            aria-label="Bật thông báo hệ thống"
            onClick={notify}
          >
            <Bell size={18} />
          </button>
        </div>
      </header>
      <nav className="app-nav" aria-label="Điều hướng chính">
        {screens.map((item) => (
          <button
            key={item}
            aria-current={screen === item ? 'page' : undefined}
            onClick={() => navigate(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      {run && screen !== 'Focus' && (
        <button className="running-banner" onClick={() => navigate('Focus')}>
          Focus {run.status === 'paused' ? 'tạm dừng' : 'đang chạy'} · {hh}:{mm}
          :{ss} · Quay lại →
        </button>
      )}
      <main>
        {reviewState.error && (
          <p role="alert">
            Không đọc được dữ liệu kết quả phiên. Dữ liệu gốc vẫn được giữ, tạm
            khóa ghi kết quả.
          </p>
        )}
        {plannerError && <p role="alert">{plannerError}</p>}
        {taskState.error && screen !== 'Task' && (
          <p role="alert">
            Không đọc được dữ liệu Task. Dữ liệu gốc vẫn được giữ nguyên.
          </p>
        )}
        {screen === 'Lịch' && (
          <Calendar
            tasks={taskState.tasks}
            planner={displayPlanner}
            initialDate={calendarDate}
            scheduleRequest={calendarTaskRequest}
            onScheduleOpened={() => setCalendarTaskRequest(undefined)}
            update={updateCalendar}
            onRange={ensureHabitRange}
            recurrenceToken={JSON.stringify(habitState.habits)}
            focusTask={focusTask}
            locked={plannerState.error || taskState.error}
          />
        )}
        {screen === 'Task' && (
          <TaskBoard
            planner={planner}
            visibleBlocks={displayBlocks}
            habits={habitState.habits}
            onRange={ensureHabitRange}
            plannerError={plannerState.error || habitState.error}
            scheduleTask={(taskId, date) => {
              setCalendarDate(date);
              setCalendarTaskRequest({ taskId, date, token: Date.now() });
              navigate('Lịch');
            }}
          />
        )}
        {screen === 'Thói quen' && <HabitTracker connect={connectHabit} />}
        {(screen === 'Tổng quan' || screen === 'Thống kê') && (
          <Insights
            tasks={taskState.tasks}
            planner={displayPlanner}
            snapshot={data.snapshot}
            overview={screen === 'Tổng quan'}
            go={navigate}
            focusTask={focusTask}
            reviews={reviewState.reviews}
          />
        )}
        {screen === 'Cài đặt' && (
          <PlannerSettings
            planner={planner}
            update={updatePlanner}
            locked={plannerState.error}
          />
        )}
        {screen === 'Focus' && (
          <>
            <div
              className={`focus-workspace ${run?.taskId || selectedTask ? 'linked-focus' : ''}`}
            >
              <div className="focus-timer-pane">
                <div className="focus-task-picker">
                  <label>
                    Task đang tập trung
                    <select
                      disabled={!!run}
                      value={run?.taskId || selectedTask}
                      onChange={(e) => selectTask(e.target.value)}
                    >
                      <option value="">Không chọn Task — Focus độc lập</option>
                      {run?.taskId &&
                        !taskState.tasks.some((t) => t.id === run.taskId) && (
                          <option value={run.taskId}>Task đã xóa</option>
                        )}
                      {taskState.tasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="focus-plan">
                  {linkedBlock &&
                    (linkedBlock.end - linkedBlock.start) / 1000 <
                      (run?.plannedFocusSeconds ??
                        (mode === 'study'
                          ? s.sessions
                              .filter((x) => x.kind === 'study')
                              .reduce((n, x) => n + x.seconds, 0)
                          : s.hours * 3600 + s.minutes * 60 + s.seconds)) +
                        (run?.plannedBreakSeconds ??
                          (mode === 'study'
                            ? s.sessions
                                .filter((x) => x.kind === 'break')
                                .reduce((n, x) => n + x.seconds, 0)
                            : 0)) && (
                      <p role="status" className="schedule-warning">
                        Time Block ngắn hơn tổng Focus và nghỉ. Bạn có thể tăng
                        thời lượng block trong Lịch.
                      </p>
                    )}
                  {run && (
                    <p>
                      Actual Focus trong phiên hiện tại:{' '}
                      {run.measured
                        ? duration(
                            active?.kind === 'study'
                              ? Math.max(
                                  0,
                                  active.seconds - remaining(run, now) / 1000,
                                )
                              : 0,
                          )
                        : 'Chưa có dữ liệu'}
                    </p>
                  )}
                  <p>
                    Planned Focus:{' '}
                    {duration(
                      run?.plannedFocusSeconds ??
                        (mode === 'study'
                          ? s.sessions
                              .filter((x) => x.kind === 'study')
                              .reduce((n, x) => n + x.seconds, 0)
                          : seconds),
                    )}
                  </p>
                  {run && (
                    <p>
                      Phiên {run.index + 1}/{run.sessions.length} ·{' '}
                      {active?.kind === 'break'
                        ? 'Đang nghỉ'
                        : 'Đang tập trung'}{' '}
                      · Nghỉ tiếp theo:{' '}
                      {run.sessions
                        .slice(run.index + 1)
                        .find((x) => x.kind === 'break')?.seconds
                        ? duration(
                            run.sessions
                              .slice(run.index + 1)
                              .find((x) => x.kind === 'break')!.seconds,
                          )
                        : 'Không có'}
                    </p>
                  )}
                </div>
                <section className="intro">
                  <div className="eyebrow">
                    <span /> ÍT XAO NHÃNG. NHIỀU GIÁ TRỊ.
                  </div>
                  <h1>
                    Dành thời gian cho
                    <br />
                    <em>điều quan trọng.</em>
                  </h1>
                  <p>
                    Một không gian yên tĩnh. Một mục tiêu rõ ràng.
                    <br className="mobile-break" /> Bắt đầu nhịp tập trung của
                    riêng bạn.
                  </p>
                </section>
                <div
                  className="mode-tabs"
                  role="tablist"
                  aria-label="Chế độ tập trung"
                >
                  <button
                    role="tab"
                    aria-selected={mode === 'timer'}
                    className={mode === 'timer' ? 'selected' : ''}
                    disabled={!!run && run.mode !== 'timer'}
                    onClick={() => setMode('timer')}
                  >
                    <Clock3 size={17} />
                    Đồng hồ đếm ngược
                  </button>
                  <button
                    role="tab"
                    aria-selected={mode === 'study'}
                    className={mode === 'study' ? 'selected' : ''}
                    disabled={!!run && run.mode !== 'study'}
                    onClick={() => setMode('study')}
                  >
                    <BookOpen size={17} />
                    Chế độ học tập
                  </button>
                </div>
                <section
                  ref={panel}
                  className={`timer-card ${focus ? 'focus-view' : ''}`}
                  aria-label={
                    mode === 'timer' ? 'Đồng hồ đếm ngược' : 'Chế độ học tập'
                  }
                >
                  <div className="card-topline">
                    <span className="card-label">
                      <span
                        className={`live-dot ${run?.status === 'running' ? 'running' : ''}`}
                      />
                      {run
                        ? run.status === 'paused'
                          ? 'ĐANG TẠM DỪNG'
                          : 'ĐANG TẬP TRUNG'
                        : mode === 'timer'
                          ? 'KHOẢNG THỜI GIAN CỦA BẠN'
                          : 'NHỊP HỌC CỦA BẠN'}
                    </span>
                    <button
                      className="icon-button"
                      aria-label={
                        focus ? 'Thoát toàn màn hình' : 'Toàn màn hình'
                      }
                      onClick={fullscreen}
                    >
                      {focus ? <X size={17} /> : <Maximize2 size={17} />}
                    </button>
                  </div>
                  {(run?.taskId || selectedTask) && (
                    <div className="focus-landscape" aria-hidden="true">
                      <span className="landscape-sun" />
                      <span className="mountain mountain-far" />
                      <span className="mountain mountain-middle" />
                      <span className="mountain mountain-near" />
                    </div>
                  )}
                  <div className="timer-center">
                    {run ? (
                      <div className="session-name-display">
                        {run.mode === 'study' &&
                          (active?.kind === 'break' ? (
                            <Coffee size={15} />
                          ) : (
                            <BookOpen size={15} />
                          ))}
                        {active?.name}
                      </div>
                    ) : (
                      <div className="session-name-display">
                        {mode === 'study'
                          ? 'Sẵn sàng cho một buổi học hiệu quả'
                          : s.name || 'Thời gian tập trung'}
                      </div>
                    )}
                    <div
                      className="clock"
                      role="timer"
                      aria-label={`${hh} giờ ${mm} phút ${ss} giây`}
                    >
                      <span>{hh}</span>
                      <span className="clock-colon">:</span>
                      <span>{mm}</span>
                      <div className="clock-seconds">
                        <span>{ss}</span>
                        <small>GIÂY</small>
                      </div>
                    </div>
                    <div className="clock-units">
                      <span>GIỜ</span>
                      <span>PHÚT</span>
                    </div>
                    <div
                      className="progress-track"
                      role="progressbar"
                      aria-label="Thời gian còn lại"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progress)}
                    >
                      <div style={{ width: `${progress}%` }} />
                    </div>
                    <div className="progress-caption">
                      <span>
                        {run
                          ? run.status === 'paused'
                            ? 'Hít thở một chút, rồi tiếp tục nhé.'
                            : 'Chỉ một việc, ngay lúc này.'
                          : 'Mỗi hành trình bắt đầu từ một khoảnh khắc.'}
                      </span>
                      {run?.mode === 'study' && (
                        <strong>
                          Phiên {run.index + 1} / {run.sessions.length}
                        </strong>
                      )}
                    </div>
                    <div className="timer-controls">
                      {!run ? (
                        <button className="button primary" onClick={start}>
                          <Play size={17} fill="currentColor" />{' '}
                          {mode === 'timer'
                            ? 'Bắt đầu tập trung'
                            : 'Bắt đầu chuỗi học'}{' '}
                          <ChevronRight size={16} />
                        </button>
                      ) : (
                        <>
                          <button className="button primary" onClick={pause}>
                            {run.status === 'running' ? (
                              <Pause size={17} />
                            ) : (
                              <Play size={17} />
                            )}{' '}
                            {run.status === 'running' ? 'Tạm dừng' : 'Tiếp tục'}
                          </button>
                          {run.mode === 'timer' ? (
                            <button
                              className="button outline"
                              aria-label="Khởi động lại"
                              onClick={restart}
                            >
                              <RotateCcw size={17} />
                              <span>Khởi động lại</span>
                            </button>
                          ) : (
                            <button
                              className="button outline"
                              aria-label="Bỏ qua"
                              onClick={skip}
                            >
                              <SkipForward size={17} />
                              <span>Bỏ qua</span>
                            </button>
                          )}
                          <button
                            className="icon-button stop-button"
                            aria-label="Kết thúc phiên"
                            onClick={() => {
                              if (document.fullscreenElement)
                                void document.exitFullscreen();
                              setFocus(false);
                              setConfirm('stop');
                            }}
                          >
                            <Square size={17} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {!run && mode === 'timer' && (
                    <div className="timer-settings">
                      <div className="settings-grid">
                        <label className="name-field">
                          <span>TÊN PHIÊN</span>
                          <input
                            value={s.name}
                            maxLength={80}
                            placeholder="Bạn muốn tập trung vào điều gì?"
                            onChange={(e) => settings({ name: e.target.value })}
                          />
                        </label>
                        <div className="time-field">
                          <span>THỜI GIAN</span>
                          <div className="time-inputs">
                            {(['hours', 'minutes', 'seconds'] as const).map(
                              (key, i) => (
                                <label key={key}>
                                  <input
                                    aria-label={['Giờ', 'Phút', 'Giây'][i]}
                                    type="number"
                                    min="0"
                                    max={i === 0 ? 99 : 59}
                                    value={s[key]}
                                    onChange={(e) =>
                                      settings({
                                        [key]: Math.max(
                                          0,
                                          Math.min(
                                            i === 0 ? 99 : 59,
                                            Math.floor(Number(e.target.value)),
                                          ),
                                        ),
                                      })
                                    }
                                  />
                                  <span>{['giờ', 'phút', 'giây'][i]}</span>
                                </label>
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="presets-label">
                        CHỌN NHANH <span>Một nhịp nhỏ cho ngày dài</span>
                      </div>
                      <div className="presets">
                        {presets.map((sec) => (
                          <button
                            key={sec}
                            className={seconds === sec ? 'active' : ''}
                            onClick={() =>
                              settings({
                                hours: 0,
                                minutes: Math.floor(sec / 60),
                                seconds: sec % 60,
                              })
                            }
                          >
                            {sec < 60 ? `${sec} giây` : `${sec / 60} phút`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="card-bottom">
                    <div className="sound-control">
                      <button
                        className="icon-button"
                        aria-label={s.muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
                        onClick={() => settings({ muted: !s.muted })}
                      >
                        {s.muted ? (
                          <VolumeX size={16} />
                        ) : (
                          <Volume2 size={16} />
                        )}
                      </button>
                      <input
                        aria-label="Âm lượng"
                        type="range"
                        min="0"
                        max="100"
                        value={s.volume}
                        onChange={(e) =>
                          settings({ volume: Number(e.target.value) })
                        }
                      />
                      <span>{s.muted ? 'Tắt tiếng' : `${s.volume}%`}</span>
                      <button
                        className="text-button sound-test"
                        onClick={async () => {
                          if (await unlockAudio())
                            if (!alarm)
                              playSound('bell', s.muted ? 0 : s.volume);
                            else
                              announce(
                                'Trình duyệt chưa cho phép phát âm thanh.',
                              );
                        }}
                      >
                        Nghe thử
                      </button>
                    </div>
                    <span className="sound-caption">
                      <Headphones size={13} /> Một chút yên tĩnh, nhiều hơn tập
                      trung
                    </span>
                  </div>
                </section>
                {mode === 'study' && (
                  <SessionEditor
                    sessions={s.sessions}
                    disabled={!!run}
                    onChange={(sessions) => settings({ sessions })}
                    loop={s.loop}
                    onLoop={(loop) => settings({ loop })}
                  />
                )}
                <div className="under-card">
                  <span>
                    <Check size={13} /> Tự động lưu trên thiết bị
                  </span>
                  <span>
                    <Expand size={13} /> Không gian tối giản cho tâm trí
                  </span>
                </div>

                <div className="quiet-quote">
                  <span>“</span>
                  <p>
                    Không cần làm tất cả. Chỉ cần trọn vẹn với điều đang làm.
                  </p>
                  <small>LỘC BOY ĐẢO</small>
                </div>
              </div>
              {taskState.tasks.find(
                (t) => t.id === (run?.taskId || selectedTask),
              ) && (
                <FocusDetails
                  key={run?.taskId || selectedTask}
                  task={taskState.tasks.find(
                    (t) => t.id === (run?.taskId || selectedTask),
                  )!}
                  change={changeTask}
                  snapshot={data.snapshot}
                  blockId={run?.blockId || selectedBlock}
                  reviews={reviewState.reviews}
                  reviewError={reviewState.error}
                  saveReview={saveReview}
                />
              )}
              <div className="workspace-history">
                <History
                  history={data.snapshot.history}
                  onClear={() => setConfirm('clear')}
                />
              </div>
            </div>
          </>
        )}
      </main>
      <footer>
        <a className="footer-brand" href="#">
          LBD FOCUS <span>© {new Date().getFullYear()} Lộc Boy Đảo</span>
        </a>
        <p>
          Được tạo nên cho những phút giây có ý nghĩa.
          <ArrowUpRight size={13} />
        </p>
      </footer>
      <div className="browser-note">
        Giữ trang mở để nhận âm báo. Trình duyệt đóng hoặc thiết bị ngủ có thể
        làm gián đoạn thông báo.
      </div>
      {alarm &&
        createPortal(
          <section
            className="alarm-banner"
            role="alert"
            aria-label="Thông báo hết giờ"
          >
            <div>
              <strong>Đã hết giờ</strong>
              <p>{alarm.message}</p>
              <small>
                {s.muted || s.volume === 0 || alarm.sound === 'silent'
                  ? 'Âm thanh đang tắt.'
                  : 'Chuông lặp đến khi bạn tắt. Trình duyệt có thể hạn chế âm thanh khi chạy nền hoặc khóa màn hình.'}
              </small>
            </div>
            <button className="button primary" onClick={silenceAlarm}>
              Tắt chuông
            </button>
          </section>,
          document.fullscreenElement ?? document.body,
        )}
      {notice && (
        <div className="toast" role="status">
          <span className="toast-dot" />
          {notice}
          <button
            className="icon-button"
            aria-label="Đóng thông báo"
            onClick={() => setNotice('')}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {storageError && (
        <div className="storage-error" role="alert">
          Không lưu được dữ liệu. Kiểm tra dung lượng hoặc quyền lưu trữ của
          trình duyệt; dữ liệu hiện tại chỉ giữ trong lần mở này.
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setConfirm(null);
              if (e.key === 'Tab') {
                const buttons = e.currentTarget.querySelectorAll('button');
                const first = buttons[0],
                  last = buttons[buttons.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <h2 id="dialog-title">
              {confirm === 'clear'
                ? 'Xóa toàn bộ lịch sử?'
                : 'Kết thúc phiên hiện tại?'}
            </h2>
            <p>
              {confirm === 'clear'
                ? 'Thao tác này không thể hoàn tác. Bạn có thể xuất CSV để giữ lại trước khi xóa.'
                : 'Phiên hiện tại sẽ được lưu vào lịch sử với trạng thái dừng sớm.'}
            </p>
            <div className="modal-actions">
              <button
                autoFocus
                className="button outline"
                onClick={() => setConfirm(null)}
              >
                Quay lại
              </button>
              <button
                className="button primary"
                onClick={() => {
                  if (confirm === 'stop') stop();
                  else {
                    snap({ ...dataRef.current.snapshot, history: [] });
                    setConfirm(null);
                  }
                }}
              >
                {confirm === 'clear' ? 'Xóa lịch sử' : 'Kết thúc'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
