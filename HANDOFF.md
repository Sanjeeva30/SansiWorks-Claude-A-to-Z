# SansiWorks — Session Handoff

> Kept current at every major milestone so any fresh session (or fresh context window)
> can pick up without re-deriving state. Last updated: **2026-07-28** (company-wide data-visibility incident).

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
- Invites always use the sender's own `department_id` — no department picker, so
  an admin cannot invite into another department.
- `sanjeeva.sansico@gmail.com` exists as a real test account from this audit
  (password `InAppSansi2026!`). Delete it before go-live.

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

## Status: open
- Phase 4 remainder: **Sansi 2.0 info-finder** and **realtime multiplayer presence**.
  (Comments/@mentions and the mention-email gap are done — see roadmap 9.)
- 30-user seed — explicitly deferred by user ("don't build the seed data now").
- User's screenshot backlog (feedback given, plan pending user prioritization): drill-down
  everywhere, Sansi info-finder, efficiency ranking dashboard, collapse/expand-all spaces,
  admin delete w/ confirmations, invite reminders, dropdown visibility, registration flow
  compulsory fields, org Excel round-trip, drag-reorder, forms→ticket system, responsive
  walkthrough, internal memo section.

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
