import { afterEach, describe, expect, test } from "bun:test";
import { gradingScalesApi } from "./grading-scales";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockJson(payload: unknown, status = 200) {
  let request: { input: string | URL | Request; init?: RequestInit } | null = null;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    request = { input, init };
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return () => request;
}

describe("grading-scale frontend API", () => {
  test("lists programme-scoped management versions", async () => {
    const getRequest = mockJson([]);
    await gradingScalesApi.list("dse");
    const request = getRequest();
    expect(String(request?.input)).toBe(
      "http://localhost:4000/api/programme/grading-scales?programmeId=dse",
    );
    expect(request?.init?.method).toBeUndefined();
  });

  test("creates a scale through the governed create endpoint", async () => {
    const getRequest = mockJson({ id: "version-1", status: "Draft" }, 201);
    await gradingScalesApi.create({
      programmeId: "dse",
      code: "standard",
      name: "Standard Rating Scale",
      description: "Programme grading policy",
      effectiveFrom: "2027-01-01",
      changeSummary: "Initial policy",
      grades: [
        {
          sortOrder: 1,
          letterGrade: "A",
          gradePoint: 4,
          minScore: 85,
          maxScore: 100,
          minInclusive: true,
          maxInclusive: true,
          explanation: "Excellent",
          isPassing: true,
        },
      ],
    });
    const request = getRequest();
    expect(String(request?.input)).toBe("http://localhost:4000/api/programme/grading-scales");
    expect(request?.init?.method).toBe("POST");
  });

  test("uses explicit draft, revision, and approval lifecycle endpoints", async () => {
    let getRequest = mockJson({ id: "version-1", status: "Draft" });
    await gradingScalesApi.updateDraft("version-1", { changeSummary: "Adjusted bands" });
    expect(String(getRequest()?.input)).toContain("/grading-scales/versions/version-1");
    expect(getRequest()?.init?.method).toBe("PUT");

    getRequest = mockJson({ id: "version-2", status: "Draft" }, 201);
    await gradingScalesApi.createRevision("scale-1", {
      changeSummary: "Annual review",
      effectiveFrom: "2028-01-01",
    });
    expect(String(getRequest()?.input)).toContain("/grading-scales/scale-1/revisions");
    expect(getRequest()?.init?.method).toBe("POST");

    getRequest = mockJson({ id: "version-2", status: "Approved" });
    await gradingScalesApi.approve("version-2", { note: "Approved by programme leadership" });
    expect(String(getRequest()?.input)).toContain("/grading-scales/versions/version-2/approve");
    expect(getRequest()?.init?.method).toBe("POST");
  });
});
