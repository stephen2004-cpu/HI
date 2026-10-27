import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import App from './App';
import { supabase } from './supabase';
import { WorkspaceSync, type SyncStatus } from './sync';
import {
  downloadBackup,
  readMeta,
  setWorkspaceUser,
  writeMeta,
  scopedKey,
  documentKeys,
  workspaceUser,
} from './workspaceStorage';
import {
  backupAccount,
  mergeGuest,
  readWorkspace,
  storeWorkspace,
  parseBackup,
  type Workspace,
} from './workspace';
export default function AccountApp() {
  const [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(!supabase),
    [readyScope, setReadyScope] = useState<string | null | undefined>(
      undefined,
    ),
    [generation, setGeneration] = useState(0),
    [status, setStatus] = useState<SyncStatus>('loading'),
    [syncMessage, setSyncMessage] = useState(''),
    [open, setOpen] = useState(false),
    [mode, setMode] = useState<'login' | 'signup'>('login'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false);
  const [importFile, setImportFile] = useState<Workspace | null>(null),
    [fileName, setFileName] = useState('');
  const engine = useRef<WorkspaceSync | null>(null),
    id = session?.user.id ?? null;
  useEffect(() => {
    setImportFile(null);
    setFileName('');
    setConsent(false);
  }, [id]);
  useEffect(() => {
    if (!supabase) return;
    let live = true;
    let seenEvent = false;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (live) {
        seenEvent = true;
        setSession(next);
        setAuthReady(true);
        setConsent(false);
      }
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (live && !seenEvent) {
        if (error)
          setMessage(
            'Không khôi phục được phiên đăng nhập. Dữ liệu cục bộ vẫn được giữ.',
          );
        setSession(data.session);
        setAuthReady(true);
      }
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!authReady) return;
    let live = true;
    setWorkspaceUser(id);
    setReadyScope(undefined);
    setGeneration((n) => n + 1);
    if (!id || !supabase) {
      setReadyScope(null);
      setStatus('synced');
      setSyncMessage('Chế độ khách — dữ liệu chỉ trên thiết bị này.');
      return;
    }
    const sync = new WorkspaceSync(supabase, id, (s, m, reload) => {
      if (!live) return;
      setStatus(s);
      setSyncMessage(m);
      try {
        readWorkspace(id);
        if (
          localStorage.getItem(scopedKey('lbd-focus-v2-timer', id)) !== null &&
          localStorage.getItem(`lbd-account:${id}:incoming`) === null
        )
          setReadyScope(id);
      } catch {
        setReadyScope(undefined);
        setSyncMessage(
          'Không mở được bản cục bộ. Dữ liệu gốc được giữ; có thể sao lưu và dùng bản máy chủ.',
        );
      }
      if (reload) setGeneration((n) => n + 1);
    });
    engine.current = sync;
    const change = () => sync.localChanged();
    window.addEventListener('lbd-workspace-changed', change);
    void sync.start();
    return () => {
      live = false;
      sync.stop();
      engine.current = null;
      window.removeEventListener('lbd-workspace-changed', change);
    };
  }, [id, authReady]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage('');
    try {
      const { error, data } =
        mode === 'signup'
          ? await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: location.origin + location.pathname },
            })
          : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setPassword('');
      setMessage(
        mode === 'signup' && !data.session
          ? 'Đã gửi yêu cầu đăng ký. Kiểm tra email xác nhận nếu dự án yêu cầu.'
          : 'Đăng nhập thành công. Dữ liệu khách chưa được nhập vào tài khoản.',
      );
    } catch {
      setMessage(
        'Không đăng nhập/đăng ký được. Kiểm tra email, mật khẩu, email xác nhận và cấu hình dự án.',
      );
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    if (!supabase) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setMode('login');
      setPassword('');
      setConsent(false);
      setMessage(
        'Đã đăng xuất trên thiết bị này. Dữ liệu tài khoản và dữ liệu khách vẫn được giữ.',
      );
    } catch {
      setMessage('Chưa đăng xuất được. Hãy thử lại.');
    } finally {
      setBusy(false);
    }
  };
  const importGuest = async () => {
    if (
      !id ||
      !consent ||
      !engine.current ||
      readyScope !== id ||
      ['conflict', 'remote-waiting', 'loading'].includes(status)
    )
      return;
    setBusy(true);
    try {
      const guest = importFile ?? readWorkspace(null),
        account = readWorkspace(id);
      backupAccount(id, account);
      const merged = mergeGuest(account, guest);
      storeWorkspace(id, merged);
      writeMeta(id, { ...readMeta(id), dirty: true });
      setGeneration((n) => n + 1);
      engine.current.localChanged();
      await engine.current.tick();
      setConsent(false);
      setMessage(
        'Đã nhập vào vùng tài khoản trên thiết bị; xem trạng thái đồng bộ. Bản khách gốc được giữ nguyên.',
      );
    } catch {
      setMessage(
        'Không nhập được dữ liệu. Bản khách và bản sao lưu tài khoản vẫn được giữ.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="account-bar">
        <span>
          {id ? `Tài khoản: ${session?.user.email}` : 'Đang dùng chế độ khách'}
        </span>
        <button className="button outline" onClick={() => setOpen(!open)}>
          {id ? 'Tài khoản & đồng bộ' : 'Đăng nhập / Đăng ký'}
        </button>
        {id && (
          <span role="status" className={`sync-status ${status}`}>
            {syncMessage}
          </span>
        )}
      </div>
      {open && (
        <section className="account-panel" aria-label="Tài khoản Supabase">
          <button className="text-button" onClick={() => setOpen(false)}>
            Đóng tài khoản
          </button>
          {id ? (
            <>
              <h2>Tài khoản & đồng bộ</h2>
              <p>
                User ID: <code>{id}</code>
              </p>
              <p>{syncMessage}</p>
              <button
                className="button outline"
                disabled={busy}
                onClick={() => void engine.current?.tick()}
              >
                Đồng bộ ngay
              </button>
              <button
                className="button outline"
                disabled={busy}
                onClick={() => {
                  if (
                    readMeta(id).dirty &&
                    !window.confirm(
                      'Còn dữ liệu chưa đồng bộ. Bản cục bộ sẽ được giữ để gửi khi đăng nhập lại. Vẫn đăng xuất?',
                    )
                  )
                    return;
                  void logout();
                }}
              >
                Đăng xuất
              </button>
              {['conflict', 'remote-waiting', 'error'].includes(status) && (
                <div role="alert">
                  <p>
                    Cần chọn bản dữ liệu. Bản bị thay thế sẽ được sao lưu cục bộ
                    trước khi áp dụng. Có thể xuất JSON trước.
                  </p>
                  <button
                    className="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Dùng bản máy chủ cho thiết bị này? Bản cục bộ được sao lưu, Timer có thể thay đổi.',
                        )
                      )
                        void engine.current?.useServer();
                    }}
                  >
                    Dùng bản máy chủ
                  </button>
                  <button
                    className="button"
                    disabled={readyScope !== id}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Ghi bản cục bộ lên máy chủ? Bản máy chủ hiện tại được sao lưu trên thiết bị.',
                        )
                      )
                        void engine.current?.useLocal();
                    }}
                  >
                    Dùng bản thiết bị này
                  </button>
                </div>
              )}
              <h3>Nhập dữ liệu khách vào tài khoản</h3>
              <p>
                Chỉ thực hiện khi bạn xác nhận. Bản ghi trùng ID giữ bản trong
                tài khoản. Timer khách đang chạy được giữ ở chế độ khách, không
                tự nhập vào Timer tài khoản.
              </p>
              <button
                className="button outline"
                onClick={() => {
                  try {
                    downloadBackup(
                      {
                        version: 1,
                        scope: 'guest',
                        exportedAt: new Date().toISOString(),
                        data: Object.fromEntries(
                          ['lbd-focus-v1', ...documentKeys].map((k) => [
                            k,
                            localStorage.getItem(k),
                          ]),
                        ),
                      },
                      'lbd-guest-backup.json',
                    );
                  } catch {
                    setMessage(
                      'Dữ liệu khách không đọc được; chưa xuất hoặc nhập.',
                    );
                  }
                }}
              >
                Sao lưu dữ liệu khách
              </button>
              <button
                className="button outline"
                onClick={() => {
                  try {
                    downloadBackup(
                      { version: 1, userId: id, data: readWorkspace(id) },
                      'lbd-account-backup.json',
                    );
                  } catch {
                    setMessage('Không xuất được bản sao lưu.');
                  }
                }}
              >
                Sao lưu tài khoản
              </button>
              <label>
                Nhập tệp sao lưu JSON
                <input
                  key={id}
                  type="file"
                  accept="application/json,.json"
                  onChange={async (e) => {
                    setConsent(false);
                    const file = e.target.files?.[0];
                    setImportFile(null);
                    setFileName('');
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) {
                      setMessage('Tệp quá lớn (tối đa 10 MB).');
                      return;
                    }
                    try {
                      const source = parseBackup(await file.text());
                      if (workspaceUser() !== id) return;
                      setImportFile(source);
                      setFileName(file.name);
                      setMessage(
                        'Đã kiểm tra tệp; chưa nhập dữ liệu. Cần xác nhận bên dưới.',
                      );
                    } catch {
                      setMessage(
                        'Tệp không hợp lệ hoặc khác phiên bản. Chưa nhập dữ liệu.',
                      );
                    }
                  }}
                />
              </label>
              {fileName && (
                <p>
                  Tệp đã chọn: {fileName}{' '}
                  <button
                    className="text-button"
                    onClick={() => {
                      setImportFile(null);
                      setFileName('');
                      setConsent(false);
                    }}
                  >
                    Dùng dữ liệu khách trên thiết bị
                  </button>
                </p>
              )}
              <label className="import-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                {importFile
                  ? 'Tôi đồng ý nhập dữ liệu từ tệp đã chọn vào tài khoản đang đăng nhập.'
                  : 'Tôi đồng ý nhập dữ liệu khách trên thiết bị này vào tài khoản đang đăng nhập.'}
              </label>
              <button
                className="button primary"
                disabled={
                  busy ||
                  !consent ||
                  readyScope !== id ||
                  ['loading', 'conflict', 'remote-waiting'].includes(status)
                }
                onClick={() => void importGuest()}
              >
                {importFile
                  ? 'Xác nhận nhập tệp vào tài khoản'
                  : 'Xác nhận nhập dữ liệu khách'}
              </button>
            </>
          ) : (
            <>
              <h2>{mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</h2>
              {!supabase && (
                <p role="alert">
                  Chưa cấu hình Supabase. Cần VITE_SUPABASE_URL và
                  VITE_SUPABASE_PUBLISHABLE_KEY cho môi trường Preview. Timer
                  khách vẫn hoạt động.
                </p>
              )}
              <div>
                <button
                  className="button outline"
                  onClick={() => {
                    setMode('login');
                    setMessage('');
                  }}
                >
                  Chọn Đăng nhập
                </button>
                <button
                  className="button outline"
                  onClick={() => {
                    setMode('signup');
                    setMessage('');
                  }}
                >
                  Chọn Đăng ký
                </button>
              </div>
              <form onSubmit={submit}>
                <label>
                  Email
                  <input
                    type="email"
                    required
                    value={email}
                    autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Mật khẩu
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    autoComplete={
                      mode === 'signup' ? 'new-password' : 'current-password'
                    }
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button className="button primary" disabled={!supabase || busy}>
                  {mode === 'login'
                    ? 'Đăng nhập bằng email'
                    : 'Tạo tài khoản email'}
                </button>
              </form>
              <p>
                Dữ liệu khách không tự gửi lên tài khoản. Google chưa được bật.
              </p>
            </>
          )}
          {message && <p role="status">{message}</p>}
        </section>
      )}
      {authReady && readyScope === id ? (
        <App key={`${id ?? 'guest'}:${generation}`} />
      ) : (
        <p role="status" className="account-loading">
          Đang mở vùng dữ liệu…
        </p>
      )}
    </>
  );
}
