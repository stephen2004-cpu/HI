/** Read before the SDK consumes/cleans its callback URL. Never log these values. */
export function recoveryLocation(href: string) {
  const url = new URL(href),
    hash = new URLSearchParams(url.hash.slice(1));
  const value = (key: string) => url.searchParams.get(key) ?? hash.get(key);
  return {
    requested:
      value('auth') === 'recovery' ||
      value('type') === 'recovery' ||
      !!value('error') ||
      !!value('error_code'),
    failed: !!(
      value('error') ||
      value('error_code') ||
      value('error_description')
    ),
    code: value('code'),
    implicit:
      value('type') === 'recovery' &&
      !!value('access_token') &&
      !!value('refresh_token'),
    hasCredentials: !!(
      value('code') ||
      value('access_token') ||
      value('refresh_token')
    ),
  };
}
export function cleanRecoveryUrl(href: string, recovery: boolean) {
  const url = new URL(href);
  const sensitive = [
    'access_token',
    'refresh_token',
    'provider_token',
    'provider_refresh_token',
    'token',
    'token_hash',
    'code',
    'error',
    'error_code',
    'error_description',
    'expires_in',
    'expires_at',
    'token_type',
    'type',
    'flow_id',
  ];
  const hash = new URLSearchParams(url.hash.slice(1));
  if (sensitive.some((key) => hash.has(key))) url.hash = '';
  for (const key of sensitive) url.searchParams.delete(key);
  if (recovery) url.searchParams.set('auth', 'recovery');
  else if (url.searchParams.get('auth') === 'recovery')
    url.searchParams.delete('auth');
  return url.pathname + url.search + url.hash;
}
export function passwordProblem(password: string, confirmation: string) {
  if (password.length < 8) return 'Mật khẩu mới cần ít nhất 8 ký tự.';
  if (password !== confirmation) return 'Hai mật khẩu chưa trùng nhau.';
  return '';
}
