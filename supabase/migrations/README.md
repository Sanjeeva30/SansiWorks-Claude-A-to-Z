# Migrations

Schema changes are applied to Supabase project `nqktxuilscqapitrzqbb` via the
Supabase MCP `apply_migration` tool, which records them in the project's own
migration history (`supabase migration list`). This directory holds notes and
recovery scripts that belong in version control alongside the app.

## 2026-07-23 — Real RLS policies (roadmap items 1–3)

Applied migrations, in order:

1. `prevent_duplicate_tasks_in_same_list` — unique index on
   `(list_id, name, due)` where both are non-null. Blocks the seed/double-submit
   artifact that put the same task twice in one list.
2. `rls_permission_helper_functions` — `app_is_super()`, `app_rank()`,
   `app_rank_of()`, `app_is_exec()`, `app_can_write_task()`,
   `app_can_delete_task()`. SECURITY DEFINER + STABLE, search_path pinned,
   EXECUTE granted to `authenticated` only.
3. `rls_real_policies_task_family` — tasks, subtasks, task_raci,
   task_assignees, task_dependencies, task_attachments, reminders.
4. `rls_real_policies_approvals_docs_comments` — approvals (no self-approval,
   no deletes), comments (own-row), docs, doc_versions (append-only).
5. `rls_real_policies_workflow_and_config` — task_activity (no forged actors),
   audit_log (read restricted to rank<=4/super), board_requests,
   dept_proposals, nominations, forms, form_submissions, templates,
   custom_fields, automations, notifications (read own only).
6. `harden_functions_and_storage_policies` — revoke helper EXECUTE from
   PUBLIC/anon, pin `set_updated_at` search_path, avatars bucket restricted to
   own-folder uploads and authenticated listing, task-attachments anon INSERT
   narrowed to the `form-submissions/` prefix used by the public portal.

### Deliberately left permissive (verified, not oversights)
- `audit_log` INSERT — any user's action must be recordable. Table is
  append-only (no UPDATE/DELETE policy) and now readable only by rank<=4/super.
- `notifications` INSERT — `notify()` writes rows addressed to *other* people
  (assignment and approval alerts). Cannot be `profile_id = auth.uid()` without
  breaking the product. Reading is now own-row only.
- `docs` / `doc_versions` INSERT — anyone may draft an SOP; edit/delete is
  restricted and the version trail is append-only.
- `form_submissions` INSERT for `anon` — the public request portal depends on it.

### Verified by adversarial test (as a non-super rank-4 user, via RLS)
- hijacking another person's task: 0 rows
- deleting another person's task: 0 rows
- forging `task_activity` as someone else: rejected
- filing an approval as someone else: rejected
- approving one's own extension request: 0 rows
- a genuine senior approver deciding it: 1 row (workflow intact)
- assignee updating own task status: allowed
- create task -> notify assignee -> add subtask -> log activity: all allowed

Recovery script for the one-off data change: `db-backups/2026-07-23-dedup-tasks-restore.sql`
