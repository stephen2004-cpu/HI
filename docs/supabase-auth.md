# Supabase Auth and cross-device data — V2

## Current architecture

Email/password signup, login and local-device logout use `@supabase/supabase-js`.
Google login is not enabled. Supabase Auth assigns the account UUID; the browser
never creates or chooses a server owner ID. The header account panel shows it.

The existing app still operates with local storage. Guest keys, including
`lbd-focus-v1`, remain untouched by account operations. Account caches have a
`lbd-account:<user UUID>:` prefix. Switching account remounts the workspace after
changing scope, preventing previous React state from being saved into another
account. Logout removes authentication through the SDK, never application data.
Pending edits remain cached under the original account and retry on login.
Browser caches are not encrypted; logout is not a secure erase of a shared device.

SQL tables: `lbd_workspaces`, `lbd_tasks`, `lbd_calendar_blocks`, `lbd_habits`,
`lbd_focus_sessions`, `lbd_reviews`. Every table has a UUID `user_id` referencing
`auth.users`. RLS is enabled and forced; `authenticated` can only select/insert/
update/delete rows where `auth.uid() = user_id`. `anon` has no table/RPC access.
Both RPCs are SECURITY INVOKER with a fixed empty search path. Neither accepts
an owner ID; each uses the verified JWT subject through `auth.uid()`.

`lbd_commit_workspace` saves a complete workspace in a transaction. A row lock
and expected revision reject stale writes (`40001`); an invalid record rolls
back all affected tables. JSON payloads preserve the existing V2 entity formats.
The app polls every 3 seconds and retains local pending data on network errors.
Different simultaneous edits produce a visible conflict: select server or local
explicitly, with a local backup of the displaced version before applying it.
No silent last-write-wins merge is used. Identical concurrent results are
acknowledged without a conflict. Focus record IDs derive from run/session/start,
so two devices completing the same measured session do not create two sessions.
Legacy runs without an ID retain the previous behavior.

Incoming snapshots are validated before applying. An incoming recovery record
protects partial multi-key writes. Invalid caches or incomplete recovery prevent
mounting a fresh account workspace. Remote changes do not reset an active timer
or a form currently being edited; the panel asks which version to use.

## Configure a dedicated Preview project

1. Create/select a non-production Supabase project. Enable email/password signup.
2. Review and run `supabase/migrations/202610270001_auth_workspace.sql` in its SQL
   Editor, or apply it using the official CLI linked to that development project.
   It has only been applied to the isolated local test DB by this task, not to a
   managed project. Do not apply it to a production database without review.
3. Configure Auth Site URL and allowed Redirect URLs for the actual Vercel
   **Preview** origin(s). Signup uses the current origin/path for email redirect.
   Configure confirmation email/SMTP as required. The local test stack auto-
   confirms email; it does not test real email delivery or SMTP configuration.
4. Set these public frontend variables in Vercel for **Preview only**:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable or anon key).
   Also set them locally in ignored `.env.local` when developing against Preview.
   Vite needs a rebuild/restart when they change. See `.env.example`.
5. Never place `service_role`, an `sb_secret_` key, database credentials or an
   admin token in a `VITE_` variable or the browser. Build configuration rejects
   known server-key formats. No admin key is needed by the application.
6. If cloud egress is restricted, add the exact project's Supabase hostname in
   environment network settings. No unknown allowlist is replaced by setup.
7. Verify signup, confirmation, login, CRUD and RLS against that project before
   any Production deployment. This task does not change Vercel Production.

## Existing data and explicit import

A new login does not automatically claim guest data. Export raw guest JSON
before import using the account panel or guest Settings. The panel also supports
old Settings JSON exports and new structured account JSON exports, max 10 MB.
Invalid/version-unknown files are rejected. Auth tokens and unrelated file keys
are never imported. The selected source and consent are cleared on account change.

The account import checkbox and confirmation button are required. Account data
is backed up before import, and the original guest keys/file stay unchanged.
Tasks, blocks, habits, history and reviews merge by their existing IDs; account
records win collisions, so a repeat import does not duplicate them. Existing
account settings and its active timer are retained. A pristine account may use
guest settings. An active guest run stays in the guest workspace; it is not
silently moved into an account. Original time/history retention rules (1,000
Focus history records) still apply. Backups have unique names under the account
prefix and can consume browser quota; if a backup cannot be stored, replacement
is refused. Export JSON externally before removing browser data.

The app cannot read V1 LocalStorage from a different origin/domain. Export JSON
on the original website, then choose that file in the signed-in Preview account.

## Verification

