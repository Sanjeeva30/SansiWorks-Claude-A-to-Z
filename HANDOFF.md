# SansiWorks — Session Handoff

> Kept current at every major milestone so any fresh session (or fresh context window)
> can pick up without re-deriving state. Last updated: **2026-07-29** (pre-launch security & performance hardening).

## What this project is
1:1 rebuild of the SansiWorks design (Sansico Group PM workspace) on Next.js 16 + Supabase
(project `nqktxuilscqapitrzqbb`), with Brevo email + Gemini "Sansi" AI. Design tokens and
screens locked to `SansiWorks.dc.html`. Repo: `Sanjeeva30/SansiWorks-Claude-A-to-Z`, auto-deploys
to Vercel on push to `main`. **Rule: verify on localhost; push only on user approval.**

## Status: complete
- Phases 1–3 (routing, task engine w/ single-R RACI + rank-checked A, org engine: units/
  clusters/heads/assignments/permission templates/levels, admin console).
- Phase 5 polish: focus-trapped ARIA modals (`lib/a11y.ts`), virtualized Everything view
  (@tanstack/react-virtual — removed silent 30-row cap), keyboard status-select on Kanban
  cards, PWA (manifest/sw.js/off-canvas mobile sidebar), Vitest 26 tests (`lib/logic.test.ts`).
- **Mobile responsiveness (comprehensive 375px–430px sweep)**: Fixed iOS `100vh` bug (now uses
  `dvh` on all full-height containers), applied systemic `min-width: 0` to all grids/flex
  (allows content to shrink instead of overflow), fixed People rows to stack on mobile, removed
  clipping hacks (`overflow-x: clip`). Tested all 12 main routes + 4 list views + 7 modals +
  9 admin tabs + command palette + popovers with automated overflow scanner. Zero horizontal/
  vertical overflow on any screen at 320/390/430px widths. (Commit: 9fbd506)
- Audit package: `logAudit()` in `lib/actions.ts` wired into ALL admin/permission/org/SOP
  mutations (audit_log previously had ZERO writers); CSV export in admin → Audit log tab.
- Forms flow: required owner (`forms.default_assignee_id`), service-role notify route
  (`api/forms/notify-submission`), conversion assigns to owner. Vendor Onboarding owner: Dewi Santoso.
- Legacy SOP migration done honestly — unattributed records marked "—", never fabricated reviewers.
- SOP visibility: owning dept + Board/Group/Regional heads + Internal Audit (rank-based, never name-based).

## Improvement roadmap (from the 2026-07-26 QA audit)
Audit artifact: private Claude artifact "SansiWorks — Full QA & Improvement Audit".
- [x] **1. Seed dedup + recurrence guard.** Removed 34 rows where the seed put the
      same name+due twice in ONE list under two assignees. Unique index
      `tasks_no_dupe_per_list` prevents recurrence. Restore script in `db-backups/`.
      *Audit correction: this was never "5x everything" — grouping by (name,due)
      across lists inflated the count. Headline metrics barely moved.*
- [x] **2. Real RLS.** 51 always-true policies → 6 (each deliberate, documented in
      `supabase/migrations/README.md`). Helper fns `app_is_super/app_rank/
      app_can_write_task/...` mirror `lib/actions.ts`. Verified adversarially by
      impersonating a rank-4 non-admin: task hijack, delete, activity forgery,
      approval impersonation and **self-approval** all blocked; legitimate flows
      still work. *Audit corrections: RLS was already ON for all 36 tables;
      `audit_log` was already append-only; the 10 org/admin tables were already
      locked to super/l1-l3.*
- [x] **3. Security quick wins.** Cron secret now header-only + timingSafeEqual;
      form-notify replay killed via `notifications.dedupe_key` unique index;
      Sansi rate-limited 15/min/user (429). avatars bucket had **anonymous
      uploads with no check** — now authenticated, own-folder only; anon
      task-attachments narrowed to the `form-submissions/` prefix.
      **Still needs you:** enable Leaked Password Protection in the Supabase
      dashboard (Auth → Policies) — it is a toggle Claude cannot set.
