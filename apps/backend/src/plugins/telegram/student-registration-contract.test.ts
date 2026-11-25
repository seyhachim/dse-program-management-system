import { describe, expect, test } from "bun:test";
import { TelegramStudentRegistrationInputSchema } from "./student-registration-contract.ts";

const valid = {
  verificationId: "b3b04e11-1943-4e90-9a58-5c8d4d31df1c",
  khmerFamilyName: "សុខ",
  khmerGivenName: "ដារ៉ា",
  latinFamilyName: " Sok ",
  latinGivenName: "Dara",
  cohortId: "cohort-test",
  sectionId: "section-test",
};

describe("Telegram student pending registration contract", () => {
  test("accepts bilingual names without a student ID or email", () => {
    const parsed = TelegramStudentRegistrationInputSchema.parse(valid);
    expect(parsed.latinFamilyName).toBe("Sok");
    expect(parsed.officialStudentId).toBeUndefined();
    expect(parsed.email).toBeUndefined();
  });

  for (const extra of [
    { telegramUserId: "999" },
    { role: "admin" },
    { status: "APPROVED" },
    { programmeId: "other" },
    { userId: "existing" },
    { phone: "123456" },
  ]) {
    test(`rejects untrusted field ${Object.keys(extra)[0]}`, () => {
      expect(TelegramStudentRegistrationInputSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    });
  }

  test("rejects malformed verification, missing names and invalid email", () => {
    for (const patch of [
      { verificationId: "not-a-uuid" },
      { khmerGivenName: " " },
      { latinGivenName: "a\nname" },
      { cohortId: "" },
      { sectionId: "" },
      { email: "invalid" },
    ]) {
      expect(TelegramStudentRegistrationInputSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
    }
  });
});
