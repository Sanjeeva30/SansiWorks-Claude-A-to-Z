"use client";
import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { OrgUnitType, ORG_UNIT_TYPES, PermissionTemplate } from "@/lib/types";
import { colorForPerson } from "@/lib/colors";
import { logAudit } from "@/lib/actions";
import { IconX } from "./icons";

const card: React.CSSProperties = { background: "var(--sw-card)", border: "1px solid var(--sw-hair)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: "16px 18px" };
const pillBtn = (color: string): React.CSSProperties => ({ padding: "6px 12px", borderRadius: 999, border: `1px solid ${color === "var(--green)" ? "var(--green)" : "var(--sw-hair)"}`, background: "none", color, fontSize: 11.5, fontWeight: 400, cursor: "pointer", whiteSpace: "nowrap", flex: "none" });
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

function isBoardish(me: { is_super?: boolean; level_id?: string } | null) {
  return !!me?.is_super || me?.level_id === "l1" || me?.level_id === "l2";
}

export function OrgAdmin({ tab }: { tab: "organisation" | "permissions" }) {
  const store = useStore();
  const { me, profiles, departments, deptHeads, assignments, permissionTemplates, levels, supabase, patch, refresh } = store;

  const { pushToast, openDetail } = useUI();
  const canManage = isBoardish(me);

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

  const unitName = (id: string | null) => departments.find((d) => d.id === id)?.name || "—";
  const roots = departments.filter((d) => !d.archived);

  async function createUnit() {
    if (!newUnit.name.trim() || !me) return;
    await supabase.from("org_units").insert({
      name: newUnit.name.trim(), type: newUnit.type, parent_id: newUnit.parent_id || null,
      color: "#22409E", mode: "Workspace visible",
    });
    await logAudit(supabase, me.id, "created org unit", newUnit.name.trim());
    setNewUnit({ name: "", type: "department", parent_id: "" });
    await refresh();
    pushToast(`${newUnit.name.trim()} added to the org tree`);
  }

  async function archiveUnit(id: string, archived: boolean) {
    patch("departments", departments.map((d) => (d.id === id ? { ...d, archived } : d)));
    await supabase.from("org_units").update({ archived }).eq("id", id);
    if (me) await logAudit(supabase, me.id, archived ? "archived org unit" : "unarchived org unit", unitName(id));
  }

  async function toggleDormant(id: string, dormant: boolean) {
    patch("departments", departments.map((d) => (d.id === id ? { ...d, dormant } : d)));
    await supabase.from("org_units").update({ dormant }).eq("id", id);
  }

  async function addHead(unitId: string, profileId: string) {
    if (!profileId) return;
    patch("deptHeads", [...deptHeads, { unit_id: unitId, profile_id: profileId }]);
    await supabase.from("org_unit_heads").insert({ unit_id: unitId, profile_id: profileId });
    if (me) await logAudit(supabase, me.id, `added ${profiles.find((p) => p.id === profileId)?.name || "someone"} as head of`, unitName(unitId));
  }
  async function removeHead(unitId: string, profileId: string) {
    patch("deptHeads", deptHeads.filter((h) => !(h.unit_id === unitId && h.profile_id === profileId)));
    await supabase.from("org_unit_heads").delete().eq("unit_id", unitId).eq("profile_id", profileId);
    if (me) await logAudit(supabase, me.id, `removed ${profiles.find((p) => p.id === profileId)?.name || "someone"} as head of`, unitName(unitId));
  }

  async function createAssignment() {
    if (!newAssign.profile_id || !newAssign.function_name.trim() || !me) return;
    await supabase.from("assignments").insert({
      profile_id: newAssign.profile_id,
      function_name: newAssign.function_name.trim(),
      scope_unit_id: newAssign.scope_unit_id || null,
      reports_to_unit_id: newAssign.reports_to_unit_id || null,
    });
    await logAudit(supabase, me.id, `assigned ${profiles.find((p) => p.id === newAssign.profile_id)?.name || "someone"} as ${newAssign.function_name.trim()}`, unitName(newAssign.scope_unit_id) || "org-wide");
    setNewAssign({ profile_id: "", function_name: "", scope_unit_id: "", reports_to_unit_id: "" });
    await refresh();
    pushToast("Assignment added");
  }
  async function deleteAssignment(id: string) {
    const a = assignments.find((x) => x.id === id);
    patch("assignments", assignments.filter((a) => a.id !== id));
    await supabase.from("assignments").delete().eq("id", id);
    if (me && a) await logAudit(supabase, me.id, `removed assignment: ${profiles.find((p) => p.id === a.profile_id)?.name || "someone"} as ${a.function_name}`, unitName(a.scope_unit_id) || "org-wide");
  }

  async function createTemplate() {
    if (!newTemplateName.trim() || !me) return;
    await supabase.from("permission_templates").insert({ name: newTemplateName.trim(), screens: [], abilities: {} });
    await logAudit(supabase, me.id, "created permission template", newTemplateName.trim());
    setNewTemplateName("");
    await refresh();
  }
  async function saveTemplate(t: PermissionTemplate) {
    await supabase.from("permission_templates").update({ screens: t.screens, abilities: t.abilities, description: t.description }).eq("id", t.id);
    if (me) await logAudit(supabase, me.id, "edited permission template", t.name);
    await refresh();
    pushToast(`Template "${t.name}" saved`);
  }
  async function deleteTemplate(id: string) {
    const t = permissionTemplates.find((x) => x.id === id);
    await supabase.from("permission_templates").delete().eq("id", id);
    if (me && t) await logAudit(supabase, me.id, "deleted permission template", t.name);
    await refresh();
  }
  async function assignTemplate(profileId: string, templateId: string) {
    patch("profiles", profiles.map((p) => (p.id === profileId ? { ...p, template_id: templateId || null } : p)));
    await supabase.from("profiles").update({ template_id: templateId || null }).eq("id", profileId);
    if (me) {
      const templateName = permissionTemplates.find((t) => t.id === templateId)?.name || "no template";
      await logAudit(supabase, me.id, `set permission template to "${templateName}" for`, profiles.find((p) => p.id === profileId)?.name || "someone");
    }
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
                <button onClick={() => deleteTemplate(t.id)} style={pillBtn("var(--red)")}>Delete</button>
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
          <p style={{ margin: "0 0 14px", fontSize: 11.5, color: "var(--sw-muted)" }}>Per-person overrides are edited on that person's profile card and always show as "differs from template" there.</p>
          {profiles.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--sw-hair)" }}>
              <span style={{ flex: 1, fontSize: 12.5 }}>{p.name}</span>
              {p.permission_overrides && <span style={{ fontSize: 10.5, color: "var(--crimson)", border: "1px solid var(--crimson)", borderRadius: 999, padding: "2px 8px" }}>overrides set</span>}
              <select style={selectSt} value={p.template_id || ""} onChange={(e) => assignTemplate(p.id, e.target.value)}>
                <option value="">No template</option>
                {permissionTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          ))}
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
                  patch("departments", departments.map((x) => (x.id === d.id ? { ...x, color } : x)));
                  await supabase.from("org_units").update({ color }).eq("id", d.id);
                }}
                title="Department hue — everyone in this unit renders in a shade of this colour"
                style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid var(--sw-hair)", padding: 0, flex: "none", cursor: "pointer" }}
              />
              <button onClick={() => openDetail("department", d.id)} style={{ flex: 1, fontSize: 12.5, textAlign: "left", border: "none", background: "none", color: "var(--sw-text)", cursor: "pointer", padding: 0 }}>{d.name}</button>
              <span style={{ fontSize: 10.5, color: "var(--sw-muted)", border: "1px solid var(--sw-hair)", borderRadius: 999, padding: "2px 8px" }}>{ORG_UNIT_TYPES.find((t) => t.value === d.type)?.label || d.type}</span>
              {d.parent_id && <span style={{ fontSize: 10.5, color: "var(--sw-muted)" }}>under {unitName(d.parent_id)}</span>}
              <button onClick={() => toggleDormant(d.id, !d.dormant)} title={d.dormant ? "Hidden unless the overseas-teams toggle is on" : "Hide this overseas-only unit until the toggle is on"} style={pillBtn(d.dormant ? "var(--crimson)" : "var(--sw-muted)")}>
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
              <button onClick={() => deleteAssignment(a.id)} style={pillBtn("var(--red)")}>Remove</button>
            </div>
          );
        })}
        {!assignments.length && <p style={{ fontSize: 11.5, color: "var(--sw-muted)" }}>No assignments yet.</p>}
      </section>
    </>
  );
}
