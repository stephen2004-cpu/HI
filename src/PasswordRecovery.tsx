import { useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase, recoveryCallback } from './supabase';
import {
  cleanRecoveryUrl,
  passwordProblem,
  recoveryLocation,
} from './recovery';

const recoveryKey = 'lbd-password-recovery-user';
function remember(userId: string | null) {
  try {
    if (userId) sessionStorage.setItem(recoveryKey, userId);
    else sessionStorage.removeItem(recoveryKey);
  } catch {
    /* Recovery still works when sessionStorage is unavailable. */
  }
}
function remembered() {
  try {
    return sessionStorage.getItem(recoveryKey);
  } catch {
    return null;
  }
}
function clean(active: boolean) {
  history.replaceState(
    history.state,
    '',
    cleanRecoveryUrl(location.href, active),
  );
}
// Share callback processing across StrictMode mounts: authorization codes are one-use.
let initialization: Promise<{ error: unknown }> | undefined;
function initialize() {
  return (initialization ??= (async () => {
    if (!supabase) return { error: true };
    const result = await supabase.auth.initialize();
    if (
      recoveryCallback.code &&
      recoveryCallback.requested &&
      !recoveryCallback.failed
    ) {
      // The existing email flow is implicit. Also accept PKCE callbacks when a
      // matching verifier exists in this browser; never exchange a code twice.
      const exchanged = await supabase.auth.exchangeCodeForSession(
        recoveryCallback.code,
      );
      return { error: exchanged.error };
    }
    return result;
  })());
}

type RecoveryState = 'checking' | 'form' | 'invalid' | 'done' | null;
export default function PasswordRecovery({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<RecoveryState>(
      recoveryCallback.requested ? 'checking' : null,
    ),
    [initialized, setInitialized] = useState(!supabase),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const recoveryUser = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase) {
      if (recoveryCallback.requested) {
        clean(true);
        setState('invalid');
      }
      return;
    }
    let live = true;
    // An email link can target the already-open callback page and change only
    // its fragment. The SDK parses URL credentials only during initialization.
    const hashChanged = () => {
      const callback = recoveryLocation(location.href);
      if (callback.requested && (callback.hasCredentials || callback.failed))
        location.reload();
    };
    window.addEventListener('hashchange', hashChanged);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!live) return;
      if (
        event === 'PASSWORD_RECOVERY' &&
        session &&
        !recoveryCallback.failed
      ) {
        recoveryUser.current = session.user.id;
        remember(session.user.id);
        clean(true);
        setState('form');
      } else if (event === 'SIGNED_OUT' && recoveryUser.current) {
        recoveryUser.current = null;
        remember(null);
        setPassword('');
        setConfirmation('');
        setState((current) => (current === 'done' ? current : 'invalid'));
      }
    });
    void (async () => {
      try {
        const result = await initialize();
        const {
          data: { session },
        } = await supabase!.auth.getSession();
        if (!live) return;
        if (recoveryCallback.requested) {
          const callbackOk =
            !result.error &&
            !recoveryCallback.failed &&
            (recoveryCallback.implicit ||
              !!recoveryCallback.code ||
              (!recoveryCallback.hasCredentials &&
                remembered() === session?.user.id));
          if (callbackOk && session) {
            recoveryUser.current = session.user.id;
            remember(session.user.id);
            setState('form');
          } else {
            remember(null);
            setState('invalid');
          }
          clean(true);
        }
      } catch {
        if (live && recoveryCallback.requested) {
          clean(true);
          setState('invalid');
        }
      } finally {
        if (live) setInitialized(true);
      }
    })();
    return () => {
      live = false;
      window.removeEventListener('hashchange', hashChanged);
      data.subscription.unsubscribe();
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, confirmation);
    if (problem) {
      setMessage(problem);
      return;
    }
    if (!supabase || !recoveryUser.current || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const {
        data: { user },
        error: sessionError,
      } = await supabase.auth.getUser();
      if (
        sessionError &&
        (sessionError.status === 0 || (sessionError.status ?? 0) >= 500)
      ) {
        setMessage(
          'Chưa kiểm tra được phiên đăng nhập. Kiểm tra kết nối và thử lại.',
        );
        return;
      }
      if (sessionError || user?.id !== recoveryUser.current) {
        remember(null);
        setState('invalid');
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (
          error.status === 401 ||
          error.status === 403 ||
          [
            'session_not_found',
            'session_expired',
            'refresh_token_not_found',
          ].includes(error.code ?? '')
        ) {
          remember(null);
          setState('invalid');
        } else {
          setMessage(
            error.code === 'same_password'
              ? 'Mật khẩu mới phải khác mật khẩu cũ.'
              : error.code === 'weak_password'
                ? 'Mật khẩu chưa đáp ứng chính sách bảo mật của tài khoản. Hãy dùng mật khẩu dài hơn, có chữ hoa, chữ thường, số và ký hiệu.'
                : 'Chưa lưu được mật khẩu. Kiểm tra kết nối và thử lại; nếu link hết hạn, hãy gửi yêu cầu mới.',
          );
        }
        return;
      }
      setPassword('');
      setConfirmation('');
      remember(null);
      setState('done');
    } catch {
      setMessage('Chưa kết nối được để lưu mật khẩu. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  async function returnToLogin() {
    if (busy) return;
    setBusy(true);
    try {
      // End only this browser's recovery login; application storage is untouched.
      if (supabase) {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) {
          setMessage(
            'Chưa kết thúc được phiên khôi phục. Kiểm tra kết nối và thử lại.',
          );
          return;
        }
      }
      remember(null);
      clean(false);
      // Reload with no callback credentials; the account panel opens in login mode.
      const url = new URL(location.href);
      url.searchParams.set('auth', 'login');
      location.replace(url.pathname + url.search);
    } catch {
      setMessage(
        'Chưa kết thúc được phiên khôi phục. Kiểm tra kết nối và thử lại.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!initialized || state === 'checking')
    return (
      <main className="account-panel recovery-panel" aria-busy="true">
        <p role="status">Đang kiểm tra liên kết khôi phục…</p>
      </main>
    );
  if (!state) return children;
  return (
    <main className="account-panel recovery-panel">
      <p className="recovery-brand">LBD FOCUS</p>
      {state === 'invalid' ? (
        <>
          <h1>Liên kết khôi phục không hợp lệ</h1>
          <p role="alert">
            Liên kết đã hết hạn, đã được sử dụng hoặc không đủ thông tin xác
            thực. Vui lòng gửi lại email khôi phục từ màn hình đăng nhập.
          </p>
          {!supabase && <p>Chưa cấu hình Supabase cho môi trường này.</p>}
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void returnToLogin()}
          >
            Về màn hình đăng nhập
          </button>
        </>
      ) : state === 'done' ? (
        <>
          <h1>Đổi mật khẩu thành công</h1>
          <p role="status">
            Mật khẩu mới đã được lưu. Bạn có thể đăng nhập bằng mật khẩu mới; dữ
            liệu làm việc vẫn được giữ nguyên.
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void returnToLogin()}
          >
            Về màn hình đăng nhập
          </button>
        </>
      ) : (
        <>
          <h1>Đặt mật khẩu mới</h1>
          <p>
            Nhập mật khẩu mới cho tài khoản của bạn. Không cần nhập mật khẩu cũ.
          </p>
          <form onSubmit={save}>
            <label>
              Mật khẩu mới
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              Xác nhận mật khẩu
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                disabled={busy}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? 'Đang lưu…' : 'Lưu mật khẩu'}
            </button>
          </form>
        </>
      )}
      {message && <p role="alert">{message}</p>}
    </main>
  );
}
