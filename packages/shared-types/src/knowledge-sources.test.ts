import { describe, expect, test } from "bun:test";
import {
  CreateKnowledgeSourceSchema,
  KnowledgeSourceListQuerySchema,
  VerifyKnowledgeSourceVersionSchema,
} from "./knowledge-sources.ts";

const VALID_SOURCE = {
  programmeId: "dse",
  domain: "AUN_QA",
  title: "Guide to AUN-QA Assessment at Programme Level",
  shortTitle: "AUN-QA Programme Guide",
  issuingOrganisation: "ASEAN University Network",
  sourceType: "OFFICIAL_FRAMEWORK",
  accessClassification: "INTERNAL",
  jurisdictionScope: "DSE programme quality assurance",
  initialVersion: {
    versionLabel: "4.0",
    publicationDate: "2020-10-01",
    effectiveDate: null,
    reviewDate: null,
    officialUrl: "https://www.aunsec.org/",
    storedFileRef: null,
    language: "en",
    checksum: null,
  },
} as const;

describe("trusted knowledge-source contracts", () => {
  test("accepts a valid source with exact version provenance", () => {
    const parsed = CreateKnowledgeSourceSchema.parse(VALID_SOURCE);
    expect(parsed.domain).toBe("AUN_QA");
    expect(parsed.initialVersion.versionLabel).toBe("4.0");
    expect(parsed.accessClassification).toBe("INTERNAL");
  });

  test("rejects domains outside the governed initial registry", () => {
    expect(() =>
      CreateKnowledgeSourceSchema.parse({
        ...VALID_SOURCE,
        domain: "RANDOM_WEB",
      }),
    ).toThrow();
  });

  test("rejects malformed source dates", () => {
    expect(() =>
      CreateKnowledgeSourceSchema.parse({
        ...VALID_SOURCE,
        initialVersion: {
          ...VALID_SOURCE.initialVersion,
          publicationDate: "October 2020",
        },
      }),
    ).toThrow();
  });

  test("requires a human-selected non-unverified trust category when verifying", () => {
    expect(() =>
      VerifyKnowledgeSourceVersionSchema.parse({
        programmeId: "dse",
        trustCategory: "UNVERIFIED",
        verificationNote: "Official issuing authority confirmed.",
      }),
    ).toThrow();
  });

  test("requires an explicit why-trusted note", () => {
    expect(() =>
      VerifyKnowledgeSourceVersionSchema.parse({
        programmeId: "dse",
        trustCategory: "AUTHORITATIVE",
        verificationNote: "",
      }),
    ).toThrow();
  });

  test("accepts governed list filters", () => {
    const parsed = KnowledgeSourceListQuerySchema.parse({
      programmeId: "dse",
      domain: "CAMBODIA_OBE",
      trustCategory: "AUTHORITATIVE",
      accessClassification: "PUBLIC",
      status: "CURRENT",
      query: "FutureFit",
    });
    expect(parsed.domain).toBe("CAMBODIA_OBE");
    expect(parsed.status).toBe("CURRENT");
  });
});
