import { describe, expect, test } from "bun:test";
import {
  classifyEvidencePeriod,
  importStaffInformation,
  inspectPhone,
  parseStaffInformationCsv,
} from "./staff-information-import.ts";

function csvRow(values: string[]): string {
  return values.map((value) => value.includes(",") ? `"${value.replaceAll('"', '""')}"` : value).join(",");
}

function sampleCsv(overrides: Partial<Record<number, string>> = {}): string {
  const data = Array.from({ length: 13 }, () => "");
  data[0] = "1";
  data[2] = "Example";
  data[3] = "Lecturer";
  data[4] = "Female";
  data[5] = "Lecturer (Full Time)";
  data[6] = "Master";
  data[7] = "Computer Vision; Machine Learning";
  data[8] = "Example.Lecturer@RUPP.edu.kh";
  data[9] = "012 345 678";
  data[10] = "";
  data[11] = "Full-time lecturer with 9 years of experience; teaches Example Course.";
  data[12] = "";
  for (const [index, value] of Object.entries(overrides)) data[Number(index)] = value;
  return [
    "",
    "",
    csvRow(["No.", "", "", "", "", "", "", "Research Interests", "Contacts", "", "Publications/achievements(IEEE style)", "Short Bio", "Link to Online Resources"]),
    csvRow(["", "", "", "", "", "", "", "", "RUPP Email", "Phone Number"]),
    csvRow(data),
  ].join("\n");
}

function fakeStore(options: { existing?: boolean; evidenceExists?: boolean } = {}) {
  const calls = {
    createUser: 0,
    updateUser: 0,
    profile: 0,
    role: 0,
    evidence: 0,
  };
  const existingUser = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Example Lecturer",
    email: "example.lecturer@rupp.edu.kh",
    title: "Lecturer",
    qualification: "Master",
    phone: "012 345 678",
    profileImageUrl: null,
    lecturerProfile: {
      gender: "Female",
      employmentType: "Full Time",
      fieldOfSpecialization: "Computer Vision; Machine Learning",
      yearsOfExperience: null,
      shortBio: "Full-time lecturer with 9 years of experience; teaches Example Course.",
      programmeStartDate: null,
    },
  };

  const store: Parameters<typeof importStaffInformation>[0] = {
    async findUsersByEmail() {
      return options.existing ? [existingUser] : [];
    },
    async ensureDependencies() {
      return { roleId: "role-lecturer" };
    },
    async createUser(row) {
      calls.createUser += 1;
      return { ...existingUser, name: row.name, email: row.email! };
    },
    async updateUserMissingFields(user) {
      calls.updateUser += 1;
      return { user, changed: [], skipped: ["name", "title", "qualification", "phone"], conflicts: [] };
    },
    async fillLecturerProfile() {
      calls.profile += 1;
      return { changed: [], skipped: ["gender", "employmentType", "fieldOfSpecialization", "shortBio", "programmeStartDate"], conflicts: [] };
    },
    async ensureLecturerRole() {
      calls.role += 1;
    },
    async evidenceExists() {
      return options.evidenceExists ?? false;
    },
    async createEvidence(_userId, evidence) {
      calls.evidence += 1;
      return evidence.identifier;
    },
  };
  return { store, calls };
}

describe("Staff Information CSV parser", () => {
  test("maps the current four-row header layout without parsing teaching or experience from bio", () => {
    const [row] = parseStaffInformationCsv(sampleCsv());
    expect(row).toMatchObject({
      sourceRow: 5,
      name: "Example Lecturer",
      email: "example.lecturer@rupp.edu.kh",
      title: "Lecturer",
      employmentType: "Full Time",
      qualification: "Master",
      fieldOfSpecialization: "Computer Vision; Machine Learning",
      programmeStartDate: null,
    });
    expect(row?.shortBio).toContain("9 years of experience");
    expect(row?.evidence.map((item) => item.kind)).toEqual(["ResearchInterest", "ResearchInterest"]);
    expect(row?.evidence.some((item) => item.title.includes("Example Course"))).toBe(false);
  });

  test("blank publication and online-resource cells do not fabricate evidence", () => {
    const [row] = parseStaffInformationCsv(sampleCsv());
    expect(row?.evidence).toHaveLength(2);
  });

  test("publication and achievement prefixes preserve explicit source type", () => {
    const [row] = parseStaffInformationCsv(sampleCsv({
      10: "Publication: Example paper\nAchievement: Best paper award",
    }));
    expect(row?.evidence.map((item) => item.kind)).toEqual([
      "ResearchInterest",
      "ResearchInterest",
      "Publication",
      "Other",
    ]);
    expect(row?.sourceWarnings).toHaveLength(0);
  });

  test("unprefixed publication-or-achievement text is not guessed and requires review", () => {
    const [row] = parseStaffInformationCsv(sampleCsv({ 10: "Ambiguous citation or award" }));
    expect(row?.evidence.at(-1)?.kind).toBe("Other");
    expect(row?.sourceWarnings.join(" ")).toContain("needs review");
  });

  test("rejects expiring signed profile-image URLs", () => {
    const [row] = parseStaffInformationCsv(sampleCsv({
      1: "https://example.supabase.co/storage/v1/object/sign/lecturers/a.jpg?token=secret",
    }));
    expect(row?.profileImageUrl).toBeNull();
    expect(row?.sourceWarnings.join(" ")).toContain("stable HTTPS URL");
  });

  test("does not guess a missing phone leading zero", () => {
    expect(inspectPhone("966622798").value).toBeNull();
    expect(inspectPhone("097 588 2929").value).toBe("097 588 2929");
  });
});

describe("Staff Information import semantics", () => {
  test("derives publication timing from evidence date and programme start date", () => {
    expect(classifyEvidencePeriod("2022-05-01", "2023-01-01")).toBe("prior_to_dse");
    expect(classifyEvidencePeriod("2023-01-01", "2023-01-01")).toBe("during_dse");
    expect(classifyEvidencePeriod("2024-02-01", "2023-01-01")).toBe("during_dse");
    expect(classifyEvidencePeriod(null, "2023-01-01")).toBe("unclassified");
    expect(classifyEvidencePeriod("2024-02-01", null)).toBe("unclassified");
  });

  test("dry-run never performs writes", async () => {
    const rows = parseStaffInformationCsv(sampleCsv());
    const { store, calls } = fakeStore();
    const report = await importStaffInformation(store, rows, false);
    expect(report.mode).toBe("dry-run");
    expect(report.results[0]?.action).toBe("create");
    expect(calls.createUser).toBe(0);
    expect(calls.profile).toBe(0);
    expect(calls.role).toBe(0);
    expect(calls.evidence).toBe(0);
  });

  test("re-running source evidence skips deterministic identifiers", async () => {
    const rows = parseStaffInformationCsv(sampleCsv());
    const { store, calls } = fakeStore({ existing: true, evidenceExists: true });
    const report = await importStaffInformation(store, rows, true);
    expect(report.summary.evidenceCreated).toBe(0);
    expect(report.summary.evidenceSkipped).toBe(2);
    expect(calls.evidence).toBe(0);
  });

  test("missing email is manual review and never creates a user", async () => {
    const rows = parseStaffInformationCsv(sampleCsv({ 8: "" }));
    const { store, calls } = fakeStore();
    const report = await importStaffInformation(store, rows, true);
    expect(report.results[0]?.action).toBe("manual-review");
    expect(calls.createUser).toBe(0);
  });
});
