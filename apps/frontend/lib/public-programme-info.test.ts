import { afterEach, describe, expect, test } from "bun:test";
import { publicProgrammeInfoApi } from "./public-programme-info";

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

describe("public programme information frontend API", () => {
  test("loads the programme-scoped admin overview", async () => {
    const getRequest = mockJson({
      programmeId: "dse",
      faqTotal: 0,
      faqPublished: 0,
      faqDraft: 0,
      importantDateTotal: 0,
      importantDatePublished: 0,
      importantDateDraft: 0,
      hasProfile: false,
    });

    await publicProgrammeInfoApi.overview("dse");
    const request = getRequest();
    expect(String(request?.input)).toBe(
      "http://localhost:4000/api/programme/public-information/programmes/dse/overview",
    );
    expect(request?.init?.method).toBeUndefined();
  });

  test("creates FAQ content without client-controlled publication fields", async () => {
    const getRequest = mockJson({ id: "faq-1" }, 201);
    await publicProgrammeInfoApi.createFaq("dse", {
      category: "Admission",
      slug: "who-can-apply",
      question: "Who can apply?",
      answer: "Follow the confirmed admission requirements.",
      shortAnswer: null,
      keywords: ["admission"],
      sortOrder: 0,
      isFeatured: false,
      sourceLabel: null,
      sourceUrl: null,
      reviewedAt: null,
    });

    const request = getRequest();
    expect(String(request?.input)).toBe(
      "http://localhost:4000/api/programme/public-information/programmes/dse/faqs",
    );
    expect(request?.init?.method).toBe("POST");
    const body = JSON.parse(String(request?.init?.body)) as Record<string, unknown>;
    expect(body.slug).toBe("who-can-apply");
    expect(body.status).toBeUndefined();
    expect(body.publishedAt).toBeUndefined();
  });

  test("uses explicit lifecycle endpoints for publication", async () => {
    const getRequest = mockJson({ id: "faq-1", status: "Published" });
    await publicProgrammeInfoApi.publishFaq("dse", "faq-1");
    const request = getRequest();
    expect(String(request?.input)).toBe(
      "http://localhost:4000/api/programme/public-information/programmes/dse/faqs/faq-1/publish",
    );
    expect(request?.init?.method).toBe("POST");
  });
});
