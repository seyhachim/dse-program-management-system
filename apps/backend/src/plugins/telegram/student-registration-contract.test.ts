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
  email: " Student@RUPP.EDU.KH ",
};

describe("Telegram student pending registration contract", () => {
  test("accepts bilingual names without a student ID, with normalized university email", () => {
    const parsed = TelegramStudentRegistrationInputSchema.parse(valid);
    expect(parsed.latinFamilyName).toBe("Sok");
    expect(parsed.officialStudentId).toBeUndefined();
    expect(parsed.email).toBe("student@rupp.edu.kh");
    expect(parsed.careerProfile).toBeUndefined();
  });

  test("explicit not-issued application is valid but cannot claim an email simultaneously", () => {
    expect(TelegramStudentRegistrationInputSchema.safeParse({...valid,email:undefined,emailNotIssued:true}).success).toBe(true);
    expect(TelegramStudentRegistrationInputSchema.safeParse({...valid,emailNotIssued:true}).success).toBe(false);
    expect(TelegramStudentRegistrationInputSchema.safeParse({...valid,email:undefined,emailNotIssued:false}).success).toBe(false);
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
      { email: undefined },
      { email: "student@gmail.com" },
      { email: "student@rupp.edu.kh.evil.example" },
    ]) {
      expect(TelegramStudentRegistrationInputSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
    }
  });
});
