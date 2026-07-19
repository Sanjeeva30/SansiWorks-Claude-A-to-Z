# SansiWorks — Master Development Plan

**Written for:** Sanjeeva (non-technical reader welcome — every section explains itself before it gets technical)
**Purpose:** one document that says what we're building, why, in what order, and exactly where every piece of it lives online.
**Status:** aligned and approved to start, 2026-07-18.

---

## How to read this document

- **Part 1** is the story — what SansiWorks is for and how the pieces fit together. No jargon.
- **Part 2** is the build order — every phase, in sequence, with what "done" looks like for each.
- **Part 3** is the technical appendix — for a developer (or future-you) to find any account, key, or file.

If you only read one part, read Part 2 — it's the actual plan.

---

# Part 1 — What we're building and why

SansiWorks is Sansico Group's internal work-management app. It replaces scattered WhatsApp messages, spreadsheets, and email chains with one place where:

- every task has exactly **one person doing it** (Responsible) and **one person accountable for it** (Accountable), with anyone else who needs to know or weigh in cleanly separated as Consulted or Informed — a governance discipline called **RACI**, borrowed from project management best practice, applied for the first time to how Sansico actually runs.
- the org chart — divisions, departments, the vendor organisation, and all plants — is **real, editable data**, not a diagram nailed to the wall. Add a plant, add a department, promote someone: it's a form, not a redevelopment.
- the app already knows Sansico's shape: who outranks whom, which plant belongs to which cluster, who the regional finance manager for Jogja is — so when you create a task, it suggests the right person instead of making you remember an org chart.
- reminders, emails, and an AI assistant all read from the same live data, so nothing you see in the app disagrees with what lands in your inbox.

## The organisation, as the app will understand it

This is the structure we aligned on, translated into "how the software thinks about it":

- **The Board** sits at the top. A handful of departments report straight to the Board rather than through a division — Trends & Market Intelligence, Design & Product Development, Design & Innovation, Technology & Innovation. These are modeled as departments too; they just have the Board as their parent instead of a division.
- **Two divisions** report to the Board: **Strategic Support** (you + Michelle Ghozali, equal authority) and **Operations** (Remi + Kevin Ghozali, equal authority). Each division has its own set of departments (Finance & Accounting, HR, IT, Compliance, Sourcing & Procurement... for Strategic Support; Marketing, PDD & QA, Technical Support, PPIC, Logistics... for Operations). **None of these are hardcoded** — the super admin creates, renames, and reassigns every department from the admin panel.
- **The vendor organisation** is a mirror of head office, one layer down, split into two clusters:
  - **Jogja cluster** (all IGP plants — Sleman, Klaten, Tempel, Piyungan, and any future IGP plant) has a full regional layer: **Marlina** (strategic-support side, reports to you) and **Oskar** (operations side, reports to Remi). Regional functional managers sit under one of them by function — Ambar (F&A) and Niken (HR) under Marlina; Meka (QA/QC) under Oskar. Jogja plant managers report to Oskar.
  - **Jakarta cluster** (Printec 1, Printec 2, Grafitec) has **no regional layer** — you and Remi run it directly, and head-office department heads (Wenny for F&A) double as the cluster's functional heads. Jakarta plant managers report to Remi.
- **Every plant is its own small organisation** with its own ladder (plant manager → production manager → PPIC → staff). A plant's own strategic-support staff (its finance person, its HR person) report one level up to their function's cluster head — Ambar/Niken in Jogja, Wenny's department in Jakarta.
- **Clusters are named, editable groups of plants** — not a fixed list in the code. Today there are two (Jakarta, Jogja); adding a third is a form.

The engine that makes all of this work without hardcoding a single name is described in Phase 3 below. It boils down to three ideas: **a tree of organisational units** (admin-editable, any depth), **people** (with a level, a designation, and a home unit), and **assignments** (a person can hold a function — like "F&A manager" — scoped to a cluster, entirely separately from where they technically live in the tree). That third idea is what lets Ambar be "in the vendor organisation" and "the finance function for Jogja" at the same time, without special-case code.

