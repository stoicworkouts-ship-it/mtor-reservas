export type ClassCategory = "grupal" | "uno_uno" | "dos_uno" | "tres_uno" | "cuatro_uno";

export const TYPE_LABEL: Record<ClassCategory, string> = {
  grupal: "Grupal",
  uno_uno: "1:1",
  dos_uno: "2:1",
  tres_uno: "3:1",
  cuatro_uno: "4:1",
};

export const TYPE_VAR: Record<ClassCategory, string> = {
  grupal: "var(--grupal)",
  uno_uno: "var(--unouno)",
  dos_uno: "var(--dosuno)",
  tres_uno: "var(--tresuno)",
  cuatro_uno: "var(--cuatrouno)",
};

export const CATEGORY_OPTIONS: { value: ClassCategory; label: string }[] = [
  { value: "grupal", label: "Grupal" },
  { value: "uno_uno", label: "1:1" },
  { value: "dos_uno", label: "2:1" },
  { value: "tres_uno", label: "3:1" },
  { value: "cuatro_uno", label: "4:1" },
];

export interface ClassType {
  id: string;
  name: string;
  category: ClassCategory;
  default_capacity: number;
}

export interface Coach {
  id: string;
  display_name: string;
}

export interface SessionRow {
  id: string;
  starts_at: string;
  duration_minutes: number;
  room: string | null;
  capacity: number;
  status: string;
  class_type: ClassType;
  coach: Coach | null;
}

export interface Plan {
  id: string;
  name: string;
  category: ClassCategory;
  sessions_count: number;
  price: number;
  duration_days: number;
}

export interface UserPlan {
  id: string;
  plan_id: string;
  sessions_used: number;
  status: "pending" | "active" | "expired" | "cancelled";
  starts_at: string | null;
  expires_at: string | null;
  plan: Plan;
}

export interface Reservation {
  id: string;
  session_id: string;
  status: "confirmed" | "waitlisted" | "cancelled" | "attended" | "no_show";
  created_at: string;
  session: SessionRow;
}

export interface Payment {
  id: string;
  user_id: string;
  plan_id: string;
  amount: number;
  method: string;
  status: "pending" | "approved" | "rejected";
  receipt_path: string | null;
  created_at: string;
  plan: Plan;
  profile?: { full_name: string };
}
