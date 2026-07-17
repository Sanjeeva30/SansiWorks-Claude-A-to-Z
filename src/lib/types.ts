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

export interface Department {
  id: string;
  name: string;
  color: string;
  mode: string;
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
}

export interface Space {
  id: string;
  name: string;
  color: string;
  department_id: string | null;
  sort: number;
}

export interface List {
  id: string;
  space_id: string;
  name: string;
  sort: number;
}

export interface Task {
  id: string;
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
  assignees: string[]; // profile ids
  raci_c: string[];
  raci_i: string[];
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
}

export interface FormDef {
  id: string;
  title: string;
  list_id: string | null;
  fields: { id: number; label: string; type: string }[];
  active: boolean;
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

export interface Approval {
  id: string;
  task_id: string;
  requester_id: string;
  kind: string;
  detail: string | null;
  requested_due: string | null;
  status: string;
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
