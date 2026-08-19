import { describe, expect, test } from "bun:test";
import {
  importLecturerProfiles,
  inspectPhone,
  normalizeEmail,
  parseLecturerImportDocument,
  type ExistingUser,
  type LecturerImportStore,
} from "./lecturer-profile-import.ts";

function documentWith(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "AUNQA_Staff_Profile.xlsx",
    programme: "DSE",
    importMode: "one-time-upsert",
    identityKey: "email",
    lecturers: [
      {
        sourceRow: 1,
        name: "Example Lecturer",
        email: " Example.Lecturer@RUPP.edu.kh ",
        phone: "012 345 678",
        title: "Lecturer",
        qualification: "Master",
        staffProfile: {
          gender: "Female",
          employmentType: "Full Time",
          fieldOfSpecialization: "Data Science",
          yearsOfExperience: 9,
          coursesTaught: "Legacy Course A, Legacy Course B",
        },
        role: "lecturer",
        ...overrides,
      },
    ],
  };
}

function fakeStore(existing: ExistingUser[] = []) {
  const calls = {
    createUser: [] as unknown[],
    fillMissingUserFields: [] as unknown[],
    upsertLecturerRole: [] as unknown[],
    upsertLecturerProfile: [] as unknown[],
  };

  const store: LecturerImportStore = {
    async findUsersByEmail() {
      return existing;
    },
    async ensureDependencies() {
      return { roleId: "role-lecturer", programmeId: "dse" };
    },
    async createUser(data) {
      calls.createUser.push(data);
      return {
        id: "new-user",
        email: data.email,
        name: data.name,
        title: data.title,
        qualification: data.qualification,
        phone: data.phone,
      };
    },
    async fillMissingUserFields(id, data) {
      calls.fillMissingUserFields.push({ id, data });
      const user = existing[0]!;
      return { ...user, ...data };
    },
    async upsertLecturerRole(userId, roleId, programmeId) {
      calls.upsertLecturerRole.push({ userId, roleId, programmeId });
    },
    async upsertLecturerProfile(userId, data) {
      calls.upsertLecturerProfile.push({ userId, data });
    },
  };

  return { store, calls };
}

describe("lecturer profile import", () => {
  test("normalizes email identity", () => {
    expect(normalizeEmail(" Lecturer@RUPP.edu.kh ")).toBe("lecturer@rupp.edu.kh");
  });

  test("flags the two Excel-style missing-leading-zero phone shapes without guessing", () => {
    expect(inspectPhone("966622798")).toEqual({
      value: null,
      warning:
        "Phone '966622798' may have lost a leading zero in Excel; phone was not imported. Correct the JSON manually and rerun if confirmed.",
    });
    expect(inspectPhone("12876866").value).toBeNull();
    expect(inspectPhone("097 588 2929")).toEqual({ value: "097 588 2929" });
    expect(inspectPhone("+855 12 876 866")).toEqual({ value: "+855 12 876 866" });
  });

  test("rejects duplicate emails case-insensitively before database work", () => {
    const input = documentWith();
    input.lecturers.push({ ...input.lecturers[0]!, sourceRow: 2, email: "example.lecturer@rupp.edu.kh" });
    expect(() => parseLecturerImportDocument(input)).toThrow("Duplicate lecturer email");
  });

  test("dry-run performs no writes", async () => {
    const doc = parseLecturerImportDocument(documentWith());
    const { store, calls } = fakeStore();
    const summary = await importLecturerProfiles(store, doc, false);

    expect(summary.mode).toBe("dry-run");
    expect(summary.results[0]?.action).toBe("would_create");
    expect(calls.createUser).toHaveLength(0);
    expect(calls.upsertLecturerRole).toHaveLength(0);
    expect(calls.upsertLecturerProfile).toHaveLength(0);
  });

  test("commit creates user, lecturer role, and structured profile", async () => {
    const doc = parseLecturerImportDocument(documentWith());
    const { store, calls } = fakeStore();
    const summary = await importLecturerProfiles(store, doc, true);

    expect(summary.results[0]?.action).toBe("created");
    expect(calls.createUser).toEqual([
      {
        email: "example.lecturer@rupp.edu.kh",
        name: "Example Lecturer",
        title: "Lecturer",
        qualification: "Master",
        phone: "012 345 678",
      },
    ]);
    expect(calls.upsertLecturerRole).toEqual([
      { userId: "new-user", roleId: "role-lecturer", programmeId: "dse" },
    ]);
    expect(calls.upsertLecturerProfile).toEqual([
      {
        userId: "new-user",
        data: {
          gender: "Female",
          employmentType: "Full Time",
          fieldOfSpecialization: "Data Science",
          yearsOfExperience: 9,
          legacyCoursesTaught: "Legacy Course A, Legacy Course B",
        },
      },
    ]);
  });

  test("existing user keeps populated identity/contact fields while profile is upserted", async () => {
    const existing: ExistingUser = {
      id: "existing-user",
      email: "example.lecturer@rupp.edu.kh",
      name: "Existing Name",
      title: "Senior Lecturer",
      qualification: null,
      phone: "010 000 000",
    };
    const doc = parseLecturerImportDocument(documentWith());
    const { store, calls } = fakeStore([existing]);
    const summary = await importLecturerProfiles(store, doc, true);

    expect(summary.results[0]?.action).toBe("updated");
    expect(calls.createUser).toHaveLength(0);
    expect(calls.fillMissingUserFields).toEqual([
      { id: "existing-user", data: { qualification: "Master" } },
    ]);
    expect(calls.upsertLecturerRole).toHaveLength(1);
    expect(calls.upsertLecturerProfile).toHaveLength(1);
  });

  test("ambiguous phone is skipped but the rest of a new lecturer imports", async () => {
    const doc = parseLecturerImportDocument(documentWith({ phone: "966622798" }));
    const { store, calls } = fakeStore();
    const summary = await importLecturerProfiles(store, doc, true);

    expect(summary.warningCount).toBe(1);
    expect(calls.createUser[0]).toMatchObject({ phone: null });
    expect(calls.upsertLecturerRole).toHaveLength(1);
    expect(calls.upsertLecturerProfile).toHaveLength(1);
  });

  test("blocks ambiguous case-insensitive duplicates already present in the database", async () => {
    const doc = parseLecturerImportDocument(documentWith());
    const duplicate: ExistingUser = {
      id: "one",
      email: "example.lecturer@rupp.edu.kh",
      name: "One",
      title: null,
      qualification: null,
      phone: null,
    };
    const { store } = fakeStore([duplicate, { ...duplicate, id: "two", email: "Example.Lecturer@RUPP.edu.kh" }]);

    await expect(importLecturerProfiles(store, doc, false)).rejects.toThrow(
      "Database contains multiple users matching",
    );
  });
});
