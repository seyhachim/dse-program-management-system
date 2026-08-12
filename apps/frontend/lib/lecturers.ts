import type {
  CreateLecturerInput,
  Lecturer,
  UpdateLecturerInput,
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
