# Sansi AI — research and recommendation

**Status:** research only — no code changed. This is the review checkpoint before Phase 4 build, per the development plan.
**Constraint respected:** stays on the Gemini API free tier throughout, as you asked.

---

## What Sansi actually is today

I read the live code (`src/app/api/sansi/route.ts`). Today, every question you ask Sansi does exactly this:

1. Fetches up to 60 open tasks, company-wide, regardless of who's asking or what they asked.
2. Pastes them as a flat text list into one prompt, with no RACI, no subtasks, no approvals, no reminders, no org-unit/assignment context, no memory of anything you said a moment ago.
3. Sends that single prompt to Gemini once and returns whatever comes back.

That's a Q&A layer, not an assistant. It can answer "what's overdue?" reasonably. It cannot answer "who's the finance contact for IGP Sleman?" (doesn't know assignments exist), cannot create anything, and forgets the conversation the instant you ask a follow-up.

## The three gaps, and what closing each one actually requires

### 1. Grounding — right now it's a data dump, not a lookup

The fix isn't "send more data" (that burns tokens and free-tier quota fast) — it's "send the *right* data." Concretely: before calling Gemini, the route should look at the question and the asker, and pull only what's relevant:

- Their own tasks/subtasks (R, A, C, or I) — always included, it's usually what "my workload" questions mean.
- Named entities in the question — if someone types "Ambar" or "IGP Sleman," resolve that against profiles/org units and pull *their* context, not everyone's.
- Org-engine facts — assignments, reporting lines, department heads — so "who approves X" and "who's the contact for Y plant" become answerable, which they cannot be today.
- Recent approvals and reminders for the asker.

This is a retrieval step in plain code (no AI needed for it) that runs before the Gemini call — cheap, fast, and it's what turns "generic chatbot" into "knows this workspace."

### 2. Actions — right now Sansi can only talk

Gemini's API supports **function calling**: you describe a set of tools (e.g. `create_task`, `create_reminder`, `request_extension`) with typed parameters, and the model decides when to call one instead of just replying with text. The building blocks you already have for this are perfect fits — `createTask`, `createReminder`, and `requestDueDate` in `src/lib/actions.ts` already enforce your RACI and rank rules, so Sansi would call the *same* validated functions a human clicking through the UI would, not a shortcut around them.

The non-negotiable design rule here: **Sansi drafts, a human confirms.** It should never silently create a task or send a request — it proposes ("I'll create a task 'Renew ISO 17025 cert', assigned to Budi, due Friday — create it?") and waits for a click. This matches how the rest of the app already treats side effects, and it's the only way this stays trustworthy.

### 3. Proactivity — right now it only speaks when spoken to

This is the highest-leverage, lowest-risk piece to add first, because it reuses infrastructure you already have: the cron-driven email/digest system. A scheduled job (same pattern as the daily digest) can ask Gemini to look at each person's *already-computed* risk signals — `atRiskTasks`, `workloadPct`, capacity, upcoming approvals — and turn the boring list into a short, useful flag: *"Dewi is at 120% capacity and has the Mandiri filing due Friday."* No new AI capability required, no function-calling — it's the existing digest email logic with Sansi's voice on top. This could ship before the "actions" work even starts.

## Free-tier reality check — read this before committing to scope

The Gemini API free tier (an AI Studio key, which is what `GEMINI_API_KEY` is) has real ceilings — requests-per-minute and requests-per-day caps that vary by model, and they've moved before as Google's changed pricing tiers. I'm not going to assert exact current numbers here because I can't verify them live from this environment and they're the kind of detail that goes stale fast — **before we build anything that calls Gemini more often** (grounding + actions naturally increase call volume versus today's one-shot Q&A), I should pull the current published limits so we size correctly. That's a five-minute check, not a blocker, but I want to do it with real numbers, not guesses.

What this means practically for design, regardless of the exact numbers:

- **Grounding should not increase call count** — it's a pre-processing step before the single Gemini call, so it's free (in the token sense) beyond slightly larger prompts.
- **Actions add one call per confirmed action** (to double check the model's proposed parameters are sane) — this is small in practice since people don't create dozens of tasks via chat.
- **Proactive digests are the actual quota risk** — one Gemini call per person per day, scaled across everyone at Sansico, is the first thing that could approach a free-tier ceiling. The mitigation is straightforward: batch people into fewer calls (one call describing multiple people's risk lines, not one call each), which also happens to produce more consistent phrasing.
- Every call needs graceful degradation: if Gemini returns a quota error, fall back to the current plain-data digest (which already works without AI) rather than showing an error.

## What I recommend building, and in what order

1. **Grounding rewrite** (no new capability, just correctness) — the context-builder becomes relevance-aware instead of a blind dump. This alone fixes most of "Sansi doesn't understand our org" and costs nothing extra in quota.
2. **Proactive flags in the existing digest** — reuses the cron/email pipeline, adds Sansi's voice to data you already compute. Low risk, visible value, no new UI.
3. **Action capability, starting with exactly one action** (task creation, since it's the most common ask) with a confirm-before-execute UI — prove the pattern safely before adding more actions (reminders, extension requests).
4. **Light conversation memory** — keep the last handful of exchanges in the browser session (not persisted server-side, to avoid a new privacy surface) so follow-up questions work.

I deliberately did **not** include: switching AI providers (staying on Gemini as you asked), giving Sansi write access beyond the confirm-gated actions above, or any persistent cross-session memory of what people ask it — that's a privacy decision worth a deliberate yes from you later, not a default.

## Where I'd push back if you asked for more right now

If the instinct is "let's just make it powerful," the actions layer is the part I'd slow down on. Every action Sansi can take is a place where a misread instruction creates a task with the wrong Accountable, or an extension request goes to the wrong approver. Starting with one action, confirm-gated, and watching how it's actually used before adding a second, is the responsible order — not because the tech is hard, but because trust in an assistant that occasionally does the wrong thing recovers slower than trust in one that's simply limited.

## What I need from you to proceed

Nothing blocking — but two calls worth making explicitly:

1. **Order of the four items above** — I'd build in the order listed (grounding → proactive digest → one action → memory). Agree, or reprioritize?
2. **First action to support** — I assumed task creation. If reminders or extension requests matter more to how you'd actually use this day to day, say so and I'll build that one first.

Once you confirm, I'll pull current Gemini free-tier limits for real numbers, then start with item 1.
