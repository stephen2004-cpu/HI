# LBD Focus — tactile UI and motion

This change is presentation-only on `feature/lbd-focus-v2`.

## Reference and scope

The user's brief supplies the interaction direction: quick, tactile buttons,
clear cards, readable content, gentle feedback and the LBD black/cream/gold brand.
The supplied MOV exceeds the environment's 32 MiB transfer limit and could not
be inspected. The public Duolingo `/learn` page returned a network-proxy 403.
This implementation follows the written principles; it does not claim a
frame-by-frame match to that video or copy Duolingo graphics, characters or UI.
Existing logo/header-symbol/favicon assets are unchanged.

`src/interface.css` extends the existing stylesheet with shared surface, border,
button-depth and timing tokens. `src/InterfaceFeedback.tsx` adds transient DOM
feedback and Web Animations; it renders no content. `src/main.tsx` only imports
this presentation layer and mounts its effect. No business component, audio
controller, time calculation, API, auth/sync/storage module, dependency or SQL
migration was changed. The existing screens and their handlers remain in place.

## Interaction system

| Element                              | Presentation                                                                               | Duration   |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ---------- |
| Primary/secondary/navigation buttons | 4 px depth; hover lifts 2 px on fine pointers; press sinks 3 px                            | 50–180 ms  |
| Page navigation                      | Opacity entrance after existing hash navigation; no transformed Calendar ancestor          | 170 ms     |
| Checklist                            | Small check movement after the controlled checked state settles                            | 200 ms     |
| Task completion                      | Brief gold outline after the existing saved `task-done` state appears                      | 220 ms     |
| Habit completion                     | Check icon settles into the actual `.done` cell; colors transition between existing states | 180–200 ms |
| Progress                             | Width interpolation toward the existing value; no value changes                            | 180–200 ms |
| Calendar/Eisenhower dragging         | Source fades, target gets a dashed outline, Calendar gets a pointer guide                  | Immediate  |

There are no new completion rules, rewards, points, auto-starts, sounds or default
records. No celebratory animation runs just because previously completed records
are loaded. A rejected local Task write leaves the checkbox/card uncompleted and
gets no completion halo. Animation cleanup cancels its own frames/listeners and
animations, not application timers. Drag feedback does not call `preventDefault`,
change data transfer contents, round times or persist anything. Cancel/drop/end,
Escape and window blur remove transient drag markers.

`prefers-reduced-motion: reduce` disables CSS transitions/animations and positional
button feedback, including progress pseudo-elements. The JS layer skips and
cancels its own animations when the preference changes. Colors, focus outlines,
selected states and drag targets still communicate immediately.

## Screen treatment

- Calendar: warm neutral sidebar, legible toolbar, clearer current day, preserved
  Eisenhower/custom colors, no changes to the hour-slot/block coordinate contract.
  Compact edit/resize controls retain separate hit areas on short blocks.
- Task: larger title, grouped form, distinct quadrants and bordered task cards.
- Focus: Timer stays left of work content on desktop and above it on mobile;
  raised controls, calm progress and separated checklist/notes/output cards.
- Habits: consistent form/card hierarchy, tactile day cells and clear done/rest
  states. Week/month scrolling and recurrence controls keep their existing roles.
- Overview/reports: consistent metric cards, labels and tabular numbers.
- Settings/account/recovery: the same input, card, button and keyboard-focus system.

## Review images

These are actual browser screenshots using **temporary illustrative guest data**
in an isolated context, not a mock image or user account data. No fixture is added
to application defaults or synced to a server.

- [Desktop Focus](ui-preview/focus-desktop.png)
- [Mobile Focus](ui-preview/focus-mobile.png)

All seven screens were also captured locally at 1512 px and 390 px widths and
checked for document overflow. The Calendar and Habit tables retain their
intentional internal scrolling. Actual MacBook/iPhone/Safari review is still
needed; automated mobile checks emulate a touch Chromium viewport.

## Validation

Run the existing unit/regression suite plus `e2e/interface.spec.ts`. The added UI
cases exercise tactile/reduced-motion behavior, no storage writes on visual-only
navigation, failure-safe completion feedback, cancelled drag feedback without
geometry/data changes, and all seven screens/account UI at narrow widths.

The existing local Supabase integration suite is also run to check auth/recovery,
RLS, offline conflicts and cross-context sync through the restyled UI. No managed
Supabase project, Production database or Vercel Production is changed.

Vercel Preview needs a deployment of this feature commit through the connected
Vercel project. This environment has no Vercel deployment tool/project credentials;
a Git push may trigger an existing integration but is not proof of a ready Preview.

Verified on 2026-10-30: TypeScript/Vite build, 50 unit tests, 52 desktop/mobile
Playwright cases, and 11 isolated local Supabase integration cases passed. The
initial UI run exposed overlapping Calendar edit/resize hit areas on short
blocks; CSS line height/control sizing was corrected and both projects passed
on the final full run. No business test was weakened to accommodate the redesign.
