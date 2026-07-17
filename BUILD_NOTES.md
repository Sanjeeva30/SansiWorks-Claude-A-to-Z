# SansiWorks build notes (working doc for the build session)

## Mission
1:1 port of the Claude Design handover into a fully functional Next.js + Supabase app.
Design source of truth (extracted zip):
`/private/tmp/claude-501/-Users-sanjeeva-Documents-Claude-SansiWorks-Claude-A-to-Z/e74fd54b-d635-4bb1-b10a-08726657fc1b/scratchpad/handover/handover-final/`
- `SansiWorks.dc.html` (5803 lines) — whole app. Markup lines 1–3265, logic script lines 3267–5803.
- `SansiWorks Onboarding.dc.html` (376 lines) — invite email / accept invite / login / onboarding tour.
- `README.md` — locked decisions & formulas (dept risk, efficiency 75/25, at-risk rule, critical unblocker, 4 emails, dept permissions).
- Design system CSS/tokens at `/Users/sanjeeva/Downloads/sansiworks-design/project/_ds/sansico-group-design-system-2f4e2acb-ff7a-44bc-89ed-fd2a482283bc/` (already ported into `src/app/globals.css`; fonts copied to `public/fonts`).
- Reference render served: `python3 -m http.server 8901` in the handover dir (symlink `_ds` added) — compare side by side.

## User decisions
- Seed data: 2 months back / 2 months forward (done — 117 tasks).
- Sansi AI: real, via **Gemini free tier** (user will paste GEMINI_API_KEY).
- Brevo: user will paste BREVO_API_KEY (v3). Sender: "Sansico Group" <sanjeeva.gunawardena@gmail.com> (verified).
- Timezone: Asia/Jakarta (user local).
- Everything must be free-tier. Never touch other existing projects (supabase "SansiWorks V1", "sansiflow" (paused by consent), other vercel/github/brevo assets).
- Show fully working app on local server BEFORE GitHub/Vercel push.
- If multiple design variants of same screen found → ask user (README says zip has none).

## Infra
- Supabase project: `sansiworks-app`, ref `nqktxuilscqapitrzqbb`, https://nqktxuilscqapitrzqbb.supabase.co (ap-southeast-1, $0).
- Auth users (password `SansiWorks2026!`): dewi.santoso@sansico.com (super, l3), budi.hartono (l4), rina.wijaya (l5), made.pratama (l6), siti.rahayu (l3), sanjeeva.gunawardena@gmail.com (super, l2 Group Head).
- Fixed UUIDs: profiles 00000000-0000-4000-a000-00000000000{1..6} (Dewi,Budi,Rina,Made,Siti,Sanjeeva); depts 10000000-…{1..4} (IGP, S&T, Fin, ESG); spaces 20000000-…{1..3}; lists 30000000-…{1..4} (Q3 Orders, Bank Docs, Vendor Onboarding, Month-end); canonical tasks 40000000-…{01..10}.
- `.env.local` has SUPABASE URL + publishable key; BREVO_API_KEY/GEMINI_API_KEY pending from user.

