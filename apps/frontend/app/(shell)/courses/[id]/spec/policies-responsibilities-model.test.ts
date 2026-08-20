import { describe, expect, test } from "bun:test";
import type { PolicySection } from "@dse-pms/shared-types";
import {
  POLICIES_RESPONSIBILITIES_TAB,
  mergePolicyFieldForSave,
  normalizePoliciesResponsibilitiesTab,
  reconcilePolicyDraftWithPersisted,
} from "./policies-responsibilities-model";

const PERSISTED_POLICY: PolicySection = {
  attendancePreparation: "Persisted attendance",
  academicIntegrity: "Persisted integrity",
  assignmentsLateSubmission: "Persisted assignments",
  examinationRules: "Persisted exams",
  penaltiesConsequences: "Persisted penalties",
};

describe("Policies & Responsibilities Course Spec tab", () => {
  test("uses policy as the canonical combined tab id", () => {
    expect(POLICIES_RESPONSIBILITIES_TAB).toBe("policy");
  });

  test("redirects legacy responsibility deep links to the combined tab", () => {
    expect(normalizePoliciesResponsibilitiesTab("responsibility")).toBe("policy");
  });

  test("keeps existing policy deep links stable", () => {
    expect(normalizePoliciesResponsibilitiesTab("policy")).toBe("policy");
  });

  test("does not rewrite unrelated Course Spec tabs", () => {
    expect(normalizePoliciesResponsibilitiesTab("clos")).toBe("clos");
    expect(normalizePoliciesResponsibilitiesTab(null)).toBeNull();
  });

  test("builds a card save from persisted state so another card draft cannot leak", () => {
    const draftWithHiddenUnsavedChange: PolicySection = {
      ...PERSISTED_POLICY,
      attendancePreparation: "UNSAVED hidden attendance edit",
      examinationRules: "  Saved exam edit  ",
    };

    const payload = mergePolicyFieldForSave(
      PERSISTED_POLICY,
      "examinationRules",
      draftWithHiddenUnsavedChange.examinationRules,
    );

    expect(payload).toEqual({
      ...PERSISTED_POLICY,
      examinationRules: "Saved exam edit",
    });
    expect(payload.attendancePreparation).toBe("Persisted attendance");
  });

  test("does not mutate the persisted policy while building a field save", () => {
    const payload = mergePolicyFieldForSave(
      PERSISTED_POLICY,
      "academicIntegrity",
      "Updated integrity",
    );

    expect(PERSISTED_POLICY.academicIntegrity).toBe("Persisted integrity");
    expect(payload.academicIntegrity).toBe("Updated integrity");
  });

  test("preserves dirty sibling drafts while reconciling newly persisted fields", () => {
    const draft: PolicySection = {
      ...PERSISTED_POLICY,
      attendancePreparation: "UNSAVED hidden attendance edit",
    };
    const nextPersisted: PolicySection = {
      ...PERSISTED_POLICY,
      examinationRules: "Saved exam edit",
    };

    const reconciled = reconcilePolicyDraftWithPersisted(
      draft,
      PERSISTED_POLICY,
      nextPersisted,
    );

    expect(reconciled.attendancePreparation).toBe(
      "UNSAVED hidden attendance edit",
    );
    expect(reconciled.examinationRules).toBe("Saved exam edit");
  });

  test("refreshes a locally clean field from the latest persisted value", () => {
    const nextPersisted: PolicySection = {
      ...PERSISTED_POLICY,
      academicIntegrity: "New persisted integrity",
    };

    const reconciled = reconcilePolicyDraftWithPersisted(
      PERSISTED_POLICY,
      PERSISTED_POLICY,
      nextPersisted,
    );

    expect(reconciled.academicIntegrity).toBe("New persisted integrity");
  });
});
