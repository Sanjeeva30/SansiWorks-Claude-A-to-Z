# SansiWorks — Session Handoff

> Kept current at every major milestone so any fresh session (or fresh context window)
> can pick up without re-deriving state. Last updated: **2026-07-27**.

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
