# Docs & Forms — research and recommendation

**Status:** research only — no code changed. This is the review checkpoint before the Docs/Forms build phase, matching how Sansi AI was scoped (see `SANSI_AI_RESEARCH.md`).

---

## What Docs actually is today

The "Docs & SOP library" stores metadata about documents, not documents. A doc row is `title, status, type, category, version, owner_id, review_date, excerpt` — plus a `body` field that exists in the schema but is **never read or written anywhere in the app**. You can create a doc (title/type/category/excerpt), see it in a card, click through to a detail popup showing that same metadata with review-date coloring — and that's the entire lifecycle. There is no edit, no content, no file, no delete, no version history despite a `version` field, and no way to mark a doc reviewed/approved short of never changing its status after creation. The search box on the Docs tab is rendered but not wired to anything — typing into it does nothing.

So today "Docs" is really a **document *register*** (a index card catalog), not a document *system*. It's useful for knowing a policy exists, who owns it, and whether it's overdue for review — not for actually storing or reading the policy itself.

## What Forms actually is today

Forms is further along and has a real surprise: there's a genuinely working public submission portal (`/portal`) that lists live forms, renders short-answer/paragraph fields, and writes submissions to Supabase with a generated reference number. That's a complete, working end-to-end path for external people to fill something out.

But the loop doesn't close. The Forms tab's own copy says "every submission becomes a task in the list you choose" — that's aspirational, not real. Nothing in the codebase reads `form_submissions` back into the app. Submitted answers go into Supabase and are then invisible forever inside SansiWorks itself; nobody sees them, and they never become tasks despite the UI promising exactly that. On top of that, the "Edit" button on an existing form is a literal stub — it shows a toast reading "Form editing arrives with the next update" and does nothing else.

So Forms has the *hard* half done (public intake) and is missing the *whole point* of the other half (getting those answers back to the team as actionable work).

## The two things worth fixing, and why they're not equally urgent

### 1. Forms: close the submission loop — this is the real gap

This isn't a nice-to-have, it's the feature not existing. Right now, if Sanjeeva sends a vendor-onboarding form link to a supplier and they fill it in, that answer sits in a database table no one in the app ever looks at. Fixing this needs:

- A submissions view on the Forms tab (per form: count, list of responses, each answer set).
- The actual "submission → task" conversion the copy already promises: on new submission, create a task in the form's destination list, named from the form + a reference number, with the answers attached (as a doc-style excerpt or structured fields) so it's actionable instead of just logged.
- Fixing the dead Edit button — at minimum, allow editing the field list of an unpublished/paused form; editing a *live* form's questions is a judgment call (does it retroactively affect prior submissions' meaning?) worth a deliberate answer, not a default.

This is the one I'd prioritize, because it's the difference between a form being a demo and being something people can actually depend on operationally.

### 2. Docs: give it actual content — real, but lower urgency

Docs today works fine as a lightweight policy *register*: knowing a SOP exists, who owns it, whether it's overdue for review. Adding real content (a `body` editor, file attachment, version history, an actual review/approve action) turns it into a real document system, but none of that is *broken* the way Forms' missing submission loop is — it's *incomplete*. The search box being non-functional is a small, cheap fix that should happen regardless of how far the rest goes.

I'd scope this in two tiers:
- **Cheap, high-value:** wire up the search box; add an "Edit" action for the metadata fields that already exist (title/category/status/owner) since right now a doc is frozen the instant it's created — that's a bigger practical annoyance than lacking rich text.
- **Bigger, worth a deliberate yes:** an actual content editor for `body` (even plain markdown-in-a-textarea would beat what exists now, which is nothing), file attachments, and a real review/approve workflow that logs who reviewed and when instead of just a bare `review_date`.

## What I recommend building, and in what order

1. **Forms: submissions viewer + submission→task conversion** — closes the actual broken promise in the current UI; highest real value.
2. **Forms: fix the dead Edit button** for paused/unpublished forms at minimum.
3. **Docs: wire up search, add metadata editing** — cheap, removes an existing rough edge.
4. **Docs: real content** (`body` editor, attachments, review workflow) — bigger scope, do this once 1–3 are settled and if you still want Docs to be a full document system rather than a register.

I did **not** include: a rich WYSIWYG editor (plain textarea/markdown is enough to start — a full editor is a separate, larger decision), doc permissions/visibility beyond today's workspace-wide access, or conditional-logic form fields — all reasonable future asks, not part of closing the current gaps.

## What I need from you to proceed

1. **Order above OK?** I'd build in the order listed (submissions loop → dead Edit button → docs search/edit → docs content). Agree, or reprioritize?
2. **Submission → task conversion**: should *every* submission auto-create a task, or would you rather review submissions first and convert manually? Auto-create is more useful but assumes every submission deserves a task; manual review is safer if some forms get noise/spam.
3. **Docs content scope**: is a plain-text/markdown body enough for now, or do you want something richer (e.g. file upload as the primary content, with body as an optional description)? This changes how much work step 4 actually is.

Once you confirm, I'll start with item 1.
