"use client";
import React, { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { OrgUnitType, ORG_UNIT_TYPES, PermissionTemplate, PermissionOverrides } from "@/lib/types";
import { colorForPerson } from "@/lib/colors";
import { logAudit, writeOrRevert } from "@/lib/actions";
import { isMultiDeptAdmin } from "@/lib/logic";
import { IconX } from "./icons";

const card: React.CSSProperties = { background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "16px 18px" };
const pillBtn = (color: string): React.CSSProperties => ({ padding: "6px 12px", borderRadius: 999, border: `1px solid ${color === "var(--sw-on-green)" ? "var(--sw-on-green)" : "var(--sw-hair)"}`, background: "none", color, fontSize: 11.5, fontWeight: 400, cursor: "pointer", whiteSpace: "nowrap", flex: "none" });
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--sw-muted)", marginBottom: 6 };
const selectSt: React.CSSProperties = { height: 30, borderRadius: 7, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 11.5, color: "var(--sw-text-soft)", padding: "0 6px" };
const inputSt: React.CSSProperties = { height: 30, borderRadius: 7, border: "1px solid var(--sw-hair)", background: "var(--sw-hover)", fontSize: 11.5, color: "var(--sw-text)", padding: "0 8px" };

export const SCREENS: [string, string][] = [
  ["home", "My work / home"], ["my-week", "My week"], ["inbox", "Inbox"], ["my-list", "My list"],
  ["everything", "Everything"], ["overview", "Overview & reports"], ["people", "People"],
  ["docs", "Docs"], ["forms", "Forms"], ["spaces", "Spaces"], ["admin", "Admin panel"],
];
export const ABILITIES: [string, string][] = [
  ["create_task", "Create tasks"],
  ["edit_any_task", "Edit tasks they're not R/A on"],
  ["approve_extensions", "Approve deadline extension requests"],
  ["manage_org", "Manage org structure (units, clusters, plants)"],
  ["manage_people", "Manage people (roles, templates, overrides)"],
  ["view_company_reports", "View company-wide reports"],
];

