# SansiWorks — Session Handoff

> Kept current at every major milestone so any fresh session (or fresh context window)
> can pick up without re-deriving state. Last updated: **2026-07-19**.

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
- Audit package: `logAudit()` in `lib/actions.ts` wired into ALL admin/permission/org/SOP
  mutations (audit_log previously had ZERO writers); CSV export in admin → Audit log tab.
- Forms flow: required owner (`forms.default_assignee_id`), service-role notify route
  (`api/forms/notify-submission`), conversion assigns to owner. Vendor Onboarding owner: Dewi Santoso.
- Legacy SOP migration done honestly — unattributed records marked "—", never fabricated reviewers.
- SOP visibility: owning dept + Board/Group/Regional heads + Internal Audit (rank-based, never name-based).

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
