export type Status = "Not Started" | "Working on it" | "Stuck" | "Done";
export type Priority = "Low" | "Medium" | "High" | "Critical";

export const STATUSES: Status[] = ["Not Started", "Working on it", "Stuck", "Done"];
export const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Critical"];

export const STATUS_COLORS: Record<string, string> = {
  "Not Started": "#8C837C",
  "Working on it": "#22409E",
  Stuck: "#F3263E",
  Done: "#0D4F31",
};
export const PRIORITY_COLORS: Record<string, string> = {
  Low: "#0D4F31",
  Medium: "#22409E",
  High: "#7A0D20",
  Critical: "#F3263E",
};

export interface Level {
  id: string;
  name: string;
  sort: number;
  exec_visibility: boolean;
  multi_dept_admin: boolean;
  dept_admin: boolean;
  reassign_team: boolean;
  edit_dept_boards: boolean;
  edit_own_scope: boolean;
}

export type OrgUnitType = "board" | "division" | "department" | "advisory" | "vendor_org" | "cluster" | "plant";

export const ORG_UNIT_TYPES: { value: OrgUnitType; label: string }[] = [
  { value: "board", label: "Board" },
  { value: "division", label: "Division" },
  { value: "department", label: "Department" },
  { value: "advisory", label: "Advisory (reports to board)" },
  { value: "vendor_org", label: "Vendor organisation" },
  { value: "cluster", label: "Plant cluster" },
  { value: "plant", label: "Plant" },
];

// The full org tree: board, divisions, departments, advisory units, the vendor
// organisation, clusters, and plants — every one addable from the admin panel.
export interface OrgUnit {
  id: string;
  name: string;
  color: string;
  mode: string;
  type: OrgUnitType;
  parent_id: string | null;
  archived: boolean;
  sort: number;
  dormant: boolean; // hidden while the "overseas teams" toggle is off
}

export type Department = OrgUnit;

// A person's function (e.g. "F&A manager"), scoped to any unit — independent
// of where they technically sit in the tree. This is what lets Ambar be "in
// the vendor organisation" and "the finance function for the Jogja cluster"
// at once, with no special-case code.
export interface Assignment {
  id: string;
  profile_id: string;
  function_name: string;
  scope_unit_id: string | null;
  reports_to_unit_id: string | null;
  created_at: string;
}

export interface OrgUnitHead {
  unit_id: string;
  profile_id: string;
}

export interface PermissionTemplate {
  id: string;
  name: string;
  description: string | null;
  screens: string[];
  abilities: Record<string, boolean>;
  created_at: string;
}

export interface PermissionOverrides {
  screens?: string[]; // full replacement list when present
  abilities?: Record<string, boolean>; // merged over the template
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role_title: string | null;
  department_id: string | null;
  location: string | null;
  manager_id: string | null;
  color: string;
  joined_at: string | null;
  level_id: string;
  is_super: boolean;
  last_login: string | null;
  wa_enabled: boolean;
  wa_number: string | null;
  digest_time: string;
  theme: string;
  avatar_url: string | null;
  template_id: string | null;
  permission_overrides: PermissionOverrides | null;
  capacity_points: number | null;
  birthday_day: number | null;
  birthday_month: number | null;
  birthday_year: number | null;
  designation: string | null;
}

export interface Space {
  id: string;
  name: string;
  color: string;
  department_id: string | null;
  sort: number;
  slug: string;
}

export interface List {
  id: string;
  space_id: string;
  name: string;
  sort: number;
  slug: string;
}

export interface Pin {
  id: string;
  profile_id: string;
  kind: "list" | "space";
  target_id: string;
  sort: number;
}

export interface Task {
  id: string;
  task_number: number;
  list_id: string | null;
  owner_id: string | null;
  name: string;
  status: Status;
  priority: Priority;
  due: string | null;
  effort: number;
  blocked: boolean;
  description: string | null;
  reminder_at: string | null;
  recur: string;
  accountable_id: string | null;
  completed_at: string | null;
  created_at: string;
  milestone: boolean;
  assignee_id: string | null; // R — exactly one person
  raci_c: string[];
  raci_i: string[];
  difficulty: number | null; // 1 Trivial .. 5 Complex
  difficulty_set_by: string | null;
}

