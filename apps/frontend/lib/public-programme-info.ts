import type {
  ProgrammeFaqAdminWrite,
  ProgrammeFaqRecord,
  ProgrammeImportantDateAdminWrite,
  ProgrammeImportantDateRecord,
  ProgrammePublicInfoOverview,
  ProgrammePublicProfileAdminWrite,
  ProgrammePublicProfileRecord,
} from "@dse-pms/shared-types";
import { api } from "./api";

function base(programmeId: string): string {
  return `/api/programme/public-information/programmes/${encodeURIComponent(programmeId)}`;
}

export const publicProgrammeInfoApi = {
  overview(programmeId: string): Promise<ProgrammePublicInfoOverview> {
    return api.get(`${base(programmeId)}/overview`);
  },
  listFaqs(programmeId: string): Promise<ProgrammeFaqRecord[]> {
    return api.get(`${base(programmeId)}/faqs`);
  },
  createFaq(programmeId: string, input: ProgrammeFaqAdminWrite): Promise<ProgrammeFaqRecord> {
    return api.post(`${base(programmeId)}/faqs`, input);
  },
  updateFaq(
    programmeId: string,
    id: string,
    input: ProgrammeFaqAdminWrite,
  ): Promise<ProgrammeFaqRecord> {
    return api.put(`${base(programmeId)}/faqs/${encodeURIComponent(id)}`, input);
  },
  publishFaq(programmeId: string, id: string): Promise<ProgrammeFaqRecord> {
    return api.post(`${base(programmeId)}/faqs/${encodeURIComponent(id)}/publish`, {});
  },
  unpublishFaq(programmeId: string, id: string): Promise<ProgrammeFaqRecord> {
    return api.post(`${base(programmeId)}/faqs/${encodeURIComponent(id)}/unpublish`, {});
  },
  removeFaq(programmeId: string, id: string): Promise<void> {
    return api.delete(`${base(programmeId)}/faqs/${encodeURIComponent(id)}`);
  },
  listImportantDates(programmeId: string): Promise<ProgrammeImportantDateRecord[]> {
    return api.get(`${base(programmeId)}/important-dates`);
  },
  createImportantDate(
    programmeId: string,
    input: ProgrammeImportantDateAdminWrite,
  ): Promise<ProgrammeImportantDateRecord> {
    return api.post(`${base(programmeId)}/important-dates`, input);
  },
  updateImportantDate(
    programmeId: string,
    id: string,
    input: ProgrammeImportantDateAdminWrite,
  ): Promise<ProgrammeImportantDateRecord> {
    return api.put(`${base(programmeId)}/important-dates/${encodeURIComponent(id)}`, input);
  },
  publishImportantDate(programmeId: string, id: string): Promise<ProgrammeImportantDateRecord> {
    return api.post(
      `${base(programmeId)}/important-dates/${encodeURIComponent(id)}/publish`,
      {},
    );
  },
  unpublishImportantDate(programmeId: string, id: string): Promise<ProgrammeImportantDateRecord> {
    return api.post(
      `${base(programmeId)}/important-dates/${encodeURIComponent(id)}/unpublish`,
      {},
    );
  },
  removeImportantDate(programmeId: string, id: string): Promise<void> {
    return api.delete(`${base(programmeId)}/important-dates/${encodeURIComponent(id)}`);
  },
  getProfile(programmeId: string): Promise<ProgrammePublicProfileRecord | null> {
    return api.get(`${base(programmeId)}/profile`);
  },
  saveProfile(
    programmeId: string,
    input: ProgrammePublicProfileAdminWrite,
  ): Promise<ProgrammePublicProfileRecord> {
    return api.put(`${base(programmeId)}/profile`, input);
  },
};