## App structure (Next 16, App Router, src dir; NOTE: Next 16 = async cookies()/params, proxy.ts not middleware.ts, Turbopack)
- `src/app/globals.css` — full token port + design's style block + dark theme via `[data-sw-theme="dark"]`.
- `src/proxy.ts` — Supabase session refresh + auth gating (public: /login, /accept-invite, /invite-email, /portal, /api).
- `src/lib/` — types.ts (Task/Profile/etc + STATUS_COLORS/PRIORITY_COLORS + initials), dates.ts (iso, fmtShort, parseNLDate — verbatim from design), logic.ts (efficiencyScore 75/25, departmentRisk, atRiskTasks, criticalUnblocker, workloadPct), store.tsx (StoreProvider loads ALL tables into context + patch()), supabase/{client,server}.ts.
- Main app: single client-side shell at `/` with design's section state: sidebar (`section`: home | list pages | company | workspace) exactly as .dc.html.
- Design uses ONE merged component; port structure: `src/components/` → Sidebar, TopIcons (Sansi popover, theme, notif), HomeSection, ListSection (table/board/calendar/gantt + My List + Everything), CompanySection (Overview=executive + People), WorkspaceSection (Inbox, Docs, Forms, Settings, Admin tabs), modals (TaskDetail slide-over, Profile, QuickAdd, RequestBoard, Fields/Automations/Templates, NewDoc/NewForm, Nominate, DeptModal, MetricModal), CommandPalette, PublicPortal, Toasts.
- Status pills: Not Started #8C837C, Working on it #22409E, Stuck #F3263E, Done #0D4F31. Priority: Low #0D4F31, Medium #22409E, High #7A0D20, Critical #F3263E.
- Keyboard: Ctrl/Cmd+K palette, Ctrl/Cmd+T + 'n' = new task, Escape cascade.
- Toast: dark pill bottom center, brand strip flash when "to Done", Undo support, 5.2s auto-dismiss.

## Design logic quick-reference (from .dc.html script)
- rootVars dark/light (ported to CSS above). fieldHeight 40px.
- managerOf(person) = USER_ASSIGNMENTS.managerId or 'Dewi Santoso'; RACI auto-A = manager of first assignee ("auto" tag; "manager" tag in dropdown).
- Personal (My List) tasks skip A entirely (creator R+A).
- getPersonEfficiency: 75% (onTime/(onTime+late)) + 25% (1 - overdueOpen/open); color ≥80 green, ≥60 #B7791F, else red.
- Sansi popover placeholder reply: 'Got it — I'll look into "…"' → replace with real Gemini call via /api/sansi.
- wa.me test: https://wa.me/<digits>?text=SansiWorks: 3 tasks due today...
- Home: 5 metric tiles (open, due this week, at risk, completed this week, projects active), status tabs, deadlines, at-risk, company pulse (health 78 conic), Today/My Week toggle, density toggle, missed banner.
- Notif preview shows 3, badge=3 (use real unread count).
- Email cards in Settings: 4 (digest, Monday plan Mon 08:00, Friday wrap Fri 15:00, instant) + per-category prefs matrix (instant/digest/inapp/off) + WA toggle + digest preview modal.

## Remaining design file regions to port (markup)
- 1290–1693: task detail files tab end, list QuickAdd modal, Fields/Automations/Templates/CreateTemplate modals, list Profile modal.
- 1694–2143: Company (Executive + People + task modal + widget picker + profile).
- 2144–3265: Workspace (Inbox/Docs/Forms/Settings/digest preview/Admin(hierarchy,users,approvals,invites,features,departments,audit) + modals + metric modal + palette + portal + toasts).
- Logic/render props: 4100–5803 (home render ~4388–4600, list ~4630–4975, company ~4980–5310, workspace ~5315–5715, root ~5718–5803).
- Onboarding file: all 376 lines.

## Email/cron plan (free)
- 4 emails via Brevo REST (`https://api.brevo.com/v3/smtp/email`) from `/api/cron/*` routes; Vercel Hobby cron: daily digest (08:00 WIB = 01:00 UTC), Monday plan (Mon 01:00 UTC), Friday wrap (Fri 08:00 UTC), instant alerts fired on mutation server-side. Guard with CRON_SECRET. Local: trigger manually to demo.
- Sansi: `/api/sansi` → Gemini `gemini-2.0-flash` free tier w/ workspace context summary.

## Status / TODO
- [x] Schema + RLS + seed (see migrations in Supabase).
- [x] globals.css, layout, proxy, lib files, store.
- [x] Components + pages — all sections verified live.
- [x] Login/onboarding pages.
- [x] API routes (sansi, emails, cron) — keys pending from user.
- [x] Local run verified (dev server via .claude/launch.json, autoPort).
- [ ] Git init/commit → GitHub → Vercel (AFTER user approves local demo).
