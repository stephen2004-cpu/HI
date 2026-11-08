import { mergeHabitDeletions } from './habits';
import { mergeTaskTombstones } from './taskRecurrence';
import { validTask, type Task } from './tasks';
import {
  acknowledgeHabitDeletions,
  noteHabitSyncPhase,
} from './habitDeletionStatus';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  backupAccount,
  hasCachedWorkspace,
  emptyWorkspace,
  readWorkspace,
  recoverIncoming,
  storeWorkspace,
  validWorkspace,
  workspaceFingerprint,
  type Workspace,
} from './workspace';
import {
  readMeta,
  writeMeta,
  documentKeys,
  scopedKey,
} from './workspaceStorage';
export type SyncStatus =
  'loading' | 'synced' | 'pending' | 'error' | 'conflict' | 'remote-waiting';
export const SYNC_READ_TIMEOUT_MS = 12000;
export const SYNC_WRITE_TIMEOUT_MS = 20000;
export const SYNC_MAX_BACKOFF_MS = 60000;
class SyncTimeoutError extends Error {}
export class WorkspaceSync {
  private stopped = false;
  private busy = false;
  private initializing = false;
  private requests = new Set<AbortController>();
  private failures = 0;
  private nextAutomaticAttempt = 0;
  private serverSnapshot:
    | { revision: number; fingerprint: string; payload: Workspace | null }
    | undefined;
  private acceptedSnapshot:
    { revision: number; fingerprint: string; confirmed: boolean } | undefined;
  private automaticTick = () => {
    if (Date.now() >= this.nextAutomaticAttempt) void this.tick();
  };
  private resumed = () => {
    if (
      typeof document === 'undefined' ||
      document.visibilityState !== 'hidden'
    )
      this.automaticTick();
  };
  private reconnected = () => {
    if (
      typeof document === 'undefined' ||
      document.visibilityState !== 'hidden' ||
      readMeta(this.id).dirty
    ) {
      this.nextAutomaticAttempt = 0;
      void this.tick();
    }
  };
  private timer: ReturnType<typeof setInterval> | undefined;
  status: SyncStatus = 'loading';
  message = 'Đang tải tài khoản…';
  constructor(
    private client: SupabaseClient,
    readonly id: string,
    private changed: (
      status: SyncStatus,
      message: string,
      reload?: boolean,
    ) => void,
  ) {}
  private notify(status: SyncStatus, message: string, reload = false) {
    if (this.stopped) return;
    if (status === 'error') {
      this.failures = Math.min(this.failures + 1, 8);
      this.nextAutomaticAttempt =
        Date.now() + Math.min(SYNC_MAX_BACKOFF_MS, 3000 * 2 ** this.failures);
    } else if (status === 'synced') {
      this.failures = 0;
      this.nextAutomaticAttempt = 0;
    }
    noteHabitSyncPhase(this.id, status);
    this.status = status;
    this.message = message;
    this.changed(status, message, reload);
  }
  private async request<T>(
    work: (signal: AbortSignal) => Promise<T>,
    milliseconds = SYNC_READ_TIMEOUT_MS,
  ): Promise<T> {
    const controller = new AbortController();
    this.requests.add(controller);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      return await Promise.race([
        work(controller.signal),
        new Promise<never>((_, reject) => {
          abort = () => reject(new Error('Request stopped'));
          controller.signal.addEventListener('abort', abort, { once: true });
          timeout = setTimeout(() => {
            reject(new SyncTimeoutError('Sync request timed out'));
            controller.abort();
          }, milliseconds);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      if (abort) controller.signal.removeEventListener('abort', abort);
      this.requests.delete(controller);
    }
  }
  private rpc(
    name: string,
    signal: AbortSignal,
    args?: Record<string, unknown>,
  ) {
    const call = this.client.rpc(name, args);
    return typeof call.abortSignal === 'function'
      ? call.abortSignal(signal)
      : call;
  }
  private editing() {
    return (
      typeof document !== 'undefined' &&
      document.activeElement?.matches(
        'input,textarea,select,[contenteditable=true]',
      ) &&
      document.activeElement.closest('main')
    );
  }
  private async remote() {
    return this.request(async (signal) => {
      const { data, error } = await this.rpc('lbd_read_workspace', signal);
      if (signal.aborted || this.stopped) throw Error('Request stopped');
      if (error) throw error;
      if (
        !data ||
        !Number.isSafeInteger(data.revision) ||
        data.revision < 0 ||
        (data.payload !== null && !validWorkspace(data.payload))
      )
        throw Error('Dữ liệu máy chủ không hợp lệ hoặc khác phiên bản.');
      if (
        data.payload &&
        [
          ...data.payload.tasks.tasks,
          ...readWorkspace(this.id).tasks.tasks,
        ].some(
          (t: Task) =>
            t.repeat || t.repeatSeriesId || t.deletedAt !== undefined,
        )
      ) {
        const markers = await this.rpc('lbd_read_task_deletions', signal);
        if (signal.aborted || this.stopped) throw Error('Request stopped');
        if (markers.error) {
          if (!['PGRST202', '42883'].includes(markers.error.code))
            throw markers.error;
        } else {
          if (
            !Array.isArray(markers.data) ||
            !markers.data.every(
              (t) => validTask(t) && t.deletedAt !== undefined,
            )
          )
            throw Error('Invalid server Task tombstones.');
          data.payload.tasks.tasks = mergeTaskTombstones(
            data.payload.tasks.tasks,
            markers.data,
          );
        }
      }
      if (!this.stopped) {
        acknowledgeHabitDeletions(this.id, data.payload?.habits.habits ?? []);
        this.serverSnapshot = {
          revision: data.revision,
          fingerprint: workspaceFingerprint(data.payload ?? emptyWorkspace()),
          payload: data.payload,
        };
      }
      return data as { revision: number; payload: Workspace | null };
    });
  }
  private acknowledgeUnchanged(): boolean {
    const meta = readMeta(this.id);
    if (!meta.dirty) return false;
    const fingerprint = workspaceFingerprint(readWorkspace(this.id));
    const server = this.serverSnapshot;
    if (
      server &&
      server.revision >= meta.revision &&
      server.fingerprint === fingerprint
    ) {
      writeMeta(this.id, { revision: server.revision, dirty: false });
    } else if (server && server.revision > meta.revision) {
      return false;
    } else if (
      this.acceptedSnapshot?.confirmed &&
      this.acceptedSnapshot.revision === meta.revision &&
      this.acceptedSnapshot.fingerprint === fingerprint
    ) {
      writeMeta(this.id, { revision: meta.revision, dirty: false });
    } else return false;
    this.notify('synced', 'Đã đồng bộ; không có thay đổi mới cần gửi.');
    return true;
  }
  private retainRemoteDeletions(payload: Workspace | null) {
    if (!payload) return false;
    const local = readWorkspace(this.id);
    const habits = mergeHabitDeletions(
      local.habits.habits,
      payload.habits.habits,
    );
    const tasks = mergeTaskTombstones(local.tasks.tasks, payload.tasks.tasks);
    if (
      JSON.stringify(habits) === JSON.stringify(local.habits.habits) &&
      JSON.stringify(tasks) === JSON.stringify(local.tasks.tasks)
    )
      return false;
    backupAccount(this.id, local);
    storeWorkspace(this.id, {
      ...local,
      habits: { version: 1, habits },
      tasks: { version: 1, tasks },
    });
    return true;
  }
  async start() {
    if (this.stopped || this.busy) return;
    this.busy = true;
    this.initializing = true;
    const cached = hasCachedWorkspace(this.id);
    this.notify(
      'loading',
      cached
        ? 'Đang kiểm tra bản mới trên máy chủ; bạn có thể dùng dữ liệu đã lưu trên thiết bị.'
        : 'Đang tải dữ liệu tài khoản từ máy chủ…',
    );
    try {
      recoverIncoming(this.id);
      if (!cached && hasCachedWorkspace(this.id))
        this.notify(
          'loading',
          'Đang kiểm tra bản mới trên máy chủ; bạn có thể dùng dữ liệu đã lưu trên thiết bị.',
        );
      const remote = await this.remote();
      if (this.stopped) return;
      const local = readMeta(this.id);
      const current = readWorkspace(this.id);
      const same =
        hasCachedWorkspace(this.id) &&
        workspaceFingerprint(current) ===
          workspaceFingerprint(remote.payload ?? emptyWorkspace());
      if (local.dirty) {
        const deletedChanged = this.retainRemoteDeletions(remote.payload);
        if (this.acknowledgeUnchanged()) {
          if (deletedChanged)
            this.notify('synced', 'Đã đồng bộ dấu xóa từ máy chủ.', true);
        } else if (remote.revision !== local.revision)
          this.notify(
            'conflict',
            'Có thay đổi trên thiết bị khác. Giữ các thay đổi cục bộ còn lại và dấu xóa vĩnh viễn từ máy chủ.',
            deletedChanged,
          );
        else
          this.notify(
            'pending',
            'Có thay đổi đang chờ đồng bộ.',
            deletedChanged,
          );
      } else if (!same && (current.timer.snapshot.run || this.editing())) {
        this.notify(
          'remote-waiting',
          'Có bản mới trên máy chủ khi bạn đang dùng Timer hoặc chỉnh sửa. Giữ dấu xóa vĩnh viễn; chọn bản cho các thay đổi còn lại.',
          this.retainRemoteDeletions(remote.payload),
        );
      } else if (same) {
        writeMeta(this.id, { revision: remote.revision, dirty: false });
        this.notify('synced', 'Đã kiểm tra: dữ liệu trên thiết bị đã đồng bộ.');
      } else {
        storeWorkspace(this.id, remote.payload ?? emptyWorkspace());
        writeMeta(this.id, { revision: remote.revision, dirty: false });
        this.notify('synced', 'Đã tải dữ liệu tài khoản.', true);
      }
    } catch (error) {
      this.notify(
        'error',
        error instanceof SyncTimeoutError
          ? 'Máy chủ phản hồi quá lâu. Bản cục bộ được giữ; có thể thử tải lại khi kết nối ổn định.'
          : 'Chưa tải được tài khoản. Bản cục bộ được giữ; kiểm tra mạng, cấu hình và migration.',
      );
    } finally {
      this.initializing = false;
      this.busy = false;
    }
    if (!this.stopped) {
      this.timer = setInterval(() => {
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'hidden' &&
          !readMeta(this.id).dirty
        )
          return;
        this.automaticTick();
      }, 3000);
      if (typeof document !== 'undefined')
        document.addEventListener('visibilitychange', this.resumed);
      if (typeof window !== 'undefined')
        window.addEventListener('online', this.reconnected);
    }
  }
  localChanged() {
    if (
      this.stopped ||
      this.initializing ||
      this.status === 'conflict' ||
      this.status === 'remote-waiting'
    )
      return;
    this.notify('pending', 'Đang chờ đồng bộ…');
  }
  async tick() {
    if (
      this.stopped ||
      this.busy ||
      this.status === 'conflict' ||
      this.status === 'remote-waiting'
    )
      return;
    this.busy = true;
    try {
      recoverIncoming(this.id);
      let meta = readMeta(this.id);
      if (meta.dirty && !this.serverSnapshot) {
        // Never queue a blind write after startup failed to read the server.
        await this.remote();
        if (this.stopped) return;
        meta = readMeta(this.id);
      }
      if (meta.dirty) {
        if (this.acknowledgeUnchanged()) return;
        const snapshot = readWorkspace(this.id),
          serialized = workspaceFingerprint(snapshot);
        const hasDeletions =
          snapshot.habits.habits.some((h) => h.deletedAt !== undefined) ||
          snapshot.tasks.tasks.some((t) => t.deletedAt !== undefined);
        const { data, error } = await this.request(
          async (signal) =>
            await this.rpc('lbd_commit_workspace', signal, {
              expected_revision: meta.revision,
              payload: snapshot,
            }),
          SYNC_WRITE_TIMEOUT_MS,
        );
        if (this.stopped) return;
        if (error) {
          if (error.code === '40001') {
            const latest = await this.remote();
            if (this.stopped) return;
            if (
              latest.payload &&
              workspaceFingerprint(latest.payload) ===
                workspaceFingerprint(snapshot) &&
              workspaceFingerprint(readWorkspace(this.id)) ===
                workspaceFingerprint(snapshot)
            ) {
              writeMeta(this.id, { revision: latest.revision, dirty: false });
              this.notify(
                'synced',
                'Hai thiết bị đã ghi cùng kết quả; đã đồng bộ, không tạo phiên trùng.',
              );
              return;
            }
            this.notify(
              'conflict',
              'Hai thiết bị có thay đổi khác nhau. Giữ dấu xóa vĩnh viễn; các thay đổi khác chờ lựa chọn.',
              this.retainRemoteDeletions(latest.payload),
            );
            return;
          }
          throw error;
        }
        if (!Number.isSafeInteger(data)) throw Error('Invalid revision');
        this.acceptedSnapshot = {
          revision: data,
          fingerprint: serialized,
          confirmed: !hasDeletions,
        };
        let stillDirty =
          workspaceFingerprint(readWorkspace(this.id)) !== serialized;
        writeMeta(this.id, { revision: data, dirty: stillDirty });
        // A write/revision alone is not a server acknowledgement of this deletion.
        if (!stillDirty && hasDeletions) {
          const readBack = await this.remote();
          if (this.stopped) return;
          const expected = snapshot.habits.habits.filter(
            (h) => h.deletedAt !== undefined,
          );
          if (
            snapshot.tasks.tasks.some(
              (t) =>
                t.deletedAt !== undefined &&
                !readBack.payload?.tasks.tasks.some(
                  (server) =>
                    server.id === t.id && server.deletedAt === t.deletedAt,
                ),
            ) ||
            expected.some(
              (h) =>
                !readBack.payload?.habits.habits.some(
                  (server) =>
                    server.id === h.id &&
                    server.deletedAt === h.deletedAt &&
                    (server.deletedHistory === true) ===
                      (h.deletedHistory === true),
                ),
            )
          ) {
            writeMeta(this.id, { revision: data, dirty: true });
            throw Error('Server has not confirmed the deletion marker.');
          }
          this.acceptedSnapshot.confirmed = true;
          stillDirty =
            workspaceFingerprint(readWorkspace(this.id)) !== serialized;
          writeMeta(this.id, { revision: data, dirty: stillDirty });
        }
        this.notify(
          stillDirty ? 'pending' : 'synced',
          stillDirty ? 'Có thay đổi mới đang chờ gửi.' : 'Đã đồng bộ.',
        );
      } else {
        const remote = await this.remote();
        if (this.stopped) return;
        if (
          remote.revision !== meta.revision ||
          localStorage.getItem(scopedKey(documentKeys[0], this.id)) === null
        ) {
          const current = readMeta(this.id);
          if (current.dirty) {
            this.notify(
              'conflict',
              'Có thay đổi mới trong lúc nhận dữ liệu.',
              this.retainRemoteDeletions(remote.payload),
            );
            return;
          }
          const editing = this.editing();
          if (readWorkspace(this.id).timer.snapshot.run || editing) {
            this.notify(
              'remote-waiting',
              'Thiết bị khác vừa thay đổi dữ liệu khi bạn đang làm việc. Giữ dấu xóa vĩnh viễn; chọn bản cho các thay đổi còn lại.',
              this.retainRemoteDeletions(remote.payload),
            );
            return;
          }
          storeWorkspace(this.id, remote.payload ?? emptyWorkspace());
          writeMeta(this.id, { revision: remote.revision, dirty: false });
          this.notify('synced', 'Đã nhận dữ liệu từ thiết bị khác.', true);
        } else if (readMeta(this.id).dirty) {
          this.notify('pending', 'Có thay đổi mới đang chờ gửi.');
        } else if (this.status === 'error' || this.status === 'loading')
          this.notify(
            'synced',
            'Đã kiểm tra: dữ liệu trên thiết bị đã đồng bộ.',
          );
      }
    } catch (error) {
      this.notify(
        'error',
        error instanceof SyncTimeoutError
          ? 'Máy chủ phản hồi quá lâu. Dữ liệu chờ gửi vẫn còn trên thiết bị; hãy thử đồng bộ lại.'
          : 'Chưa đồng bộ được. Dữ liệu chờ gửi vẫn còn trên thiết bị; thử lại khi có mạng.',
      );
    } finally {
      this.busy = false;
    }
  }
  async retry() {
    if (
      this.stopped ||
      this.busy ||
      this.status === 'conflict' ||
      this.status === 'remote-waiting'
    )
      return;
    this.notify('loading', 'Đang thử kết nối lại với máy chủ…');
    await this.tick();
  }
  async useServer() {
    if (this.busy) return;
    this.busy = true;
    try {
      localStorage.setItem(
        `lbd-account:${this.id}:raw-backup:${Date.now()}:${crypto.randomUUID()}`,
        JSON.stringify(
          Object.fromEntries(
            documentKeys.map((k) => [
              k,
              localStorage.getItem(scopedKey(k, this.id)),
            ]),
          ),
        ),
      );
      const remote = await this.remote();
      if (this.stopped) return;
      storeWorkspace(this.id, remote.payload ?? emptyWorkspace());
      writeMeta(this.id, { revision: remote.revision, dirty: false });
      this.notify(
        'synced',
        'Đã dùng bản máy chủ; bản cũ được giữ trong sao lưu cục bộ.',
        true,
      );
    } catch {
      this.notify(
        'error',
        'Chưa áp dụng bản máy chủ. Bản cục bộ vẫn được giữ.',
      );
    } finally {
      this.busy = false;
    }
  }
  async useLocal() {
    if (this.busy) return;
    this.busy = true;
    try {
      const remote = await this.remote();
      if (this.stopped) return;
      backupAccount(this.id, remote.payload ?? emptyWorkspace());
      const local = readWorkspace(this.id);
      const habits = mergeHabitDeletions(
        local.habits.habits,
        remote.payload?.habits.habits ?? [],
      );
      const tasks = mergeTaskTombstones(
        local.tasks.tasks,
        remote.payload?.tasks.tasks ?? [],
      );
      if (
        JSON.stringify(habits) !== JSON.stringify(local.habits.habits) ||
        JSON.stringify(tasks) !== JSON.stringify(local.tasks.tasks)
      ) {
        storeWorkspace(this.id, {
          ...local,
          habits: { version: 1, habits },
          tasks: { version: 1, tasks },
        });
        this.notify(
          'pending',
          'Giữ dấu xóa vĩnh viễn từ máy chủ khi dùng bản thiết bị.',
          true,
        );
      }
      writeMeta(this.id, { revision: remote.revision, dirty: true });
      this.notify(
        'pending',
        'Sẽ gửi bản cục bộ theo xác nhận của bạn. Bản máy chủ đã được sao lưu trên thiết bị.',
      );
    } catch {
      this.notify(
        'error',
        'Không đọc được bản máy chủ để sao lưu. Chưa ghi đè.',
      );
    } finally {
      this.busy = false;
    }
    await this.tick();
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    for (const request of this.requests) request.abort();
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.resumed);
    if (typeof window !== 'undefined')
      window.removeEventListener('online', this.reconnected);
  }
}
