import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import { PrismaClient } from "@prisma/client";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { publicProgrammeInfoService } from "./public-programme-info-service.ts";
import { createPublicProgrammeReadRouter } from "./public-programme-read-router.ts";

const enabled = process.env.PUBLIC_PROGRAMME_INFO_READ_DB_TESTS === "1";
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();
let server: Server | undefined;
let baseUrl = "";

function token(): string {
  return crypto.randomUUID().slice(0, 8);
}

async function createProgramme() {
  const suffix = token();
  return prisma.programme.create({
    data: {
      id: `public-http-${suffix}`,
      code: `PH${suffix}`,
      name: `Public HTTP Test ${suffix}`,
    },
  });
}

describeDb("anonymous public programme HTTP boundary", () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/programme/public", createPublicProgrammeReadRouter());
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", () => resolve()));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  test("anonymous GET returns published content without Authorization", async () => {
    const programme = await createProgramme();
    const faq = await publicProgrammeInfoService.createFaq(programme.id, {
      category: "Admission",
      slug: `anonymous-${token()}`,
      question: "Can I apply?",
      answer: "Use the confirmed admission guidance.",
      shortAnswer: null,
      keywords: ["private-search-keyword"],
      sortOrder: 0,
      isFeatured: false,
      sourceLabel: null,
      sourceUrl: null,
      reviewedAt: null,
    });
    await publicProgrammeInfoService.publishFaq(programme.id, faq.id);

    const response = await fetch(`${baseUrl}/api/programme/public/programmes/${programme.id}/faqs`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    const body = await response.json() as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]?.slug).toBe(faq.slug);
    expect(body[0]).not.toHaveProperty("keywords");
    expect(body[0]).not.toHaveProperty("status");
  });

  test("draft FAQ slug returns the same 404 class as an unknown slug", async () => {
    const programme = await createProgramme();
    const draft = await publicProgrammeInfoService.createFaq(programme.id, {
      category: "About",
      slug: `draft-http-${token()}`,
      question: "What is DSE?",
      answer: "Draft answer.",
      shortAnswer: null,
      keywords: [],
      sortOrder: 0,
      isFeatured: false,
      sourceLabel: null,
      sourceUrl: null,
      reviewedAt: null,
    });

    const draftResponse = await fetch(
      `${baseUrl}/api/programme/public/programmes/${programme.id}/faqs/${draft.slug}`,
    );
    const missingResponse = await fetch(
      `${baseUrl}/api/programme/public/programmes/${programme.id}/faqs/missing-${token()}`,
    );
    expect(draftResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);
    expect(await draftResponse.json()).toEqual({ error: "FAQ not found" });
    expect(await missingResponse.json()).toEqual({ error: "FAQ not found" });
  });

  test("ETag supports must-revalidate 304 responses", async () => {
    const programme = await createProgramme();
    const faq = await publicProgrammeInfoService.createFaq(programme.id, {
      category: "Careers",
      slug: `etag-${token()}`,
      question: "What careers are available?",
      answer: "See the published careers information.",
      shortAnswer: null,
      keywords: [],
      sortOrder: 0,
      isFeatured: false,
      sourceLabel: null,
      sourceUrl: null,
      reviewedAt: null,
    });
    await publicProgrammeInfoService.publishFaq(programme.id, faq.id);

    const first = await fetch(`${baseUrl}/api/programme/public/programmes/${programme.id}/faqs`);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const second = await fetch(`${baseUrl}/api/programme/public/programmes/${programme.id}/faqs`, {
      headers: { "If-None-Match": etag! },
    });
    expect(second.status).toBe(304);
  });

  test("public namespace defines no mutation routes", async () => {
    const programme = await createProgramme();
    const response = await fetch(`${baseUrl}/api/programme/public/programmes/${programme.id}/faqs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "should not work" }),
    });
    expect(response.status).toBe(404);
  });

  test("invalid public filters fail safely", async () => {
    const programme = await createProgramme();
    const response = await fetch(
      `${baseUrl}/api/programme/public/programmes/${programme.id}/faqs?category=InternalOnly`,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid FAQ query" });
  });
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  await prisma.$disconnect();
});