- [x] **4. WCAG AA both themes.** Measured, not eyeballed: 47 dark + 35 light
      failures -> **0 / 0** across 9 screens. Root cause was brand hues used as TEXT
      (#7A0D20 = 1.49:1 on a dark card). Added `--sw-on-crimson/-green/-navy/-red/
      -amber` foreground tokens per theme (plain `--crimson` etc. stay as FILL, so
      white-on-crimson buttons are unaffected); ~90 call sites + PRIORITY_COLORS/
      STATUS_COLORS migrated. Also darkened light `--sw-muted` (2.77:1 -> 4.65) and
      dark muted alpha .45 -> .50. Two theme-independent bugs found: avatar initials
      were hardcoded white on rank-lightened pastels (1.4:1 in BOTH themes) — now
      `readableTextOn()` with a derived 0.179 luminance crossover; and the Late/At-risk
      chip painted the status colour as a background with white text.
      *Note: light-mode secondary text is now visibly darker — that's the AA fix,
      and it's one token if you want it tuned.*
- [x] **5. Honest efficiency.** `efficiencyScore()` returns `hasData`; no-data
      people render "— no data" instead of a fake 100%. `EFFICIENCY_EXPLAINER`
      surfaced on the profile modal. Company health excludes unscored depts →
      moved 97 to an honest **79**.
- [x] **6. Sansi company scope.** The grounding contained no company task data at
      all — only rows where the asker was assignee/accountable — so it could not have
      answered correctly. Now fetches company-wide open tasks for levels with
      `exec_visibility` (Board/Group/Regional Heads; Dept Heads and below unchanged
      and told to say so), computes at-risk with the SAME rule as the Overview's
      "Predicted late" so the two never disagree, and the prompt requires Sansi to
      name its scope. Verified: "what is at risk this week?" -> "Across the company,
      12 tasks..." naming the same criticals the Overview flags; personal questions
      still answer personally.
- [x] **7. Scale ceiling removed.** Measured first: sign-in issued 34 queries, and
      ANY row changing anywhere refetched all 34 on every connected client. Now
      row-level realtime patches (ROW_SYNC, 29 tables; only 5 derived/composite-key
      tables still full-refresh) plus a deferred bundle of 11 admin/drill-down
      tables behind `ensureDeferred()`. **34 -> 23 requests on load (1431 -> 725ms);
      one row change 34 -> 0 requests.** Gotcha for future work: the task slide-over
      and detail modals mount on every screen, so their deferred pulls must be keyed
      to the *open* state or the split silently reverts.
- [x] **8. UX pass.** Recurring tasks were a lie — `recur` was collected and stored
      since day one and never read; completing one now rolls the next forward
      (UTC-midday parsing so DST can't shift the date; the unique index guards
      double-spawn; 6 tests). Metric row: 5 explicit cols, auto-fit below 900px
      container (plain auto-fit gave 6 tracks for 5 cards). First-run card on Home
      for people with nothing assigned. Scroll-edge cues on kanban/gantt/calendar.
- [x] **9. Mentions reach email.** Comments/@mentions turned out already built;
      the gap was email. Fixing it surfaced two more bugs: `digestOff` used
      `[].every()` which is vacuously true, so **11 of 17 people were silently
      opted out of all digests**, and anyone with no tasks was skipped even with a
      mention waiting. Digest now has a Mentions & replies section, email is
      opt-OUT, and `?dryRun=1` / `?html=<email>` let the digest be tested without
      mailing the company (BREVO_API_KEY is live).

## Auth & onboarding (audited 2026-07-27)
Every signed-out surface was walked end to end against `sanjeeva.sansico@gmail.com`.
Two flows were not merely rough — they were broken or acted on the wrong account.
- **Invite onboarding never completed.** "Confirm email" is ON in Supabase, so
  signUp() yields no session and the ignored signInWithPassword() failed. Joiners
  either couldn't sign in, or inherited whoever was already signed in on that
  machine. Fixed via `/api/invite/confirm` (service-role, re-verifies token age +
  email match) plus signOut-before-signUp.
- **A reset link could reset the wrong person's password** (reproduced: it changed
  the admin's). Causes: the reset page accepted any existing session as authority;
  the redirect fired before the token was exchanged; and `@supabase/ssr` uses PKCE
  so it ignores implicit fragment tokens entirely. Now the fragment is exchanged
  explicitly and `RECOVERY_FLAG` is required.
- Added: `/forgot-password`, `/reset-password`, `/auth/callback`, Settings →
  Account (change password + **sign out**, neither existed).
- Removed the fake "2 attempts remaining before your account is temporarily
  locked" — no such counter or lockout exists.
- `/api/email-preview?kind=…` (CRON_SECRET) renders any email without sending.

### ⚠ Dashboard settings still required (cannot be set from code)
1. **Auth → URL Configuration → Redirect URLs**: add
   `https://<prod-domain>/auth/callback` (and the localhost equivalent).
   Without it Supabase discards our `redirect_to`, falls back to the Site URL, and
   sends implicit-flow links. The app now copes, but the PKCE path is cleaner.
2. **Auth → Providers → Email**: recovery/confirmation emails use SUPABASE's
   templates and SMTP, NOT our Brevo sender — they are unbranded, and the built-in
   SMTP is heavily rate-limited and unreliable for non-team addresses. Configure
   custom SMTP + templates before rollout.
3. **Leaked Password Protection** — still off (flagged since the first audit).
4. **`EMAIL_FROM`** env var: sender still falls back to a personal Gmail, which
   cannot align SPF/DKIM with sansico.com. Set to e.g. `noreply@sansico.com`.

## Real-invite security incident (2026-07-27)
A real invite (not a test seed) was sent to `sanjeeva_gunawardena@yahoo.com`, invited
at `l6` (Staff). After accepting, that account could see and enter the full Admin
console — traced to a client-side-only gap: the sidebar's "Admin console" button and
the panel's own render were gated on nothing but local nav state, not role. Fixed by
gating all three surfaces (sidebar link, command palette entry, and the panel's actual
render — not just the button) on `is_super || level_id in (l1,l2,l2r,l3)`. Confirmed via
DB query the account was never really `is_super`/elevated — it could only *see* the
panel, not silently gain real rights, **except** for one thing it did use: the
`profiles` table's UPDATE policy allowed `id = auth.uid()` (self-updates) with **no
`WITH CHECK` clause**, meaning any authenticated user could have set `is_super = true`
on themselves directly via the Supabase client. Closed with a `BEFORE UPDATE` trigger
(`prevent_self_privilege_escalation`) that reverts `is_super`/`level_id` changes unless
the acting session is already an admin — DB-level, applied directly in Supabase, not
dependent on app code. Also tightened `invites` SELECT from `USING(true)` (any
authenticated user could read every pending invite's token company-wide) to admin-only;
invite acceptance uses `SECURITY DEFINER` RPCs that bypass RLS, so nothing depended on
the open read. Also found: the same "optimistic UI + audit_log write regardless of
whether the DB update actually succeeded" pattern (see the invite-toast bug above)
existed on the "Make super admin" toggle too — now checks the real Supabase result
before patching local state or writing to `audit_log`, and the button itself is now
restricted to `me.is_super` (previously any admin-tab-visible user, including a plain
Department Head, could grant super-admin to someone else).
**Lesson for future admin-surface work: a client-side-only gate is not a gate.** Every
new admin action needs (1) a role check before the button renders, (2) the mutation
itself checked/gated (RLS `WITH CHECK`, or a trigger for column-level rules RLS can't
express), and (3) the audit/success-toast conditioned on the real DB result — not
assumed.

## Company-wide data-visibility incident (2026-07-28)
A real invited user (Staff/l6, no `is_super`) logged in and could see every space,
every board, and every task company-wide — not just their own department's. Root
cause: the 2026-07-23 RLS audit (below) locked down *writes* and verified them
adversarially, but explicitly left reads on `tasks`/`lists`/`spaces` (and several
satellite tables) as `USING (true)` — readable by any authenticated user, no
department or rank check at all. This was not a regression from that audit; it was
the audit's own scope boundary, and nobody flagged it as wrong until a real invited
user actually hit it.

Fixed with two new SECURITY DEFINER helpers — `app_can_read_task(id)` and
`app_can_read_space(id)` — and rewritten read policies on: `spaces`, `lists`,
`tasks`, `subtasks`, `task_raci`, `task_assignees`, `task_dependencies`,
`task_attachments`, `task_activity`, `comments`. The rule: visible if you're
personally on the task (owner/assignee/accountable/RACI/assignee-list), your home
department owns the space, you're cross-assigned into that department via
`org_unit_members`, or you hold an exec-visibility rank (`app_is_exec()` — Board,
Group Heads, or super admin). Verified live (not just by reading the SQL) by
switching a real test account between departments and ranks and confirming task
counts matched exactly what each should see — including that exec ranks still see
company-wide totals for Overview/reporting.

**A second instance of the identical mistake was found in the same sweep**, in a
completely different subsystem: `canViewSop()` (`lib/logic.ts`) — "owning
department + Board/Group/Regional Heads + Internal Audit" — was a CLIENT-SIDE-ONLY
filter (`workspace-section.tsx` `.filter(d => !d.is_sop || canViewSop(...))`). The
`docs`/`doc_versions` RLS was `USING(true)`, so the UI hid other departments' SOPs
but a direct API call would not have. Fixed with `app_can_read_doc()`, mirroring
`canViewSop()`'s exact rule in SQL (rank ≤ 3 = Board/Group/Regional Heads, matching
`isSeniorRank()` — not `app_is_exec()`'s rank ≤ 2, which excludes Regional Group
Heads). Plain (non-SOP) docs remain open, matching the original design intent.

Also tightened in the same pass (all were `USING(true)`, none had a documented
reason to be): `approvals`, `automations`, `board_requests`, `custom_fields`,
`dept_proposals`, `form_submissions` (its policy was literally named
`own_form_submissions_read` while enforcing no ownership check at all — the name
had drifted from the implementation), `nominations`, `permission_templates`,
`templates`.

**Deliberately left open** (re-verified, not overlooked): `profiles`, `org_units`,
`org_unit_heads`, `org_unit_members`, `assignments`, `levels`, `features`, `forms`.
These are directory/reference data (who works where, what forms exist to fill out,
what a rank is called) rather than private team work product — the same category
`profiles` was already open for. If this line is wrong for your business, say so
specifically; it's a judgment call, not something re-derived from first principles
each time.

**Lesson, stated plainly so it doesn't get relearned a third time:** a client-side
`.filter()` or a hidden nav button is not a permission boundary. It's decoration on
top of one. The only place that actually stops a request is a `USING` clause on the
table — anything else is convenience for the honest case and provides zero
protection against a direct API call. Every future feature with any restricted
audience needs its enforcement written and tested at the RLS layer *first*; the
UI-level convenience filter is optional decoration on top, never a substitute.

### Known, not yet fixed
- `sanjeeva.sansico@gmail.com` exists as a real test account from this audit
  (password `InAppSansi2026!`). Delete it before go-live. **Kept deliberately
  for now** — it is the only non-super account available for verifying
  rank-scoped behaviour, and every scoping fix in this file was proved with it.
- ~~Invites always use the sender's own `department_id`~~ — stale note. The
  picker exists and is gated on `exec_visibility` (`canPickInviteDept`); it is
  locked to your own department below that rank, which is the intended rule.

## Spaces/boards: create, archive, restore (2026-07-28)
Root cause traced while fixing "space create doesn't exist": department creation
never paired a matching Space, so any department created before this fix had no
board home — including the real invited user's own department. Fixed both
create-department call sites (`workspace-section.tsx` proposal-approval flow and
direct-create flow) to go through a new shared `createDepartmentWithSpace()`
helper in `lib/actions.ts`, and retroactively repaired 8 existing departments/
divisions that were missing their space via a one-off SQL insert.

Added on top:
- `spaces`/`lists` both got an `archived boolean` column (default false) — same
  soft-delete pattern already used for tasks/docs — plus a matching
  `.eq("archived", false)` filter on the initial store fetch.
- Sidebar: hover-revealed Archive (trash icon) on each space header and each
  board row, dept-admin-gated via `isDeptAdmin(me, levels)`; a "+ New Space"
  inline-input control next to the Spaces section label, same gate.
- Admin console → Departments tab: an "Archived spaces & boards" section (only
  rendered when non-empty) with a Restore button per row — this closes the loop
  the archive confirm-dialog copy already promised ("restore it from Admin
  console → Departments → Archived spaces/boards"). Archived rows are fetched
  lazily (not part of the main store fetch) when the Departments tab opens.
- All three flows (create, archive, restore) verified live end-to-end by
  temporarily elevating a real test account (`Sansi Test User`, l6→l3) in the
  browser preview, confirming DB state via direct SQL after each action, then
  reverting the account and deleting the test rows.

## Scoping, admin controls and a dead-button sweep (2026-07-28)

**Incident, recorded honestly:** while live-testing the new permanent user
delete, a scripted DOM selector matched the wrong row and deleted the real
seeded profile "Ambar" (`ambar@sansico.com`). She had no tasks, comments, docs
or audit history, so nothing was orphaned, and she had no auth account (all the
Jogja/vendor-org seed people are profile-only). Restored with her original
matrix setup: sits in Vendor Organisation, level Manager (l4), reports to
Marlina, assignment "F&A manager" scoped to Jogja cluster. **Lesson:** a
`textContent` match is not a row identifier. Any scripted destructive test must
enumerate candidates, assert the target's identity, and abort on mismatch —
that guard is what caught the second near-miss during the department-delete test.

**Visibility scoping (decided against the blunt "scope everything by department"):**
- `docs.visibility` added — `company` / `department` / `restricted`. Company-wide
  is deliberate: hiding the handbook or code of conduct causes more harm than
  exposing it. Enforced by `app_can_read_doc(dept, is_sop, visibility)` in RLS;
  `canViewDoc()` in `logic.ts` mirrors it so the UI list matches what the DB
  would return. Migration preserved old behaviour exactly (SOPs → department,
  plain docs → company) so nothing vanished for anyone on deploy.
- **Forms were left company-wide on purpose.** A form is an intake channel — the
  whole point of the IT/HR/Finance form is that outsiders submit to it. The real
  hole was *submissions*: `app_is_dept_admin()` let any department head read
  every department's submissions. Now `app_can_read_form_submission()` scopes
  admins to their own department (form → list → space → department).
- Sidebar "Everything"/"Overview" and the My Work company-pulse strip are gated
  on `exec_visibility`. Staff get a personal strip instead: own capacity, own
  on-time rate, blocking-me / waiting-on-me counts, team open+overdue — things
  they can act on, rather than a health score they cannot move.
- `capacity_tracking` genuinely gates workload display now; it previously only
  hid the capacity input in the profile popup while the bars rendered anyway.

**Spaces vs Departments — deliberately NOT merged.** Sidebar group is relabelled
"Departments" (in practice every space is one), but the two stay separate
concepts so cross-department project spaces, vendor spaces and cluster/plant
work containers remain possible. Merging them would weld the data model shut.

**Admin:** per-user department / level / reports-to dropdowns inline on the Users
tab; super-admin permanent department delete behind server-computed impact
counts + type-the-name confirmation (people are detached, never deleted);
current-password required to change password, with show/hide on every password
field in the app.

**Dead-button sweep.** "+ Add unit" and "+ Add template" were not unwired — both
silently returned on an empty field *and* never checked the insert's error, so
an RLS refusal also did nothing visible. Same shape found and fixed at six more
sites: form submission (worst — it showed a reference number for a submission
that never saved), board requests, add head ×2, add member, nomination approval,
and board-request approval (which toasted "created" even when the department had
no space). Rule going forward: **every mutation checks its error and says
something**; optimistic patches roll back on failure.

## Difficulty is now the single sizing scale (2026-07-28)
`effort` and `difficulty` were two parallel point systems that never met:
`effort` fed workload/filters/timeline, while `difficulty` — the one with a
labelled 1-5 scale and rank-gated editing — fed nothing at all. Its Fibonacci
weights (1/2/3/5/8) existed in `DIFFICULTY_LEVELS` and were never read. People
filled in both; only one counted, and the task detail asked for both side by side.

- `difficultyPoints()` in `logic.ts` is the single source of sizing. Unsized
  tasks count as Moderate (3), never 0 — an unestimated backlog must not read
  as free capacity.
- `workloadPct`, the Everything/timeline bar length, and the task filter all use
  it. The filter chip is now "Difficulty" with Trivial–Easy / Moderate /
  Hard–Complex, so the words in the filter match the words on the task.
- Backfill: `difficulty = effort` (both were already 1-5), so every task's
  relative sizing carried over unchanged; only the weighting moved from linear
  to Fibonacci. Effect verified live — Budi 90%→100%, Siti 40%→45%; people
  carrying Hard/Complex work now read heavier, which is the entire point.
- **The `tasks.effort` column still exists** (defaulted, no longer read or
  written) so the original estimates survive if this is revisited. It is
  deliberately absent from the `Task` TS type so nothing can quietly depend on
  it again — the compiler is the guard.

## PWA / mobile
There is no native app and no store presence; the mobile app *is* the PWA, and
it is complete: `public/manifest.json` (standalone, brand theme colour),
`public/sw.js`, 192/512 + maskable icons, `apple-touch-icon.png`, registered by
`src/app/sw-register.tsx`. The service worker deliberately caches only the app
shell — never `/api/` — because this app's data is live via Supabase and stale
cached data would be worse than an honest network error. Requires HTTPS, so
install from the Vercel URL, not localhost. On iPhone, install via **Safari**
("Share → Add to Home Screen"); iOS only reliably supports home-screen install
from Safari, and a home-screen app runs in WebKit regardless of which browser
installed it.

## Realtime presence + assignee-picker fix (2026-07-28)
**Lightweight presence** (not live collaborative editing — that was explicitly
scoped out): `lib/presence.ts` exports `usePresence(scopeKey)`, joining a Realtime
presence channel (`presence:task:<id>` or `presence:list:<id>`) and returning
everyone else currently tracked on it. `components/presence.tsx` renders that as
an overlapping avatar stack (`PresenceAvatars`, capped at 4 + "+N"), wired into
the task detail header and the board header (not the Everything page — there's
no single board to attach a viewer list to there). No polling, no heartbeat
interval of our own: presence is tied to the channel's own socket lifecycle, so
a closed tab drops out on its own. This reuses the one Realtime connection the
app already holds for row-sync — a second channel *topic* on the same socket,
not a second connection — so it costs nothing against the free-tier concurrent-
connection quota (200) and only a small fraction of the message quota (2M/mo).
Verified live with a synthetic second client (raw supabase-js, phantom presence
key) joining the same channel: appeared with correct name/color, disappeared
within ~3s of `removeChannel`, and a task-scoped viewer never leaked into the
board list or vice versa.

**Assignee (R) picker no longer dumps the whole department below the field.**
`AssigneePicker` previously rendered every `deptScoped` profile as a permanent
row of chips underneath the input, unconditionally — fine at a handful of
people, unusable at 100 (100 always-visible chips). It now matches the
collapsed/capped pattern `RaciRows` already used for C/I: closed until the
field is focused, capped at 8 results with a "+N more — keep typing" hint,
selection via `onMouseDown` so it fires before the input's `onBlur` closes the
list. Verified live: focusing an empty board's R field showed exactly the
department's members and nothing else; clicking one selected it and closed
the list.

## Pre-launch security & performance hardening (2026-07-29)

A full audit before live testing. **Everything below was verified by simulating
real authenticated sessions in Postgres** (`set local role authenticated` +
`request.jwt.claims`), not by reading code — because RLS does not apply to the
service-role connection the MCP tools use, so a code read proves nothing.

### Privilege escalation (was: any Department Head → Super Admin)
`profiles` UPDATE was `USING ((id = auth.uid()) OR app_is_dept_admin())` with no
`WITH CHECK`, and `app_is_dept_admin()` is a **global** flag that is true for l3
(Department Heads) — so any Department Head could edit every profile in the
company. The guard trigger `prevent_self_privilege_escalation` then *exempted*
every dept_admin from its own check, so they could set `is_super = true` on
themselves and demote the real super admins.

Fixed: the trigger now raises (never silently clamps) — `is_super` is
super-admin-only in both directions, nobody below super may edit a super's row,
no self rank change, no granting a rank more senior than your own, and
template/overrides changes are held to the same bar as the Permissions tab.
`profiles` UPDATE gained a matching `WITH CHECK` and l3 is scoped to their own
department via a new `app_my_department()`. Verified: 4 escalation paths blocked,
control (editing own phone) still works.

### Four forgeable write paths
All were `INSERT ... WITH CHECK (true)` for authenticated — the same class of gap
already fixed on `form_submissions`:
- **`doc_versions`** (worst): anyone could insert a version onto *any* doc,
  including ones they cannot read, with `head_status`/`audit_status = 'approved'`
  — **fabricating the head-reviewer and Internal Audit sign-off** the SOP
  workflow exists to record. Now: parent doc must be readable, `submitted_by`
  must be self, review attribution columns must be empty, and an SOP version
  must enter as `pending`. Non-SOP plain attachments keep straight-to-approved
  (the only legitimate use — `attachPlainFile` renders under `!d.is_sop`).
- **`audit_log`**: could be written with any `actor_id` → forged compliance
  trail. Now `actor_id = auth.uid()`.
- **`notifications`**: fully anonymous sends to anyone. Now carries an
  `actor_id` (DB default `auth.uid()`, pinned by RLS) so no in-app notification
  can be anonymous, plus a body length cap. Cross-user sends still work — they
  are legitimate (reviewer/reassignment alerts) — they are just attributable now.
- **`docs`**: `owner_id` could be set to a colleague. Now must be self.
- **`form_submissions`**: kept open on *who* (the portal is unauthenticated) but
  closed on *what* — `task_id` must be null and `status` must be `'new'`, so a
  request can no longer arrive pre-linked or pre-resolved, skipping the queue.

Verified: 5 forgeries blocked, 5 legitimate flows unaffected.

### Cross-user reminder deletion (found while fixing perf lints)
`reminders` had two policy sets that OR'd together: `own_reminders_*`
(`profile_id = auth.uid()`) and `reminders_*` (`app_can_write_task(task_id)`).
Since permissive policies OR, anyone with write access to the related task could
INSERT, UPDATE or **DELETE another person's private reminder** — while
`own_reminders_select` meant they could not even read it. Every
`createReminder()` call site passes `profile_id: me.id`, so the task-based set
was unused leftover. Dropped.

### Robustness / abuse
- **No error boundary existed at all** — one render throw white-screened the
  entire app with no recovery. Added `app/error.tsx` and `app/global-error.tsx`.
  Note Next 16 renamed the retry prop to `unstable_retry` (`reset` still exists
  but only re-renders; `unstable_retry` re-fetches, which is what a transient
  Supabase failure needs).
- **Rate limiting**: `/api/sansi` already had a limiter (named `allowRequest`,
  which an earlier grep for "rateLimit" missed). It was missing on
  `summarize-sop` (also Gemini-backed) and `notify` (sends Brevo email).
  Extracted to `lib/server/rate-limit.ts` and applied to all three. The public
  portal inserts straight into Postgres and never passes through a route, so its
  throttle lives in a `form_submissions` BEFORE INSERT trigger: 10/min per form,
  60/min global, 20KB payload cap, signed-in users exempt. Verified: 10 accepted
  then blocked at 11; oversized blocked; 15/15 accepted for a signed-in user.
- **`avatars` bucket** allowed any signed-in user to enumerate every avatar file.
  Scoped to own folder (+supers); public-bucket URLs bypass RLS so avatars still
  render, and `upsert: true` still works. Added a missing DELETE policy so a
  replaced avatar can be cleaned up. Verified: non-super went from 5 visible → 1.

### Performance: 125 lints → 36 → 0
- **58 unindexed foreign keys → 0.** Postgres never creates these automatically.
- **30 `auth_rls_initplan` → 0.** Argument-free calls (`auth.uid()`,
  `app_is_super()`, `app_rank()`, …) now sit in a scalar sub-select so they are
  evaluated once per statement instead of once per row. Row-dependent calls
  (`app_rank_of(requester_id)`, `app_can_read_doc(d.department_id, …)`) were
  deliberately left alone — they cannot be hoisted.
- **36 `multiple_permissive_policies` → 0.** All from one shape: an admin write
  policy declared `FOR ALL` sitting beside a dedicated SELECT policy, so every
  read evaluated two predicates. Split into explicit INSERT/UPDATE/DELETE; where
  the read policy was narrower, the ALL policy's read branch was folded in with
  OR so effective permissions are **unchanged**.
- The 59 new `unused_index` INFO lints are simply those FK indexes not yet
  scanned at seed volume; they resolve themselves under real traffic.

**Verification method worth reusing:** before each RLS migration, a
per-role × per-table visible-row-count baseline was captured for 4 users
(super / dept head / internal audit / staff), then re-run afterwards and diffed —
**0 mismatches** across 104 and then 64 checks. Admin writes were re-tested with
`GET DIAGNOSTICS row_count`, not exception-catching: an UPDATE blocked by RLS
affects 0 rows *without raising*, so exception-based tests give false passes in
both directions. Full `tsc`, `vitest` (38/38) and `next build` clean after.

### Still open (needs the dashboard, cannot be done over SQL)
- **Leaked-password protection is OFF.** One toggle: Supabase → Authentication →
  Policies → enable "Leaked password protection" (checks HaveIBeenPwned).
- Deliberately unchanged: `read_all_profiles USING (true)` — every employee can
  read every colleague's phone/WhatsApp/birthday. Defensible as a company
  directory, but it should be a conscious decision, not a default.
- The remaining `SECURITY DEFINER` advisories on `app_*()` are inherent to the
  helper-function pattern: RLS evaluation requires the calling role to hold
  EXECUTE, and they only return facts about the caller's own privileges.
  `get_invite`/`complete_invite` are anon-callable by design for pre-auth invite
  redemption and are gated on a 122-bit token.

## Overview department-filter fix + PWA safe-area + 7-item backlog batch (2026-07-28)
**Overview didn't scope to the department dropdown.** Two root causes in
`company-section.tsx`: only two of the several lists driving the page were
being filtered by department, and department-membership lookup ignored the
home-department fallback (a person assigned only via `profile.department_id`,
with no separate `Assignment` row, fell out of scope). Fixed with a single
`membersOf` Map and `scopedTasks`/`inScope` derivation that every card on the
page now reads from. Verified against direct SQL counts for Sourcing & Trade.

**PWA rendered under the iOS status bar, hamburger button malformed.** The
shell had no top safe-area padding at all — an earlier "fix" had wrongly
padded the hamburger button itself instead of the shell. Fixed via
`.sw-app-shell { padding-top: env(safe-area-inset-top) }`, repositioned
`.sw-hamburger`, and matching insets on `.sw-modal-card`/`.sw-slideover-card`
for full-screen mobile modals. Verified with simulated iPhone-15-Pro-inset CSS
at 393×852 and a scripted DOM scanner for intrusions into the unsafe zones —
found and fixed one real bug (the "Create new task" modal's header/footer sat
under the status bar/home indicator).

**Then the remaining backlog was built in one batch, in order, skipping the
org Excel round-trip (separate in-flight item below) and the 30-user seed
(still explicitly deferred):**
1. **Sansi 2.0 info-finder** — `app/api/sansi/route.ts` now extracts search
   terms from the user's question (stopword-filtered, 4+ chars) and greps
   `docs`/`forms` by title/excerpt/category before answering, so "where's the
   SOP for X" grounds in real matching documents. RLS (cookie-scoped client)
   naturally limits what it can see — no extra visibility check needed.
2. **Drag-to-reorder everywhere** — new `sort` column on `tasks` (and reused
   on `lists`), `reorderTasks()`/`reorderLists()` in `actions.ts` re-space by
   `(i+1)*10` per move via individual `.update()` calls (not `upsert` — that
   validates NOT NULL columns on the insert path even when only an UPDATE
   would occur). Wired into the tasks table view, kanban (same-column reorder
   vs. cross-column status-change disambiguated via `stopPropagation()`), and
   admin-gated sidebar board reordering.
3. **Efficiency ranking dashboard** — `company-section.tsx`'s "People
   efficiency" card rewritten into a ranked list (crimson rank for top 3) with
   a separate "not ranked" sub-list for people with no tracked work, reusing
   the existing department-scoping from item above.
4. **Forms → ticket system** — `form_submissions.status` (`new` /
   `in_progress` / `resolved`), independent of task conversion, so a
   submission can be resolved directly (duplicate, spam, answered by reply)
   without ever becoming a task. Per-submission status `<select>` in both the
   per-form list and the admin "Form submissions (tickets)" panel.
5. **Internal memo section** — new `memos` table + `/memos` page. RLS
   deliberately split: `memos_insert` allows any dept admin, but
   `memos_update`/`memos_delete` are author-or-super only — a blanket
   `app_is_dept_admin()` on all commands would have let one dept head edit or
   delete another's memo (the same class of bug already caught once this
   session in `form_submissions`).
6. **Invite reminders** — "Send reminder" button on non-registered invite rows
   in the admin Invites tab, reusing the exact same `/api/notify` `kind:
   "invite"` path the original "Send invite" button uses (idempotent —
   re-sends the same invite email against the existing `inviteId`, no new
   invite row).
7. **Responsive walkthrough** — `onboarding.tsx`'s bottom-fixed elements
   (checklist card, completion toast, reopen bubble) now add
   `env(safe-area-inset-bottom)`/`env(safe-area-inset-right)`, matching the
   PWA safe-area fix above; the completion toast's conflicting
   `left`+`right`+`width`+`marginLeft` mix was simplified.

**Verified live** (Sansi Test User temporarily elevated to super admin via
direct SQL, then reverted): posted and deleted a memo (RLS insert/delete both
exercised — delete correctly limited to author/super), changed a ticket's
status to `resolved` and confirmed the DB row (`task_id` stayed `null` —
resolved without conversion) and that it correctly dropped off the "pending"
count, clicked "Send reminder" on a real non-registered invite (route fired,
failed only on `Brevo error 401 Key not found` — a local-dev credential gap
already present for the original "Send invite" button, not a new bug), and
confirmed the efficiency ranking card renders with the right formula subtitle
and rank order on `/overview`. **Not verified live**: drag-to-reorder — native
HTML5 `draggable`/`dragover`/`drop` events don't fire from synthetic mouse
clicks in browser automation (confirmed: a simulated drag only produced a
text-selection highlight, no reorder), so this is typecheck+test-verified but
not confirmed by an actual drag in a real browser session. Do that manually
before treating item 2 fully done.

Full-batch `npx tsc --noEmit` and `npx vitest run` (38/38) both clean after
every change above, run together as a final pass, not just per-feature.

## Status: open
- **Drag-to-reorder**: needs one real manual drag test (table row, kanban
  card, sidebar board) — browser automation can't simulate native HTML5 DnD.
- 30-user seed — explicitly deferred by user ("don't build the seed data now").
- Org Excel round-trip — separate in-flight item, see below.

## In flight right now
- **`Sansico-Org-Setup.xlsx`** (project root, one level above `sansiworks/`): 6-sheet workbook
  (READ ME, Org Units, People, Unit Heads, Cross-Unit Assignments, Levels & Rights), pre-filled
  from live DB, dropdown-validated, yellow=editable, grey example row. User will edit and send
  back → rebuild org seed data from it. Builder script: scratchpad `build_org_workbook.py`.

## Key files
- `src/lib/store.tsx` — one realtime channel, full-store refresh; `src/lib/actions.ts` — logActivity/notify/logAudit
- `src/lib/logic.ts` — locked formulas (efficiency 75/25, risk, at-risk, unblocker) + rank checks; tests beside it
- `src/components/workspace-section.tsx` — admin console (users/hierarchy/…/audit + CSV export), forms admin
- `src/components/org-admin.tsx` — org tree/assignments/permission templates
- `src/lib/ui.tsx` — routing/nav + `mobileNavOpen`; `src/app/[[...path]]/page.tsx` — shell + hamburger
- DB access: Supabase MCP `execute_sql` on project `nqktxuilscqapitrzqbb`
- Research docs at repo root: DEVELOPMENT_PLAN.md, SANSI_AI_RESEARCH.md, DOCS_FORMS_RESEARCH.md

## Conventions
- Ranks/permissions always resolved by level/headship rows, never hardcoded names.
- Never fabricate audit/review records; unattributed = "—" + honest note.
- Optimistic `patch()` + Supabase write; toasts via `pushToast`.
- Typecheck (`npx tsc --noEmit`) + `npx vitest run` before claiming done; verify in Browser pane.
