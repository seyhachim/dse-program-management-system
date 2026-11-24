import { describe, expect, test } from "bun:test";
import { CreateVisitParticipantSchema, CreateDseNewsSchema, canPublishDseNews } from "./activity-publications.ts";

describe("field visit participant integrity", () => {
  test("the Kampot paper trip roster does not certify farm attendance", () => {
    const row = CreateVisitParticipantSchema.parse({
      studentId: "065baca3-e3fc-4624-ad45-4696adc519bf", goStatus: "Marked",
      returnStatus: "Marked", source: "PaperTripSheet",
    });
    expect(row.farmStatus).toBe("Unverified");
    expect(CreateVisitParticipantSchema.safeParse({ ...row, farmStatus: "Confirmed" }).success).toBe(false);
  });
  test("rejects ambiguous identity or personal note overflow", () => {
    expect(CreateVisitParticipantSchema.safeParse({
      studentId: "065baca3-e3fc-4624-ad45-4696adc519bf", externalName: "Other Person",
    }).success).toBe(false);
    expect(CreateVisitParticipantSchema.safeParse({ externalName: "Staff Member", note: "a".repeat(501) }).success).toBe(false);
  });
});

describe("programme news publication", () => {
  const input = { title: "DSE Students Explore Sindora Garden", body: "Description of the study visit and its learning goals." };
  test("blocks insecure photo links and requires cover alt text", () => {
    expect(CreateDseNewsSchema.safeParse({ ...input, coverImageUrl: "http://not-secure.test/x.jpg" }).success).toBe(false);
    expect(CreateDseNewsSchema.safeParse({ ...input, coverImageUrl: "https://example.org/x.jpg" }).success).toBe(false);
  });
  test("requires reviewed image consent to publish with photos", () => {
    expect(canPublishDseNews({ body: "a".repeat(80), coverImageUrl: "https://example.org/img", gallery: [], mediaApproved: false })).toBe(false);
    expect(canPublishDseNews({ body: "a".repeat(80), coverImageUrl: null, gallery: [], mediaApproved: false })).toBe(true);
  });
});
