import type {
  CreateLecturerInput,
  CreateLecturerPortfolioItemInput,
  Lecturer,
  LecturerAunQaEvidenceExport,
  LecturerPortfolioItem,
  ReviewLecturerPortfolioItemInput,
  UpdateLecturerInput,
  UpdateLecturerPortfolioItemInput,
  UpdateMyLecturerProfileInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const lecturersApi = {
  me(): Promise<Lecturer> {
    return api.get<Lecturer>("/api/lecturers/me");
  },
  updateMe(input: UpdateMyLecturerProfileInput): Promise<Lecturer> {
    return api.patch<Lecturer>("/api/lecturers/me", input);
  },
  portfolioItems(): Promise<LecturerPortfolioItem[]> {
    return api.get<LecturerPortfolioItem[]>("/api/lecturers/me/portfolio-items");
  },
  createPortfolioItem(input: CreateLecturerPortfolioItemInput): Promise<LecturerPortfolioItem> {
    return api.post<LecturerPortfolioItem>("/api/lecturers/me/portfolio-items", input);
  },
  updatePortfolioItem(id: string, input: UpdateLecturerPortfolioItemInput): Promise<LecturerPortfolioItem> {
    return api.patch<LecturerPortfolioItem>(`/api/lecturers/me/portfolio-items/${id}`, input);
  },
  removePortfolioItem(id: string): Promise<void> {
    return api.delete<void>(`/api/lecturers/me/portfolio-items/${id}`);
  },
  aunQaEvidence(): Promise<LecturerAunQaEvidenceExport> {
    return api.get<LecturerAunQaEvidenceExport>("/api/lecturers/me/aun-qa-evidence");
  },
  reviewPortfolioItem(lecturerId: string, itemId: string, input: ReviewLecturerPortfolioItemInput): Promise<LecturerPortfolioItem> {
    return api.post<LecturerPortfolioItem>(`/api/lecturers/${lecturerId}/portfolio-items/${itemId}/review`, input);
  },
  list(search?: string): Promise<Lecturer[]> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return api.get<Lecturer[]>(`/api/lecturers${qs}`);
  },
  create(input: CreateLecturerInput): Promise<Lecturer> {
    return api.post<Lecturer>("/api/lecturers", input);
  },
  update(id: string, input: UpdateLecturerInput): Promise<Lecturer> {
    return api.patch<Lecturer>(`/api/lecturers/${id}`, input);
  },
  remove(id: string): Promise<void> {
    return api.delete<void>(`/api/lecturers/${id}`);
  },
};