export interface Subtask {
  id: string;
  task_id: string;
  name: string;
  assignee_id: string | null; // R
  due: string | null;
  done: boolean;
  sort: number;
  created_at: string;
  accountable_id: string | null;
  raci_c: string[];
  raci_i: string[];
  reminder_at: string | null;
  difficulty: number | null;
  difficulty_set_by: string | null;
}

export const DIFFICULTY_LEVELS: { value: number; label: string; weight: number }[] = [
  { value: 1, label: "Trivial", weight: 1 },
  { value: 2, label: "Easy", weight: 2 },
  { value: 3, label: "Moderate", weight: 3 },
  { value: 4, label: "Hard", weight: 5 },
  { value: 5, label: "Complex", weight: 8 },
];

export interface Feature {
  key: string;
  enabled: boolean;
}

export interface Reminder {
  id: string;
  profile_id: string;
  task_id: string | null;
  subtask_id: string | null;
  title: string;
  remind_at: string;
  status: "pending" | "fired" | "dismissed";
  created_at: string;
}

export interface Doc {
  id: string;
  title: string;
  status: string;
  type: string;
  category: string | null;
  version: number;
  owner_id: string | null;
  review_date: string | null;
  excerpt: string | null;
  body: string | null;
  department_id: string | null;
  is_sop: boolean;
  current_version_id: string | null;
}

export type ReviewStatus = "pending" | "approved" | "revisions_requested";

export interface DocVersion {
  id: string;
  doc_id: string;
  version_number: number;
  file_path: string;
  file_name: string;
  submitted_by: string | null;
  submitted_at: string;
  change_note: string | null;
  ai_summary: string | null;
  review_due: string | null;
  head_reviewer_id: string | null;
  head_status: ReviewStatus;
  head_by: string | null;
  head_at: string | null;
  head_note_path: string | null;
  audit_status: ReviewStatus;
  audit_by: string | null;
  audit_at: string | null;
  audit_note_path: string | null;
}

export interface FormDef {
  id: string;
  title: string;
  list_id: string | null;
  fields: { id: number; label: string; type: string }[];
  active: boolean;
  default_assignee_id: string | null;
}

export interface FormSubmission {
  id: string;
  form_id: string | null;
  answers: Record<string, string>;
  submitted_at: string;
  task_id: string | null;
}

export interface Notification {
  id: string;
  profile_id: string;
  task_id: string | null;
  body: string;
  reason: string | null;
  read: boolean;
  created_at: string;
}

export interface Comment {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  mentioned_ids: string[];
  created_at: string;
}

export interface Approval {
  id: string;
  task_id: string;
  requester_id: string;
  kind: string;
  detail: string | null;
  requested_due: string | null;
  status: string;
  created_at: string;
  prev_due: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface Invite {
  id: string;
  email: string;
  level_id: string | null;
  department_id: string | null;
  status: string;
  created_at: string;
}

export interface BoardRequest {
  id: string;
  board_name: string;
  requester_id: string;
  department_id: string;
  reason: string | null;
  status: string;
}

export interface Nomination {
  id: string;
  department_id: string;
  nominee_id: string;
  nominated_by: string;
  reason: string | null;
  status: string;
}

export interface DeptProposal {
  id: string;
  name: string;
  proposer_id: string;
  reason: string | null;
  status: string;
}

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  action: string;
  target: string | null;
  created_at: string;
}

export interface Template {
  id: string;
  list_id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  checklist: string[];
}

export interface CustomField {
  id: string;
  list_id: string;
  name: string;
  type: string;
}

export interface Automation {
  id: string;
  list_id: string;
  trigger: string;
  action: string;
  enabled: boolean;
}

export interface TaskActivity {
  id: string;
  task_id: string;
  actor_id: string | null;
  action: string;
  created_at: string;
}

export interface Attachment {
  id: string;
  task_id: string;
  name: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
}

export interface Dependency {
  task_id: string;
  depends_on: string;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
