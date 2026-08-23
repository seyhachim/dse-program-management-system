import type {
  StudentPortfolioProfile,
  StudentPortfolioProfileInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const studentPortfolioApi = {
  profile: () => api.get<StudentPortfolioProfile>("/api/student-portal/portfolio"),
  updateProfile: (input: StudentPortfolioProfileInput) =>
    api.put<StudentPortfolioProfile>("/api/student-portal/portfolio", input),
};

export function normalizeCareerInterests(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}
