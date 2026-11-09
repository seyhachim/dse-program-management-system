import type {
  AnnualYear,
  AnnualSummary,
  AnnualLecturer,
  ReviewAnnualTeachingInput,
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
  annualYears(): Promise<AnnualYear[]> { return api.get<AnnualYear[]>("/api/lecturers/annual/years"); },
  annualSummary(yearId: string): Promise<AnnualSummary> { return api.get<AnnualSummary>(`/api/lecturers/annual/${yearId}/summary`); },
  annualMe(yearId: string): Promise<{ academicYear: AnnualYear; staff: AnnualLecturer | null }> { return api.get(`/api/lecturers/annual/${yearId}/me`); },
  annualLinkEvidence(yearId: string, itemId: string): Promise<void> { return api.post(`/api/lecturers/annual/${yearId}/me/evidence`, { itemId }); },
  annualSubmit(yearId: string, note = ""): Promise<void> { return api.post(`/api/lecturers/annual/${yearId}/me/submit`, { note }); },
  annualReviewTeaching(yearId: string, input: ReviewAnnualTeachingInput): Promise<void> { return api.post(`/api/lecturers/annual/${yearId}/review-teaching`, input); },
  annualRelease(yearId: string): Promise<AnnualSummary> { return api.post(`/api/lecturers/annual/${yearId}/release`, {}); },
  annualExport(yearId: string): Promise<{ academicYear: string; version: number; csv: string; excelXml: string }> { return api.get(`/api/lecturers/annual/${yearId}/export`); },
  me(): Promise<Lecturer> {
    return api.get<Lecturer>("/api/lecturers/me");
  },
  updateMe(input: UpdateMyLecturerProfileInput): Promise<Lecturer> {
    return api.patch<Lecturer>("/api/lecturers/me", input);
  },
  portfolioItems(): Promise<LecturerPortfolioItem[]> {
    return api.get<LecturerPortfolioItem[]>("/api/lecturers/me/portfolio-items");
  },
  portfolioItemsForLecturer(lecturerId: string): Promise<LecturerPortfolioItem[]> {
    return api.get<LecturerPortfolioItem[]>(`/api/lecturers/${lecturerId}/portfolio-items`);
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
  get(id: string): Promise<Lecturer> {
    return api.get<Lecturer>(`/api/lecturers/${id}`);
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
