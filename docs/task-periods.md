# Eisenhower time periods — V2

## Data contract

No schema, database migration, storage key or saved entity version changes.

| Existing entity | Fields used                                                                 |
| --------------- | --------------------------------------------------------------------------- |
| Task            | `id`, `group`, `completed`, optional `plannedStart`, `habitId`, `habitDate` |
| Time Block      | `taskId`, `start`, `end`, recurrence/cancellation metadata                  |
| Habit           | existing recurrence rules, pause/archive/deletion state and logs            |

`src/taskPeriods.ts` computes a view over these records, without mutating them.
Task remains a result/one occurrence, Habit remains a recurring definition, and
Time Block remains one allocated time interval. Habit logs never implicitly
complete the corresponding Task.

## Rules and defaults

- Every Task-page mount starts on **Ngày**, local **today**, status **Tất cả**.
  These view preferences are not stored in workspace data or synced.
- Weeks start Monday and end Sunday; months follow the local calendar. Boundaries
  use local `Date` constructors and calendar-day arithmetic, not UTC slicing or
  fixed 24-hour offsets. Next/previous month selects its first day.
- Active Calendar blocks are authoritative. A Task is included if any block
  overlaps `[rangeStart, rangeEnd)`; a cross-midnight block appears on each day it
  occupies. Exactly one card per Task is rendered, listing/counting matching
  blocks. An old `plannedStart` does not create an extra appearance when actual
  active blocks exist.
- With no active blocks, a valid Task `plannedStart` determines its day; otherwise
  a valid `habitDate` determines the occurrence day. Invalid/missing schedule data
  stays untouched and goes into **Task chưa lên lịch**, not today's quadrants.
- **Task quá hạn** means unfinished work with its latest active schedule ending
  before today, or a fallback date before today. A future active block prevents a
  false overdue label. Dates are never silently moved. Overdue work already in the
  selected range stays in its quadrant with a badge and is counted/explained in
  the overdue area, rather than rendering a duplicate card.
- Status filtering applies to cards/backlogs. The period summary shows visible
  count / all count and the completed count for that period. Each quadrant shows
  visible total, completed and unfinished counts. Completed Tasks remain in the
  selected period until explicitly filtered out. Empty quadrants retain their
  color, count and drop target. Each quadrant can be collapsed.
- **Mở Calendar / Lên lịch lại** opens the existing Time Block editor with that
  Task selected. Its default draft is 09:00 on the selected day, or today if the
  selected day is past. No block or date change is saved until **Lưu Time Block**.
  Rescheduling adds a new block and keeps old blocks/history; the future block
  supersedes an obsolete fallback date for filtering/overdue classification.
- Priority changes, custom colors, checklist, Task Setup and existing CRUD remain
  available on every card, including the two backlog areas. An unscheduled card
  stays unscheduled when its priority changes; changing a quadrant is not a date
  assignment. The existing Task CRUD test now asserts that separate backlog and
  the selected group, instead of expecting unscheduled work in today's quadrant.

## Habit generation and deletion

The Task range delegates to the **existing** bounded Calendar recurrence
materializer. Visiting a day/week/month can cache valid occurrences/blocks in that
range, just like Calendar. Stable per-habit/per-day IDs prevent duplication.
Existing records outside the view, completed logs and Focus History are retained.
Changing only status/collapse does not generate occurrences.

Cancelled/paused future instances do not fall back into an unscheduled backlog.
Pending Tasks of a permanently deleted Habit are hidden; retained completed Tasks
can still be reviewed for their date. The existing server deletion ledger and CAS
conflict behavior are unchanged; this feature introduces no separate server-side
Task-deletion protocol or silent conflict replacement.

A retained block whose Task has been deleted is treated as historical evidence:
the materializer does not recreate that missing source Task on a later visit.
This also means it does not automatically repair orphaned records from a damaged
cache; use the existing backup/import controls for deliberate recovery. No block,
Habit log or Focus Session is deleted by this guard.

## Falcon Gold Concept 02 — completed in the subsequent branding update

At the time this filtering change was implemented, only the inline brand board
was available, so the old mark was retained rather than recreated. The user has
since uploaded `LBD_GO_Infographic_va_Prompt.png` to Git. Header, favicon and native
icons now use verified pixel crops of that original Concept 02 board; see
[the branding extraction/provenance report](falcon-branding.md). No new PWA mode,
service worker or business functionality was added by the branding update.

## Review and verification

- New pure unit cases cover day/week/month boundaries, leap months, next/previous,
  multiple/cross-midnight blocks, authoritative block dates, overdue/future/done
  work, invalid dates, cancelled/deleted Habit instances and source immutability.
- New desktop/mobile UI cases cover counts, filters, collapsed groups, storage
  preservation, draft cancellation/rescheduling and recurring-instance deletion.
- A real local Supabase test uses independent desktop/mobile browser contexts,
  exercises date-scoped generation on both clients, verifies unique IDs, deletes
  an occurrence, filters/reloads the peer, and checks unchanged Habit logs,
  independent Tasks and Focus History. Existing auth/RLS/recovery/conflict tests
  remain in the suite. These are emulated Chromium contexts, not physical iPhone
  or a managed-project acceptance test.

Production/main are outside scope. Vercel Preview requires a feature-branch
build through the connected Vercel project; this workspace has no Vercel deployment
credentials/tool and cannot confirm a URL from a Git push alone.

Verified locally on 2026-10-30: TypeScript/Vite build passed, **58 unit tests**,
**58 desktop/mobile Playwright cases**, and **12 real local Supabase integration
cases** passed. The prior CRUD test was adapted only to the explicitly requested
unscheduled section and strengthened with its persisted priority assertion.

Actual UI captures with temporary illustrative test data:
[Desktop](ui-preview/tasks-desktop.png) · [Mobile](ui-preview/tasks-mobile.png).
The images include the board first, separate backlogs and the unchanged full Task
Setup form below. No illustrative record is added to application defaults.
