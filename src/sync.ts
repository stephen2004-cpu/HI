import type { SupabaseClient } from '@supabase/supabase-js';
import {
  backupAccount,
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
export class WorkspaceSync {
  private stopped = false;
  private busy = false;
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
    this.status = status;
    this.message = message;
    this.changed(status, message, reload);
  }
  private async remote() {
    const { data, error } = await this.client.rpc('lbd_read_workspace');
    if (error) throw error;
    if (
      !data ||
      !Number.isSafeInteger(data.revision) ||
      data.revision < 0 ||
      (data.payload !== null && !validWorkspace(data.payload))
    )
      throw Error('Dữ liệu máy chủ không hợp lệ hoặc khác phiên bản.');
    return data as { revision: number; payload: Workspace | null };
  }
  async start() {
    try {
      recoverIncoming(this.id);
      const local = readMeta(this.id),
        remote = await this.remote();
      if (this.stopped) return;
      if (local.dirty) {
        if (remote.revision !== local.revision)
          this.notify(
            'conflict',
            'Có thay đổi trên thiết bị khác. Bản cục bộ được giữ nguyên.',
          );
        else this.notify('pending', 'Có thay đổi đang chờ đồng bộ.');
      } else if (
        remote.revision !== local.revision &&
        readWorkspace(this.id).timer.snapshot.run
      ) {
        this.notify(
          'remote-waiting',
          'Có bản mới trên máy chủ nhưng Timer cục bộ đang chạy. Chọn bản muốn dùng; chưa ghi đè.',
        );
      } else {
        storeWorkspace(this.id, remote.payload ?? emptyWorkspace());
        writeMeta(this.id, { revision: remote.revision, dirty: false });
        this.notify('synced', 'Đã tải dữ liệu tài khoản.', true);
      }
    } catch {
      this.notify(
        'error',
        'Chưa tải được tài khoản. Bản cục bộ được giữ; kiểm tra mạng, cấu hình và migration.',
      );
    }
    if (!this.stopped) this.timer = setInterval(() => void this.tick(), 3000);
  }
  localChanged() {
    if (
      this.stopped ||
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
      const meta = readMeta(this.id);
      if (meta.dirty) {
        const snapshot = readWorkspace(this.id),
          serialized = JSON.stringify(snapshot);
        const { data, error } = await this.client.rpc('lbd_commit_workspace', {
          expected_revision: meta.revision,
          payload: snapshot,
        });
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
              'Hai thiết bị có thay đổi khác nhau. Chưa ghi đè bản nào.',
            );
            return;
          }
          throw error;
        }
        if (!Number.isSafeInteger(data)) throw Error('Invalid revision');
        const stillDirty =
          JSON.stringify(readWorkspace(this.id)) !== serialized;
        writeMeta(this.id, { revision: data, dirty: stillDirty });
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
            this.notify('conflict', 'Có thay đổi mới trong lúc nhận dữ liệu.');
            return;
          }
          const editing =
            typeof document !== 'undefined' &&
            document.activeElement?.matches(
              'input,textarea,select,[contenteditable=true]',
            ) &&
            document.activeElement.closest('main');
          if (readWorkspace(this.id).timer.snapshot.run || editing) {
            this.notify(
              'remote-waiting',
              'Thiết bị khác vừa thay đổi dữ liệu khi bạn đang làm việc. Hãy quyết định bản muốn dùng; chưa ghi đè.',
            );
            return;
          }
          storeWorkspace(this.id, remote.payload ?? emptyWorkspace());
          writeMeta(this.id, { revision: remote.revision, dirty: false });
          this.notify('synced', 'Đã nhận dữ liệu từ thiết bị khác.', true);
        } else if (this.status === 'error')
          this.notify('synced', 'Kết nối đã khôi phục.');
      }
    } catch {
      this.notify(
        'error',
        'Chưa đồng bộ được. Dữ liệu chờ gửi vẫn còn trên thiết bị; thử lại khi có mạng.',
      );
    } finally {
      this.busy = false;
    }
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
  }
}