export function OrgAdmin({ tab }: { tab: "organisation" | "permissions" }) {
  const store = useStore();
  // Admin/drill-down tables are not part of the sign-in payload; pull them on
  // first use so the initial load stays lean.
  const { ensureDeferred } = useStore();
  useEffect(() => { ensureDeferred(); }, [ensureDeferred]);

  const { me, profiles, departments, deptHeads, assignments, permissionTemplates, levels, supabase, patch, refresh } = store;

  const { pushToast, openDetail, confirm } = useUI();
  const canManage = isMultiDeptAdmin(me, levels);

  async function recomputeColors() {
    const updates = profiles.map((p) => {
      const dept = departments.find((d) => d.id === p.department_id);
      return { id: p.id, color: colorForPerson(p, dept?.color || "#7A0D20", levels) };
    });
    patch("profiles", profiles.map((p) => ({ ...p, color: updates.find((u) => u.id === p.id)!.color })));
    await Promise.all(updates.map((u) => supabase.from("profiles").update({ color: u.color }).eq("id", u.id)));
    pushToast(`Recomputed colours for ${updates.length} people — hue by department, shade by rank`);
  }

  const [newUnit, setNewUnit] = useState<{ name: string; type: OrgUnitType; parent_id: string }>({ name: "", type: "department", parent_id: "" });
  const [newAssign, setNewAssign] = useState<{ profile_id: string; function_name: string; scope_unit_id: string; reports_to_unit_id: string }>({ profile_id: "", function_name: "", scope_unit_id: "", reports_to_unit_id: "" });
  const [editingTemplate, setEditingTemplate] = useState<PermissionTemplate | null>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingOverrides, setEditingOverrides] = useState<PermissionOverrides>({});

  const unitName = (id: string | null) => departments.find((d) => d.id === id)?.name || "—";
  const roots = departments.filter((d) => !d.archived);

  /* This read as a dead button: the empty-name guard returned silently, and the
     insert's error was never checked — so an RLS refusal also did nothing
     visible. Both failure modes now say why. Departments and divisions get a
     paired Space, same as createDepartmentWithSpace(), because a unit with no
     board home is exactly the gap that left 8 departments unusable before. */
  async function createUnit() {
    if (!me) return;
    const name = newUnit.name.trim();
    if (!name) { pushToast("Give the unit a name first."); return; }

    const { data, error } = await supabase.from("org_units").insert({
      name, type: newUnit.type, parent_id: newUnit.parent_id || null,
      color: "#22409E", mode: "Workspace visible",
    }).select().single();
    if (error || !data) {
      pushToast(`Couldn't add "${name}" — ${error?.message || "the change didn't apply"}.`);
      return;
    }

    let note = "";
    if (newUnit.type === "department" || newUnit.type === "division") {
      const { error: spaceErr } = await supabase.from("spaces").insert({
        name, color: "#22409E", department_id: data.id, sort: 99,
      });
      note = spaceErr ? " (its space could not be created — add one from the sidebar)" : ", with its own space";
    }

    await logAudit(supabase, me.id, "created org unit", name);
    setNewUnit({ name: "", type: "department", parent_id: "" });
    await refresh();
    pushToast(`${name} added to the org tree${note}`);
  }

  async function archiveUnit(id: string, archived: boolean) {
    const prev = departments;
    patch("departments", departments.map((d) => (d.id === id ? { ...d, archived } : d)));
    const ok = await writeOrRevert(supabase.from("org_units").update({ archived }).eq("id", id), {
      toast: pushToast, what: archived ? "archive that unit" : "restore that unit", revert: () => patch("departments", prev),
    });
    if (ok && me) await logAudit(supabase, me.id, archived ? "archived org unit" : "unarchived org unit", unitName(id));
  }

  async function toggleDormant(id: string, dormant: boolean) {
    const prev = departments;
    patch("departments", departments.map((d) => (d.id === id ? { ...d, dormant } : d)));
    await writeOrRevert(supabase.from("org_units").update({ dormant }).eq("id", id), {
      toast: pushToast, what: dormant ? "hide that unit" : "show that unit", revert: () => patch("departments", prev),
    });
  }

  async function addHead(unitId: string, profileId: string) {
    if (!profileId) return;
    // Optimistic patch, but roll it back if the write is refused — headship is
    // a permission grant, so a UI that shows it applied when it wasn't is
    // worse than one that never moved.
    patch("deptHeads", [...deptHeads, { unit_id: unitId, profile_id: profileId }]);
    const { error } = await supabase.from("org_unit_heads").insert({ unit_id: unitId, profile_id: profileId });
    if (error) {
      patch("deptHeads", deptHeads.filter((h) => !(h.unit_id === unitId && h.profile_id === profileId)));
      pushToast(`Couldn't add that head — ${error.message}`);
      return;
    }
    if (me) await logAudit(supabase, me.id, `added ${profiles.find((p) => p.id === profileId)?.name || "someone"} as head of`, unitName(unitId));
  }
  async function removeHead(unitId: string, profileId: string) {
    const person = profiles.find((p) => p.id === profileId)?.name || "this person";
    if (!(await confirm({ title: `Remove ${person} as head of ${unitName(unitId)}?`, message: "They'll lose head-level authority over this unit immediately.", confirmLabel: "Remove", danger: true }))) return;
    const prev = deptHeads;
    patch("deptHeads", deptHeads.filter((h) => !(h.unit_id === unitId && h.profile_id === profileId)));
    const ok = await writeOrRevert(supabase.from("org_unit_heads").delete().eq("unit_id", unitId).eq("profile_id", profileId), {
      toast: pushToast, what: `remove ${person} as head`, revert: () => patch("deptHeads", prev),
    });
    if (ok && me) await logAudit(supabase, me.id, `removed ${person} as head of`, unitName(unitId));
  }

  async function createAssignment() {
    if (!me) return;
    if (!newAssign.profile_id || !newAssign.function_name.trim()) {
      pushToast("Pick a person and name the function first.");
      return;
    }
    const { error } = await supabase.from("assignments").insert({
      profile_id: newAssign.profile_id,
      function_name: newAssign.function_name.trim(),
      scope_unit_id: newAssign.scope_unit_id || null,
      reports_to_unit_id: newAssign.reports_to_unit_id || null,
    });
    if (error) { pushToast(`Couldn't add the assignment — ${error.message}`); return; }
    await logAudit(supabase, me.id, `assigned ${profiles.find((p) => p.id === newAssign.profile_id)?.name || "someone"} as ${newAssign.function_name.trim()}`, unitName(newAssign.scope_unit_id) || "org-wide");
    setNewAssign({ profile_id: "", function_name: "", scope_unit_id: "", reports_to_unit_id: "" });
    await refresh();
    pushToast("Assignment added");
  }
  async function deleteAssignment(id: string) {
    const a = assignments.find((x) => x.id === id);
    if (!a) return;
    const person = profiles.find((p) => p.id === a.profile_id)?.name || "this person";
    if (!(await confirm({ title: `Remove "${a.function_name}" from ${person}?`, message: "This assignment can be re-added later, but not undone automatically.", confirmLabel: "Remove", danger: true }))) return;
    const prev = assignments;
    patch("assignments", assignments.filter((x) => x.id !== id));
    const ok = await writeOrRevert(supabase.from("assignments").delete().eq("id", id), {
      toast: pushToast, what: "remove that assignment", revert: () => patch("assignments", prev),
    });
    if (ok && me) await logAudit(supabase, me.id, `removed assignment: ${person} as ${a.function_name}`, unitName(a.scope_unit_id) || "org-wide");
  }

  /* Same silent-failure shape as createUnit, plus it never pushed a success
     toast — so even a working click looked like nothing had happened. */
  async function createTemplate() {
    if (!me) return;
    const name = newTemplateName.trim();
    if (!name) { pushToast("Give the template a name first."); return; }
    const { error } = await supabase.from("permission_templates").insert({ name, screens: [], abilities: {} });
    if (error) { pushToast(`Couldn't add "${name}" — ${error.message}`); return; }
    await logAudit(supabase, me.id, "created permission template", name);
    setNewTemplateName("");
    await refresh();
    pushToast(`Template "${name}" created — set its screens and abilities below`);
  }
  async function saveTemplate(t: PermissionTemplate) {
    if (!await writeOrRevert(supabase.from("permission_templates").update({ screens: t.screens, abilities: t.abilities, description: t.description }).eq("id", t.id), { toast: pushToast, what: `save "${t.name}"` })) return;
    if (me) await logAudit(supabase, me.id, "edited permission template", t.name);
    await refresh();
    pushToast(`Template "${t.name}" saved`);
  }
  async function deleteTemplate(id: string) {
    const t = permissionTemplates.find((x) => x.id === id);
    if (!t) return;
    const inUse = profiles.filter((p) => p.template_id === id).length;
    if (!(await confirm({
      title: `Delete "${t.name}"?`,
      message: inUse ? `${inUse} ${inUse === 1 ? "person is" : "people are"} currently using this template — they'll fall back to their level's default permissions.` : "This can't be undone.",
      confirmLabel: "Delete template", danger: true,
    }))) return;
    if (!await writeOrRevert(supabase.from("permission_templates").delete().eq("id", id), { toast: pushToast, what: `delete "${t.name}"` })) return;
    if (me) await logAudit(supabase, me.id, "deleted permission template", t.name);
    await refresh();
  }
  async function assignTemplate(profileId: string, templateId: string) {
    const prevProfiles = profiles;
    patch("profiles", profiles.map((p) => (p.id === profileId ? { ...p, template_id: templateId || null } : p)));
    if (!await writeOrRevert(supabase.from("profiles").update({ template_id: templateId || null }).eq("id", profileId), {
      toast: pushToast, what: "assign that template", revert: () => patch("profiles", prevProfiles),
    })) return;
    if (me) {
      const templateName = permissionTemplates.find((t) => t.id === templateId)?.name || "no template";
      await logAudit(supabase, me.id, `set permission template to "${templateName}" for`, profiles.find((p) => p.id === profileId)?.name || "someone");
    }
  }
  async function saveOverrides(profileId: string, overrides: PermissionOverrides | null) {
    const prevProfiles = profiles;
    patch("profiles", profiles.map((p) => (p.id === profileId ? { ...p, permission_overrides: overrides } : p)));
    if (!await writeOrRevert(supabase.from("profiles").update({ permission_overrides: overrides }).eq("id", profileId), {
      toast: pushToast, what: "save that person's permission overrides", revert: () => patch("profiles", prevProfiles),
    })) return;
    if (me) await logAudit(supabase, me.id, overrides ? "edited permission overrides for" : "cleared permission overrides for", profiles.find((p) => p.id === profileId)?.name || "someone");
    pushToast(overrides ? "Overrides saved" : "Overrides cleared — back to template/level defaults");
  }

  if (!canManage) {
    return <section style={card}><p style={{ fontSize: 12.5, color: "var(--sw-muted)", margin: 0 }}>Only Board / Group Heads or super admins can manage {tab === "organisation" ? "the organisation structure" : "permissions"}.</p></section>;
  }

  if (tab === "permissions") {
    return (
      <>
        <section style={{ ...card, marginBottom: 14 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 400 }}>Permission templates</h3>
          <p style={{ margin: "0 0 14px", fontSize: 11.5, color: "var(--sw-muted)" }}>Assign a template to a person and they inherit its screens and abilities. Override any individual on top — overrides are flagged so exceptions never go unnoticed.</p>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <input style={{ ...inputSt, flex: 1 }} placeholder="New template name, e.g. Vendor rep" value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} />
            <button onClick={createTemplate} style={{ padding: "6px 14px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 11.5, cursor: "pointer" }}>+ Add template</button>
          </div>
          {permissionTemplates.map((t) => (
            <div key={t.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--sw-hair)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 400 }}>{t.name}</span>
                <button onClick={() => setEditingTemplate(editingTemplate?.id === t.id ? null : { ...t })} style={pillBtn("var(--sw-text-soft)")}>{editingTemplate?.id === t.id ? "Close" : "Edit"}</button>
                <button onClick={() => deleteTemplate(t.id)} style={pillBtn("var(--sw-on-red)")}>Delete</button>
              </div>
              {editingTemplate?.id === t.id && (
                <div className="sw-grid-2" style={{ paddingLeft: 12, gap: 16 }}>
                  <div>
                    <div style={label}>Screens</div>
                    {SCREENS.map(([key, lbl]) => (
                      <label key={key} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, padding: "3px 0" }}>
                        <input type="checkbox" checked={editingTemplate.screens.includes(key)}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, screens: e.target.checked ? [...editingTemplate.screens, key] : editingTemplate.screens.filter((s) => s !== key) })} />
                        {lbl}
                      </label>
                    ))}
                  </div>
                  <div>
                    <div style={label}>Abilities</div>
                    {ABILITIES.map(([key, lbl]) => (
                      <label key={key} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, padding: "3px 0" }}>
                        <input type="checkbox" checked={!!editingTemplate.abilities[key]}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, abilities: { ...editingTemplate.abilities, [key]: e.target.checked } })} />
                        {lbl}
                      </label>
                    ))}
                    <button onClick={() => saveTemplate(editingTemplate)} style={{ marginTop: 10, padding: "6px 14px", borderRadius: 999, border: "none", background: "var(--green)", color: "#fff", fontSize: 11.5, cursor: "pointer" }}>Save template</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!permissionTemplates.length && <p style={{ fontSize: 11.5, color: "var(--sw-muted)" }}>No templates yet — add one above (e.g. "Division head", "Vendor rep", "Plant staff").</p>}
        </section>

        <section style={card}>
          <h3 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 400 }}>Assign templates &amp; overrides</h3>
          <p style={{ margin: "0 0 14px", fontSize: 11.5, color: "var(--sw-muted)" }}>Assign a template, or click a person to set their screens and abilities directly — a template is optional, not required.</p>
          {profiles.map((p) => {
            const template = permissionTemplates.find((t) => t.id === p.template_id) || null;
            const isEditing = editingPersonId === p.id;
            return (
              <div key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--sw-hair)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 12.5 }}>{p.name}</span>
                  {p.permission_overrides && <span style={{ fontSize: 10.5, color: "var(--sw-on-crimson)", border: "1px solid var(--crimson)", borderRadius: 999, padding: "2px 8px" }}>overrides set</span>}
                  <select style={selectSt} value={p.template_id || ""} onChange={(e) => assignTemplate(p.id, e.target.value)}>
                    <option value="">No template</option>
                    {permissionTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button
                    onClick={() => {
                      if (isEditing) { setEditingPersonId(null); return; }
                      setEditingPersonId(p.id);
                      setEditingOverrides(p.permission_overrides ? { ...p.permission_overrides, abilities: { ...p.permission_overrides.abilities } } : {});
                    }}
                    style={pillBtn("var(--sw-text-soft)")}
                  >
                    {isEditing ? "Close" : "Edit permissions"}
                  </button>
                </div>
                {isEditing && (
                  <div className="sw-grid-2" style={{ paddingLeft: 12, paddingTop: 12, gap: 16 }}>
                    <div>
                      <div style={label}>Screens {!editingOverrides.screens && <span style={{ color: "var(--sw-muted)", fontWeight: 400, textTransform: "none" }}>· inheriting from {template ? `"${template.name}"` : "level default"}</span>}</div>
                      {SCREENS.map(([key, lbl]) => {
                        const effective = editingOverrides.screens ?? template?.screens ?? [];
                        return (
                          <label key={key} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, padding: "3px 0" }}>
                            <input type="checkbox" checked={effective.includes(key)}
                              onChange={(e) => {
                                const base = editingOverrides.screens ?? template?.screens ?? [];
                                const next = e.target.checked ? [...base, key] : base.filter((s) => s !== key);
                                setEditingOverrides({ ...editingOverrides, screens: next });
                              }} />
                            {lbl}
                          </label>
                        );
                      })}
                      {editingOverrides.screens && (
                        <button onClick={() => setEditingOverrides({ ...editingOverrides, screens: undefined })} style={{ ...pillBtn("var(--sw-text-soft)"), marginTop: 6 }}>Revert screens to template/level default</button>
                      )}
                    </div>
                    <div>
                      <div style={label}>Abilities</div>
                      {ABILITIES.map(([key, lbl]) => (
                        <label key={key} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, padding: "3px 0" }}>
                          <input type="checkbox" checked={!!(editingOverrides.abilities?.[key] ?? template?.abilities?.[key])}
                            onChange={(e) => setEditingOverrides({ ...editingOverrides, abilities: { ...editingOverrides.abilities, [key]: e.target.checked } })} />
                          {lbl}
                        </label>
                      ))}
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button onClick={async () => { await saveOverrides(p.id, editingOverrides); setEditingPersonId(null); }} style={{ padding: "6px 14px", borderRadius: 999, border: "none", background: "var(--green)", color: "#fff", fontSize: 11.5, cursor: "pointer" }}>Save overrides</button>
                        {p.permission_overrides && (
                          <button onClick={async () => { await saveOverrides(p.id, null); setEditingPersonId(null); }} style={pillBtn("var(--sw-on-red)")}>Clear overrides</button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </>
    );
  }

  // tab === "organisation"
  return (
    <>
      <section style={{ ...card, marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 400 }}>Add an org unit</h3>
        <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--sw-muted)" }}>Board, division, department, advisory (reports to board), vendor organisation, cluster, or plant — any depth, nothing hardcoded. Add IGP Piyungan, a new department, or a whole new division here.</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input style={{ ...inputSt, flex: 1, minWidth: 160 }} placeholder="Name, e.g. IGP Piyungan" value={newUnit.name} onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })} />
          <select style={selectSt} value={newUnit.type} onChange={(e) => setNewUnit({ ...newUnit, type: e.target.value as OrgUnitType })}>
            {ORG_UNIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select style={selectSt} value={newUnit.parent_id} onChange={(e) => setNewUnit({ ...newUnit, parent_id: e.target.value })}>
            <option value="">No parent (top-level)</option>
            {roots.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button onClick={createUnit} style={{ padding: "6px 14px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 11.5, cursor: "pointer" }}>+ Add unit</button>
        </div>
      </section>

      <section style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 400, flex: 1 }}>Org tree</h3>
          <button onClick={recomputeColors} style={pillBtn("var(--sw-text-soft)")}>Recompute people's colours</button>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--sw-muted)" }}>Each unit's colour below is the hue every member of that department renders in — set a unit's colour, then recompute to cascade it. Rank lightens the shade; heads render at full strength.</p>
        {roots.map((d) => (
          <div key={d.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--sw-hair)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input
                type="color"
                value={d.color}
                onChange={async (e) => {
                  const color = e.target.value;
                  const prev = departments;
                  patch("departments", departments.map((x) => (x.id === d.id ? { ...x, color } : x)));
                  await writeOrRevert(supabase.from("org_units").update({ color }).eq("id", d.id), {
                    toast: pushToast, what: "change that colour", revert: () => patch("departments", prev),
                  });
                }}
                title="Department hue — everyone in this unit renders in a shade of this colour"
                style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid var(--sw-hair)", padding: 0, flex: "none", cursor: "pointer" }}
              />
              <button onClick={() => openDetail("department", d.id)} style={{ flex: 1, fontSize: 12.5, textAlign: "left", border: "none", background: "none", color: "var(--sw-text)", cursor: "pointer", padding: 0 }}>{d.name}</button>
              <span style={{ fontSize: 10.5, color: "var(--sw-muted)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "2px 8px" }}>{ORG_UNIT_TYPES.find((t) => t.value === d.type)?.label || d.type}</span>
              {d.parent_id && <span style={{ fontSize: 10.5, color: "var(--sw-muted)" }}>under {unitName(d.parent_id)}</span>}
              <button onClick={() => toggleDormant(d.id, !d.dormant)} title={d.dormant ? "Hidden unless the overseas-teams toggle is on" : "Hide this overseas-only unit until the toggle is on"} style={pillBtn(d.dormant ? "var(--sw-on-crimson)" : "var(--sw-muted)")}>
                {d.dormant ? "Dormant — hidden" : "Mark dormant"}
              </button>
              <button onClick={() => archiveUnit(d.id, true)} style={pillBtn("var(--sw-muted)")}>Archive</button>
            </div>
            <div style={{ paddingLeft: 18, marginTop: 8 }}>
              <div style={label}>Heads (co-heads supported)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                {deptHeads.filter((h) => h.unit_id === d.id).map((h) => {
                  const p = profiles.find((x) => x.id === h.profile_id);
                  if (!p) return null;
                  return (
                    <span key={p.id} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(122,13,32,0.06)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "3px 6px 3px 10px", fontSize: 11.5 }}>
                      {p.name}
                      <button onClick={() => removeHead(d.id, p.id)} style={{ border: "none", background: "none", color: "var(--sw-muted)", cursor: "pointer", padding: "0 2px" }}><IconX size={10} /></button>
                    </span>
                  );
                })}
              </div>
              <select style={selectSt} value="" onChange={(e) => addHead(d.id, e.target.value)}>
                <option value="">+ Add head…</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        ))}
      </section>

      <section style={card}>
        <h3 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 400 }}>Assignments — a person's function, scoped anywhere</h3>
        <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--sw-muted)" }}>E.g. Ambar functions as F&amp;A manager, scoped to the Jogja cluster, reporting to Marlina. This is independent of Ambar's home unit.</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          <select style={selectSt} value={newAssign.profile_id} onChange={(e) => setNewAssign({ ...newAssign, profile_id: e.target.value })}>
            <option value="">Person…</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input style={{ ...inputSt, minWidth: 160 }} placeholder="Function, e.g. F&A manager" value={newAssign.function_name} onChange={(e) => setNewAssign({ ...newAssign, function_name: e.target.value })} />
          <select style={selectSt} value={newAssign.scope_unit_id} onChange={(e) => setNewAssign({ ...newAssign, scope_unit_id: e.target.value })}>
            <option value="">Scope (cluster/plant/dept)…</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select style={selectSt} value={newAssign.reports_to_unit_id} onChange={(e) => setNewAssign({ ...newAssign, reports_to_unit_id: e.target.value })}>
            <option value="">Reports to unit (for approvals)…</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button onClick={createAssignment} style={{ padding: "6px 14px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 11.5, cursor: "pointer" }}>+ Add assignment</button>
        </div>
        {assignments.map((a) => {
          const p = profiles.find((x) => x.id === a.profile_id);
          return (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--sw-hair)", fontSize: 12 }}>
              <span style={{ flex: 1 }}>{p?.name || "—"} · <b style={{ fontWeight: 500 }}>{a.function_name}</b>{a.scope_unit_id ? ` · scoped to ${unitName(a.scope_unit_id)}` : ""}{a.reports_to_unit_id ? ` · reports to ${unitName(a.reports_to_unit_id)}` : ""}</span>
              <button onClick={() => deleteAssignment(a.id)} style={pillBtn("var(--sw-on-red)")}>Remove</button>
            </div>
          );
        })}
        {!assignments.length && <p style={{ fontSize: 11.5, color: "var(--sw-muted)" }}>No assignments yet.</p>}
      </section>
    </>
  );
}