## What already exists today

The app already has, live and working on your local machine:

- Full navigation — My Work hub, Inbox, Everything, Overview, People, Docs, Forms, Spaces, Settings.
- Task creation and editing with singular RACI (R/A/C/I), department-scoped and rank-checked assignee pickers, subtasks with their own RACI, and an intelligent "suggested assignee" panel that scores people by workload and task history.
- A reminders engine (pending → fired → dismissed, with snooze).
- Four automated emails (daily digest, Monday plan, Friday wrap, instant assignment alert) with a branded template.
- A basic AI assistant ("Sansi") that can answer questions about open tasks, using Google's Gemini.
- The metrics engine: on-time efficiency score per person and per department, at-risk task detection, critical-path "unblocker" detection.
- Onboarding/invite flow, login, and a product tour.

What does **not** exist yet, or exists but isn't wired correctly — and is therefore in this plan:

- The org-tree/assignment engine described above (today, department is a flat hardcoded-feeling list; there's no vendor-org, no clusters, no plants, no co-heads).
- Permission templates with per-person overrides.
- Notification when someone requests a deadline extension (the request works, but the approver isn't told).
- Drag-and-drop file upload (the label says it works; it doesn't yet).
- A capacity field per person (the workload formula exists but the number it divides by is hardcoded and there's nowhere to change it).
- Birthday alerts, dynamic greetings, difficulty ratings, people color-coding by department/rank, profile photos.
- A meaningfully useful Docs and Forms experience (currently bare-bones).
- A more capable Sansi AI (currently a thin question-answering layer).
- Everything already listed as Phase 3–5 in the original roadmap (org chart editor, audit trail, 30-person seed data, live multiplayer editing, comments/@mentions, drag-and-drop everywhere, mobile/PWA, automated tests, accessibility pass).

---

# Part 2 — The build, phase by phase

Each phase below has a **plain-English description**, **what changes for you day to day**, and **what "done" looks like** — a checklist you can verify yourself without reading code.

## Phase 3A — Org engine, permissions, and people admin
*The foundation everything else depends on. Nothing in Phase 3B onward can be built correctly until this exists.*

**What it is.** Replaces the current flat department list with the three-layer model from Part 1: an editable org-unit tree (divisions, departments, board-staff departments, the vendor organisation, clusters, plants — every one addable/editable/archivable by the super admin, none hardcoded), people with levels and designations, and assignments (a person's functions and the scope they cover). Co-heads are native — a unit can have one head or several, all with equal authority. Permission **templates** (Division head, Department head, Vendor rep, Plant staff, Board/advisory) control what each role can see and do, and the super admin can override any individual on top of their template, with the override visibly flagged so exceptions never go unnoticed. Two admin toggles ship here too: **capacity tracking** (off by default — the workload math is built and correct, but the number it uses is a placeholder until you decide to switch it on) and **overseas teams** (Minneapolis and Foshan units exist in the tree but stay dormant, invisible to normal use, until switched on).

**What changes for you.** A new "Organisation" section in the admin panel where you can: add a plant in thirty seconds; move a department between divisions; assign Ambar's F&A function to the Jogja cluster; set Michelle as a second head of Strategic Support; pick a permission template for a new hire and, if needed, grant or remove one specific ability for them alone.

**Done means:**
- [ ] Adding a new plant (e.g. IGP Piyungan) via the admin panel makes it immediately available everywhere a plant can be chosen — no code change, no redeploy.
- [ ] Adding a new department works the same way, and it can be assigned to either division or directly to the Board.
- [ ] A person can hold a function (e.g. "F&A manager") scoped to a cluster, distinct from their home unit — verified by recreating Ambar/Marlina/Oskar/Nawang/Wenny exactly as described in Part 1, and confirming the app resolves "who is the finance contact for IGP Sleman?" correctly.
- [ ] Two co-heads on one unit both have full head authority (both can approve, either can be picked as Accountable-eligible).
- [ ] A permission template applied to a person controls their visible screens and abilities; a per-person override changes just that one person and is visibly marked as an override in the admin view.
- [ ] Capacity and overseas-teams toggles exist in the admin panel, default OFF, and flipping them ON reveals the relevant fields/units without a deploy.

## Phase 3B — RACI refinements and rank rules
*Small, precise fixes to the RACI engine now that the org engine underneath it is correct.*

**What it is.** Two rule corrections agreed in our discussion: (1) a **subtask's Responsible can come from any department** — it's no longer locked to the main task's department; (2) once that subtask R is set, the **Accountable pool for that subtask is same-department-as-the-subtask's-R and outranks them** (the same rule the main task already follows, just applied per-subtask instead of inherited from the parent). Also in this phase: the **5-step difficulty scale** (Trivial / Easy / Moderate / Hard / Complex, replacing the informal 1-point "effort" field), set by whoever assigns the task, editable only by someone who outranks the assignor — with every change logged.

**Done means:**
- [ ] Creating a subtask lets you pick an R from any department, not just the parent task's department.
- [ ] The subtask's Accountable picker updates to show only that subtask-R's department peers/superiors, independent of the main task's Accountable.
- [ ] Difficulty is a 5-step field on tasks and subtasks, set at creation by the assignor.
- [ ] A person who does not outrank the assignor cannot edit difficulty; someone who does, can — and the change appears in the task's activity log with who changed it and when.

## Phase 3C — Notifications, approvals, and file upload fixes
*Closing gaps in things that already exist but don't fully work.*

**What it is.** When someone requests a deadline extension, their approver now gets an in-app notification and an email — today the request is recorded but silently. Drag-and-drop file upload is implemented for real on the attachment box (today it's click-only despite the label). The approval-routing logic reads from the org engine built in 3A, so a request from a Jogja plant manager routes to Oskar, from Ambar routes to Marlina, and from a Jakarta plant manager routes to Remi — automatically, matching the real reporting lines.

**Done means:**
- [ ] Requesting a deadline extension sends the named approver a notification and an email within a minute.
- [ ] Dragging a file onto the attachment box in the task drawer uploads it, with the same result as clicking to browse.
- [ ] Extension requests from three test people (a Jogja plant manager, Ambar, a Jakarta plant manager) route to Oskar, Marlina, and Remi respectively, matching Part 1's reporting lines exactly.

## Phase 3D — People, profiles, and personality
*The human layer — what makes the app feel like it's about the people who use it, not just the tasks.*

**What it is.** Profile photo upload (with crop). A color system where **hue = department** (drawn from Sansico's brand palette so the app still feels like Sansico, not a generic tool) and **shade/ring = rank** (heads get a visibly bolder treatment). A richer onboarding form with compulsory fields (name, department, rank, designation, phone, photo) and optional ones (skills tags, start date, birthday — **year optional**, so people can share the day without the year if they'd rather not). A **birthday alert** system: visible to the whole organisation, showing whoever's birthday is in the next 7 days, with a distinct "tomorrow" highlight the day before.

**Done means:**
- [ ] Every person can upload and crop a profile photo; it appears everywhere their avatar currently shows initials.
- [ ] Two people in the same department show a visibly related color; a department head's avatar is visually distinguishable from their team's.
- [ ] New-user onboarding cannot be completed without the compulsory fields; birthday can be saved as day+month only.
- [ ] A "birthdays this week" panel is visible to all users, and the day before a birthday it's called out distinctly.

## Phase 4 — Sansi AI, upgraded
*Its own research-then-build phase, because "make the AI better" deserves more than a bullet point.*

**What it is.** Two stages. First, a **research pass** (delivered as a short document, not code): what Sansi should be able to do beyond answering questions — grounding its answers in the full live workspace (not a 60-task dump), taking actions on your behalf (create a task with correct RACI, draft the Friday wrap, flag a request), and proactive flags ("Dewi is at 120% capacity and has the Mandiri filing due Friday") — all on the **Gemini free tier**, as agreed, with a clear note on the tier's limits so we know when we'd need to revisit that. Second, building whichever of those the research pass and you agree are worth doing now versus later.

**Done means:**
- [ ] A written research document exists, reviewed by you, before any Sansi code changes in this phase.
- [ ] At least one "action" capability (not just Q&A) is live and demonstrated end-to-end in the browser.
- [ ] Sansi's answers are demonstrably grounded in current data (ask about a task created five minutes earlier; it knows about it).

## Phase 5 — Docs and Forms, made worth using
*Also research-first — we don't redesign these blind.*

**What it is.** A research pass comparing how best-in-class tools (and organisational-behavior best practice) make document and form features earn their place rather than sit unused, followed by a concrete design: Docs positioned as living SOPs/meeting-notes that link to and can spawn tasks; Forms positioned as structured intake (leave requests, vendor complaints, purchase requests) that auto-creates a properly-RACI'd task in the right department. Seeded with realistic demo content — sample docs, sample forms, dummy attachments — so you can test the real experience, not an empty page.

**Done means:**
- [ ] A short research document with the comparison and the concrete recommendation, reviewed by you before building.
- [ ] At least one working example each of a doc linked to a task and a form that creates a task on submission.
- [ ] Demo data populated: sample docs, a sample form, and dummy file attachments, all visible and usable on localhost.

## Phase 6 — Admin & scale (the rest of the original Phase 3)
*Everything from the original roadmap's Phase 3 not already absorbed into 3A–3D above.*

**What it is.** The org chart *visual* editor (a diagram view on top of the data from Phase 3A — see it, not just edit it in a form), a full audit-trail export package, and expanding demo data to a realistic 30-person org so testing reflects real scale.

**Done means:**
- [ ] A visual org chart page renders directly from live data (change a department in admin, the chart updates).
- [ ] An audit export (CSV or similar) captures who changed what, when, across tasks, approvals, and org changes.
- [ ] Demo data includes 30 realistic people distributed across the real org structure from Part 1.

## Phase 7 — AI & realtime (the original Phase 4)
*Unchanged from the original roadmap, sequenced after the AI research in Phase 4 above so it builds on solid ground.*

**What it is.** Sansi 2.0 (whatever Phase 4's research and build produced, matured further), live multiplayer editing (two people in the same task drawer see each other's changes instantly), comments and @mentions on tasks.

**Done means:**
- [ ] Two browser sessions editing the same task see each other's changes without refreshing.
- [ ] Comments with @mentions notify the mentioned person.

## Phase 8 — Polish (the original Phase 5)
*Unchanged from the original roadmap — the finishing pass once everything above is real.*

**What it is.** Drag-and-drop everywhere it makes sense (not just file upload), a proper mobile/PWA experience, virtualization for long lists (so a 500-task list doesn't slow down), an automated test suite, and an accessibility pass.

**Done means:**
- [ ] The app is installable as a PWA and usable on a phone screen.
- [ ] A list with 500+ tasks scrolls smoothly.
- [ ] A test suite runs and passes in CI.
- [ ] A screen-reader pass finds no critical blockers on the core task-creation flow.

---

## Sequencing note

Phase 3A must come first — it's the foundation. 3B, 3C, and 3D can happen in any order relative to each other once 3A is done, but I'd suggest 3B → 3C → 3D since each is progressively lower-risk. Phases 4 and 5 each start with a short research document for your review before any code — that's a deliberate checkpoint, not a delay tactic. Phases 6–8 are exactly the original roadmap, resumed once the above is solid.

---

# Part 3 — Technical appendix

*For a developer picking this up, or for you if you ever need to find an account. Every credential is redacted here — this document names where things live, never the secret itself.*

## Source code

- **Repository:** `github.com/Sanjeeva30/SansiWorks-Claude-A-to-Z` (GitHub, private)
- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Local project path:** `sansiworks/` inside this working directory

## Hosting & deployment

- **Vercel** — production hosting. Deploys are connected to the GitHub repository; pushing to the main branch is what goes live. Per your standing instruction, nothing is auto-deployed to Vercel from this workspace — verification happens on localhost first, and pushes to Vercel are batched and require your explicit approval each time.
- **Scheduled jobs (Vercel Cron):** two crons are configured in `vercel.json` — the weekday morning digest/plan email (`0 1 * * 1-5`, i.e. 08:00 Jakarta time) and the Friday wrap email (`0 8 * * 5`, i.e. 15:00 Jakarta time). Both call `/api/cron/emails` and are protected by a secret (see below).

## Database & backend

- **Supabase** — Postgres database, authentication, row-level security, and file storage.
- **Project reference:** `nqktxuilscqapitrzqbb` (this is the identifier in the project's URL — not a secret, but treated carefully anyway)
- Tables include: profiles, departments, levels, spaces, lists, tasks, subtasks, reminders, docs, forms, notifications, approvals, invites, and audit entries — the org-engine phase (3A) adds org_units, assignments, and clusters to this list.
- **Row-level security (RLS):** every table is scoped so a user can only see/edit what their policies allow — this is what enforces "only see your own reminders," "only the accountable/higher-rank person can add a subtask," etc., at the database level, not just in the app's screens.

## Email

- **Brevo** (formerly Sendinblue) — sends all transactional and scheduled email (daily digest, Monday plan, Friday wrap, instant assignment alerts, invites).
- Emails are sent via Brevo's API using a stored API key (see Secrets, below); the visual template ("wrapEmailHtml") lives in `src/lib/server/email.ts`.

## AI

- **Google Gemini** — free tier, model `gemini-2.0-flash` — powers the Sansi AI assistant. Called directly via Gemini's REST API from `src/app/api/sansi/route.ts`. No other AI provider is in use, per your instruction to stay on the free tier.

## Authentication

- **Supabase Auth**, currently email/password-based (invite → accept → set password). Google OAuth sign-in is referenced in the original scope as an option; if/when enabled it would be configured as a Google Cloud OAuth client and connected to Supabase Auth's Google provider — not yet active.

## Secrets — where they live, never their values

All of the following are environment variables. Locally they live in `sansiworks/.env.local` (a file that is never committed to GitHub). In production they must be entered into the Vercel project's Environment Variables settings.

| Variable | What it's for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Address of the Supabase project (safe to expose to the browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public client key for Supabase (safe to expose to the browser, RLS does the real protection) |
| `SUPABASE_SERVICE_ROLE_KEY` | Full-access server-only key — used by cron jobs and admin actions. Never exposed to the browser. |
| `BREVO_API_KEY` | Authenticates outgoing email sends |
| `GEMINI_API_KEY` | Authenticates Sansi's calls to Google Gemini |
| `CRON_SECRET` | A password-like value the Vercel cron jobs send so `/api/cron/emails` knows the request is legitimate, not a random visitor hitting the URL |
| `APP_TIMEZONE` | The timezone used to decide when "morning" and "Friday afternoon" are, for the scheduled emails |

## Where things are, in the code, if you ever want to look

- Task/subtask/RACI logic: `src/lib/actions.ts`, `src/lib/types.ts`
- Metrics (efficiency, at-risk, critical path): `src/lib/logic.ts`
- Reminders engine: `src/components/reminders.tsx`
- Email sending & templates: `src/lib/server/email.ts`, `src/app/api/cron/emails/route.ts`, `src/app/api/notify/route.ts`
- Sansi AI: `src/app/api/sansi/route.ts`
- Main task creation UI: `src/components/quick-add.tsx`
- Task detail/edit drawer: `src/components/task-detail.tsx`

---

*This document will be updated as each phase completes, so it always reflects what's actually true of the app — not just what was planned.*