```bash
npm ci --cache /tmp/lbd-auth-npm-cache
npm run build
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Live local integration prerequisites: Docker with the official images
`postgres:15-alpine`, `supabase/gotrue:v2.197.0`, `postgrest/postgrest:v16.5`.
This is a minimal self-hosted Supabase Auth/PostgREST test stack, not a managed
Supabase project. The script uses its own named containers and generated local
credentials, creates local-only test users and applies the real migration.
It does not use cloud credentials. Do not reuse its test gateway in production.

```bash
node scripts/local-auth-stack.mjs
# In another terminal:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  npx playwright test --config playwright.auth.config.ts
```

The script retains only public test connection details in
`/tmp/lbd-auth-stack/public.json`; generated database/JWT secrets are private
local files. A tiny loopback-only CORS/API-key gateway forwards to the real Auth
and PostgREST services. The integration configuration rejects a non-local host,
so it cannot accidentally run signup/writes against Production.

Integration tests use independent desktop and mobile Chromium browser contexts,
not physical MacBook/iPhone or Safari: email signup, explicit guest/file import,
Task sync in both directions, Calendar/Habit/Focus/review transfer, account switch,
logout preservation, populated-table RLS across two UUIDs, anonymous denial,
stale revisions and transaction rollback. Physical-device and managed-project
verification remain separate requirements. Conflicts currently replace a whole
workspace after explicit selection; there is no field-by-field merge UI.

Stop only the task-owned test containers when finished:

```bash
docker rm -f lbd-auth-rest lbd-auth-gotrue lbd-auth-pg
docker network rm lbd-auth-test
```

Stop the `local-auth-stack.mjs` process as well. Restarting the script resets
only these isolated test containers and their test users. Do not use their
names for an unrelated database.

## Password recovery (V2)

The login panel includes **Quên mật khẩu?**. It calls
`resetPasswordForEmail(email, { redirectTo: <current-origin>/<current-path>?auth=recovery })`.
The generic success message does not disclose whether an email is registered.
Rate limits and network failures have safe messages, with no raw backend errors.

`PasswordRecovery` wraps the account app. A callback is captured **before** SDK
initialization removes URL fragments. `PASSWORD_RECOVERY` opens the dedicated
**Đặt mật khẩu mới** screen; Calendar/account sync are not mounted during recovery.
The screen validates matching passwords (minimum eight characters), validates the
current account session, then calls `auth.updateUser({ password })`. Server-side
password policy remains authoritative. Success is explicit, followed by a button
to end the local recovery session and open login with the new password.

The existing implicit email flow supports opening email links in a different
browser. Old implicit links with `type=recovery` and no query marker are also
recognized. Explicit `?auth=recovery&code=...` callbacks are exchanged once when
the matching PKCE verifier exists in this browser. A missing verifier is an
invalid link, never a fallback to an unrelated existing login. PKCE links must
be opened in the browser that requested them. Hash-only navigation to an
already-open callback page is reinitialized. Refreshing a verified recovery
screen retains that screen using a tab-scoped user-ID marker (no token/password
in that marker); an unauthenticated marker alone grants nothing.

Expired, reused, malformed and missing-credential links show the invalid-link
screen with a route back to request a fresh email. Credentials and callback error
parameters are removed from the address bar after SDK processing. Passwords,
tokens, raw auth errors and email bodies are never logged by the application.
No workspace/legacy storage keys are deleted or reset by this flow.

### Manual Preview configuration and acceptance check

1. In Supabase **Authentication → URL Configuration → Redirect URLs**, add the
   exact new Vercel Preview callback URL, including `/?auth=recovery` (or the
   corresponding app base path). Permit the Preview root for older links if
   needed. Prefer a stable branch Preview URL when available. An unallowed
   redirect can fall back to Site URL, which may still point at V1.
   **Do not change the production Site URL or V1 settings.** Use a separate
   development Supabase project when changing configuration/templates for tests.
2. Check the **Reset Password** email template uses `{{ .ConfirmationURL }}`
   for its link, rather than linking directly to `{{ .SiteURL }}` without Auth
   verification. This implementation uses Supabase's standard verification
   redirect; it does not define a custom `token_hash` verification endpoint.
3. Confirm the two existing public Vite Supabase variables are set for **Vercel
   Preview**, then build/redeploy branch `feature/lbd-focus-v2` only. No SQL
   migration or new secret is needed for this password-recovery change.
4. Open the new Preview, select login → **Quên mật khẩu?**, request a **new** email
   and check spam. Follow its latest link. Confirm the browser remains on Preview
   and shows **Đặt mật khẩu mới**, save a new password, return to login and use it.
5. Check existing Task/Calendar/Habit/Focus history, a failed/reused link, and
   both MacBook/iPhone. Local automated tests emulate desktop/mobile Chromium;
   real device/Safari, hosted SMTP delivery and the managed Supabase project
   require this separate acceptance check.

Local test stack now captures SMTP in a private test-only mailbox under `/tmp`;
no email is sent externally. The recovery integration suite requests real Auth
emails, follows their verification links, changes the password and logs in again.
It covers desktop/mobile, implicit and PKCE redirects, form reload, hash-only
callback, confirmation mismatch, policy/update failure, expired sessions,
invalid/reused links, rate limits and unchanged application LocalStorage.
Do not print the private mailbox or use the local SMTP harness for real mail.
