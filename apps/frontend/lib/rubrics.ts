import type {
  CreateRubricInput,
  PublicRubric,
  Rubric,
  RubricStatus,
  RubricType,
  UpdateRubricInput,
} from "@dse-pms/shared-types";
import type { StatusTone } from "@dse-pms/ui";
import { api } from "./api";

/** Frontend-side Rubric Library API — mirrors the authenticated backend router. */
export const rubricsApi = {
  list(params: { search?: string; status?: RubricStatus } = {}): Promise<Rubric[]> {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<Rubric[]>(`/api/rubrics${suffix}`);
  },
  get(id: string): Promise<Rubric> {
    return api.get<Rubric>(`/api/rubrics/${id}`);
  },
  create(input: CreateRubricInput): Promise<Rubric> {
    return api.post<Rubric>("/api/rubrics", input);
  },
  update(id: string, input: UpdateRubricInput): Promise<Rubric> {
    return api.patch<Rubric>(`/api/rubrics/${id}`, input);
  },
  remove(id: string): Promise<void> {
    return api.delete<void>(`/api/rubrics/${id}`);
  },
};

/** Active rubric content that is safe to load without a login. */
export const publicRubricsApi = {
  get(id: string): Promise<PublicRubric> {
    return api.get<PublicRubric>(`/api/rubrics/public/${id}`);
  },
};

/** Map a rubric status to a StatusBadge tone. */
export function rubricStatusTone(status: RubricStatus): StatusTone {
  if (status === "Active") return "live";
  if (status === "Draft") return "upcoming";
  return "neutral";
}

/**
 * Per-type chip colours for the "Type" column, echoing the reference design.
 * Tailwind classes styled for both light and dark; unknown types fall back to slate.
 */
const TYPE_CHIP: Record<string, string> = {
  Assignment: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  Presentation: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  Lab: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  Quiz: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
  Project: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "Peer Evaluation": "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  Participation: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  Exam: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  Report: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
};

export function typeChipClass(type: RubricType | string): string {
  return TYPE_CHIP[type] ?? "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300";
}
