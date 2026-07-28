import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/admin";

/* Permanent department delete — super admin only, and deliberately harder to
   reach than Archive (which is what almost everyone actually wants).

   The FK graph makes this genuinely destructive: spaces/docs/profiles are
   NO ACTION so Postgres blocks the unit delete while they exist, but
   lists->tasks->subtasks/comments/attachments/approvals all CASCADE. So
   removing one department can silently take out thousands of rows of real
   work. GET returns the exact blast radius so the UI can show it before
   anyone commits; DELETE refuses unless the caller echoes the department name
   back, the same type-to-confirm gate GitHub and Jira use for this class of
   action. People are never deleted — they're detached to "no department". */

type Ctx = { params: Promise<{ id: string }> };

async function authorize(req: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  const { data: actor } = await supabase.from("profiles").select("is_super").eq("id", auth.user.id).single();
  if (!actor?.is_super) return { error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  return { actorId: auth.user.id };
}

/** Blast radius for a department, counted server-side so the number the admin
    reads is the number the delete will actually act on. */
async function impactOf(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data: unit } = await admin.from("org_units").select("id,name").eq("id", id).single();
  if (!unit) return null;

  const { data: spaces } = await admin.from("spaces").select("id").eq("department_id", id);
  const spaceIds = (spaces || []).map((s) => s.id);

  const { data: lists } = spaceIds.length
    ? await admin.from("lists").select("id").in("space_id", spaceIds)
    : { data: [] as { id: string }[] };
  const listIds = (lists || []).map((l) => l.id);

  const counts = await Promise.all([
    listIds.length
      ? admin.from("tasks").select("id", { count: "exact", head: true }).in("list_id", listIds)
      : Promise.resolve({ count: 0 }),
    admin.from("docs").select("id", { count: "exact", head: true }).eq("department_id", id),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("department_id", id),
    admin.from("org_units").select("id", { count: "exact", head: true }).eq("parent_id", id),
  ]);

  return {
    name: unit.name,
    spaces: spaceIds.length,
    boards: listIds.length,
    tasks: counts[0].count || 0,
    docs: counts[1].count || 0,
    people: counts[2].count || 0,
    childUnits: counts[3].count || 0,
    spaceIds,
  };
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const gate = await authorize(req);
  if (gate.error) return gate.error;

  const impact = await impactOf(createAdminClient(), id);
  if (!impact) return NextResponse.json({ ok: false, error: "Department not found." }, { status: 404 });

  const { spaceIds: _drop, ...rest } = impact;
  return NextResponse.json({ ok: true, impact: rest });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const gate = await authorize(req);
  if (gate.error) return gate.error;

  const { confirmName } = await req.json().catch(() => ({}));
  const admin = createAdminClient();
  const impact = await impactOf(admin, id);
  if (!impact) return NextResponse.json({ ok: false, error: "Department not found." }, { status: 404 });

  if (typeof confirmName !== "string" || confirmName.trim() !== impact.name) {
    return NextResponse.json(
      { ok: false, error: `Type the department name exactly ("${impact.name}") to confirm.` },
      { status: 400 }
    );
  }

  // A parent with children would orphan a whole subtree — ON DELETE SET NULL
  // would quietly promote them to top-level, which is never what was meant.
  if (impact.childUnits > 0) {
    return NextResponse.json(
      { ok: false, error: `"${impact.name}" still has ${impact.childUnits} unit(s) beneath it. Move or delete those first.` },
      { status: 409 }
    );
  }

  // Order matters: spaces cascade to lists -> tasks -> subtasks/comments/etc.
  // Docs and profiles are NO ACTION, so they must be cleared by hand or the
  // final unit delete fails with a foreign-key error.
  if (impact.spaceIds.length) {
    const { error } = await admin.from("spaces").delete().in("id", impact.spaceIds);
    if (error) return NextResponse.json({ ok: false, error: `Removing spaces failed — ${error.message}` }, { status: 500 });
  }
  {
    const { error } = await admin.from("docs").delete().eq("department_id", id);
    if (error) return NextResponse.json({ ok: false, error: `Removing docs failed — ${error.message}` }, { status: 500 });
  }
  {
    // Detach, never delete — losing a department must not lose the person.
    const { error } = await admin.from("profiles").update({ department_id: null }).eq("department_id", id);
    if (error) return NextResponse.json({ ok: false, error: `Detaching people failed — ${error.message}` }, { status: 500 });
  }
  {
    const { error } = await admin.from("org_units").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await admin.from("audit_log").insert({
    actor_id: gate.actorId,
    action: `permanently deleted department (${impact.spaces} spaces, ${impact.boards} boards, ${impact.tasks} tasks, ${impact.docs} docs; ${impact.people} people detached)`,
    target: impact.name,
  });

  return NextResponse.json({ ok: true, impact });
}
