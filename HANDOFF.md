# SansiWorks — Session Handoff

> Kept current at every major milestone so any fresh session (or fresh context window)
> can pick up without re-deriving state. Last updated: **2026-07-26**.

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
- [ ] **4. Dark-mode contrast pass** — priority chips, "View all tasks" link and
      People efficiency figures fail WCAG AA on dark. ~½ day.
- [x] **5. Honest efficiency.** `efficiencyScore()` returns `hasData`; no-data
      people render "— no data" instead of a fake 100%. `EFFICIENCY_EXPLAINER`
      surfaced on the profile modal. Company health excludes unscored depts →
      moved 97 to an honest **79**.
- [ ] **6. Sansi company-scope grounding** — asked "what is at risk this week?"
      it answers from a personal lens only, missing the 3 company criticals. ~1 day.
- [ ] **7. Scoped queries + row-level realtime.** Client still loads all 35 tables
      in full and refetches everything on any change. Hard scale ceiling before
      the 30-user seed. (`notifications`/`audit_log` reads are now RLS-scoped,
      which already trims the two worst leaks.) ~1-2 wks.
- [ ] **8. UX pass.** People list now sorts by workload (done). Remaining: tablet
      ~800px density, empty states, recurring tasks, scroll affordances.
- [ ] **9. Comments/@mentions + mention emails** — biggest missing collaboration
      loop; schema/table already exist.

## Status: open
- **Mention-digest-email gap** — @mention notifications don't reach the email digest. Approved to build.
- Phase 4 (Sansi 2.0 info-finder, realtime multiplayer, comments/@mentions) — not started.
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
