import type {
  CreateStudentInput,
  Student,
  StudentPage,
  StudentStatus,
  UpdateStudentInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

/** Frontend-side Students API — mirrors the backend router. */
export const studentsApi = {
  /** Legacy array read retained for non-interactive compatibility. */
  list(params: { search?: string; activeOnly?: boolean }): Promise<Student[]> {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.activeOnly) qs.set("activeOnly", "true");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<Student[]>(`/api/students${suffix}`);
  },
  /** Bounded cursor page for the interactive roster. */
  listPage(params: {
    search?: string;
    activeOnly?: boolean;
    cursor?: string;
    limit?: number;
  }): Promise<StudentPage> {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.activeOnly) qs.set("activeOnly", "true");
    if (params.cursor) qs.set("cursor", params.cursor);
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<StudentPage>(`/api/students/page${suffix}`);
  },
  /** Load the profile-aware detail record before an edit form is opened. */
  get(id: string): Promise<Student> {
    return api.get<Student>(`/api/students/${id}`);
  },
  create(input: CreateStudentInput): Promise<Student> {
    return api.post<Student>("/api/students", input);
  },
  update(id: string, input: UpdateStudentInput): Promise<Student> {
    return api.patch<Student>(`/api/students/${id}`, input);
  },
  setStatus(id: string, status: StudentStatus): Promise<Student> {
    return api.patch<Student>(`/api/students/${id}/status`, { status });
  },
  remove(id: string): Promise<void> {
    return api.delete<void>(`/api/students/${id}`);
  },
};

/** Map a student status to a StatusBadge tone. */
export function statusTone(status: StudentStatus): "live" | "upcoming" | "neutral" {
  if (status === "Active") return "live";
  if (status === "Pending") return "upcoming";
  return "neutral";
}
