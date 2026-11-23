import { describe, expect, test } from "bun:test";
import { CreateOpportunityInput, SubmitOpportunityExperienceInput, UpdateOpportunityInput } from "@dse-pms/shared-types";
import { cambodiaToday, deadlineStillOpen, posterExtension } from "./service.ts";

const good = {
  programmeId: "dse" as const, type: "hackathon" as const,
  title: "ASEAN AI Student Hackathon", organizer: "Example Organiser",
  summary: "Develop practical and useful AI tools for communities.",
  eligibility: "Open to eligible undergraduate teams.",
  sourceUrl: "https://www.example.org/competition",
  applicationUrl: "https://www.example.org/apply",
  deadline: "2026-12-31",
};

describe("Student Opportunities source and consent contracts", () => {
  test("accepts official HTTPS sources and dates, rejects unsafe links and invalid dates", () => {
    expect(CreateOpportunityInput.safeParse(good).success).toBe(true);
    for (const url of ["http://example.org", "javascript:alert(1)", "https://user:pass@example.org", "https://localhost/foo", "https://127.0.0.1/foo"]) {
      expect(CreateOpportunityInput.safeParse({ ...good, sourceUrl: url }).success).toBe(false);
    }
    expect(CreateOpportunityInput.safeParse({ ...good, deadline: "2026-02-30" }).success).toBe(false);
    expect(CreateOpportunityInput.safeParse({ ...good, deadline: null, applicationUrl: null }).success).toBe(true);
    expect(CreateOpportunityInput.safeParse({ ...good, adminApproved: true }).success).toBe(false);
  });
  test("draft edits cannot transfer the opportunity into another programme", () => {
    const { programmeId: _programmeId, ...edit } = good;
    expect(UpdateOpportunityInput.safeParse(edit).success).toBe(true);
    expect(UpdateOpportunityInput.safeParse(good).success).toBe(false);
  });
  test("poster uploads reject fake MIME and oversized files", () => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(posterExtension(png, "image/png")).toBe("png");
    expect(() => posterExtension(png, "image/jpeg")).toThrow();
    expect(() => posterExtension(new Uint8Array(5 * 1024 * 1024 + 1), "image/png")).toThrow();
    expect(() => posterExtension(new Uint8Array(0), "image/png")).toThrow();
  });
  test("requires explicit student consent for a portfolio reference", () => {
    const evidenceId = "31231231-1111-4222-8888-0123456789ab";
    expect(SubmitOpportunityExperienceInput.safeParse({ evidenceId, outcome: "Winner" }).success).toBe(false);
    expect(SubmitOpportunityExperienceInput.safeParse({ evidenceId, outcome: "Winner", consent: false }).success).toBe(false);
    expect(SubmitOpportunityExperienceInput.safeParse({ evidenceId, outcome: "Winner", consent: true }).success).toBe(true);
  });
  test("deadline remains active through Cambodia local calendar day and expires next day", () => {
    const beforeMidnight = cambodiaToday(new Date("2026-11-06T16:59:59.000Z"));
    const afterMidnight = cambodiaToday(new Date("2026-11-06T17:00:00.000Z"));
    expect(beforeMidnight).toBe("2026-11-06");
    expect(afterMidnight).toBe("2026-11-07");
    expect(deadlineStillOpen("2026-11-06", beforeMidnight)).toBe(true);
    expect(deadlineStillOpen("2026-11-06", afterMidnight)).toBe(false);
    expect(deadlineStillOpen(null, afterMidnight)).toBe(true);
  });
});
