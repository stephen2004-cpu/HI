# Habit deletion, Calendar completion and persistent alarms

All changes target `feature/lbd-focus-v2`. No Production deployment is authorized.

## Existing data and changes

Habit storage remains `lbd-focus-v2-habits`, version 1. Optional `deletedAt` and
`deletedHistory` fields distinguish permanent deletion from reversible archive.
Deleted records are hidden from active, archived and connection lists and cannot
produce recurrence instances. Their logs are preserved by default for JSON export;
the edit form's deletion dialog offers explicit log erasure with a second native
confirmation. Focus history is never erased. Existing independent Tasks, planned
and actual time remain unchanged. Past Calendar blocks remain history; automatic
future blocks are hidden/disabled, even if a task was marked done or referenced by
a running Focus session. The Focus session itself is retained.

The app does not physically remove the habit identifier: that durable deletion
marker prevents recreation by old backups/offline devices. No undo is offered;
creating another habit uses a new ID. "Erase history" erases the current habit
log, not pre-existing external JSON exports or device/server backups.

### Supabase migration required for account deletion

Review `supabase/migrations/202610300001_habit_deletions.sql` and apply it to a
**development/Preview** Supabase project first. It adds a per-owner immutable
`lbd_habit_deletions` ledger, RLS and triggers, and updates workspace reads to
include deletion markers even after a stale client omits/deletes a habit row.
The original revision/CAS checks remain. A conflict accepts irreversible server
deletion markers after backing up the local copy; other edits await selection. Selecting a local conflict version
retains server deletion markers. Server triggers also prevent an older client
with a fresh revision from restoring the ID or its erased log. Future recurring
blocks are cancelled server-side. Authenticated users can read only their own
ledger and cannot directly insert, update or delete ledger entries. No existing
entity/history rows are dropped by this additive migration.

The account deletion button checks `lbd_habit_deletion_capabilities()` and refuses
to delete if the migration is absent or the server cannot be reached. Guest
deletion works locally. Account deletion is not complete across devices until its
sync status reports success; pending/offline changes remain cached. Apply only
with the database owner's review/confirmation; do not run against Production.
The task applies migrations only to its isolated local integration stack.

A pre-upgrade client can still display its already-cached copy while offline;
a website cannot remove data from a disconnected device. On reconnect the server
retains the deletion and refuses resurrection. Refresh/update that old client to
use the deletion-aware UI. Whole-workspace conflicts still require explicit
server/local selection; no field-by-field merge was introduced.

## Calendar completion

Day/week/month blocks read `Task.completed` from the same source Task. They show
`✓ Đã hoàn thành`, retain their priority and schedule, and have slightly reduced
emphasis. Reopening a Task updates all its blocks. The optional status filter
starts at **Tất cả**. It is view-only and never changes Planned/Actual Time.
Short overlapping blocks retain their real duration; hover title includes the
full name, completion status and time when available space clips their content.

## Timer alarm

An end-of-session alert remains on screen with a **Tắt chuông** button. An audible
phrase repeats until acknowledgement, using one interval and tracked oscillator
nodes. Dismissal stops active/scheduled notes immediately. Changing global mute or
volume takes effect on a ringing alarm. A `silent` Study-session sound or volume
zero creates no audible loop. Session transitions replace the existing alarm
rather than stacking alarms. Navigation between app screens keeps it; the acknowledgement button is also
rendered inside the active fullscreen Timer; leaving
or remounting the account app stops this page's sound.

Study Mode retains its existing configured sequence, automatic transitions and
explicit loop setting. Alarm acknowledgement does not add time, restart the
Timer, complete a Task, or mark a Habit done. A catch-up after background throttling
announces the latest completed session once, rather than playing a backlog.
The existing volume slider and per-Study-session sounds remain the settings.

Native page Notifications do not consistently support action buttons. Their
click action is labelled **Tắt chuông** and acknowledges the same alarm; the
in-app end-of-time notification always includes the actual button. Native
notifications are silent to avoid a second independent OS sound. No service
worker/PWA was added just for notification actions.

Browser autoplay policy, background throttling, device silent modes, screen
locking and suspension may prevent or delay audio. Unlock still requires user
interaction. No continuous-audio guarantee is made for background/locked devices.
Automated Chromium desktop/mobile tests inspect playback scheduling and dismissal;
physical iPhone/Safari audibility and OS notification behavior need manual checks.

## Manual acceptance

1. Apply the reviewed additive migration to the Preview database, then deploy
   the tested feature commit to Vercel **Preview** only.
2. On MacBook create a recurring habit with completed logs; sign into iPhone with
   the same account. Delete on MacBook, refresh and log back in on each device.
   Verify neither active nor archived list resurrects it. Test the offline-device
   conflict and confirm a local version still retains the deletion marker.
3. Verify default retained logs in account JSON export; with a new test habit,
   test erasure and cancel/accept the second confirmation. Confirm Focus History
   and an independent Task remain.
4. Schedule one Task more than once, mark it done/reopen it, check day/week/month
   and all three filters. Verify schedule totals stay unchanged.
5. End a short countdown; wait for multiple phrases, navigate, then press **Tắt
   chuông**. Test volume, mute, Study→break→Study, foreground/background and OS
   notifications. Note physical-device/browser limits rather than promising them.

## Verification record

Verified locally on 2026-10-30: TypeScript/Vite build passed, 50 unit tests,
44 unique Playwright desktop/mobile cases, and 11 real local Auth/PostgREST
integration cases passed. After the final display/sync changes, the eight new
UI cases, two deletion/conflict integration cases, and two fullscreen alarm
checks were rerun successfully. Audio tests inspect real browser oscillator
scheduling plus isolated controller tests; they do not certify physical speaker
output or iPhone/Safari/locked-screen behavior. Managed Supabase migration and
Vercel Preview readiness are not verified by these local results.
