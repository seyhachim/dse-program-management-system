import { describe, expect, test } from "bun:test";
import { fetchPublicNewsArticle } from "./public-dse-news-article";

const api = "https://example.invalid/news";
const id = "11111111-2222-4333-8444-555555555555";
const article = {
  id, title: "Synthetic field visit", summary: "Public summary", tags: ["Field Visit"],
  publishedAt: "2026-11-24T09:30:00.000Z", cover: null, body: "Public body", gallery: [],
};

describe("public news article loader", () => {
  test("returns an approved article without caching across requests", async () => {
    const result = await fetchPublicNewsArticle(api, id, async (url, init) => {
      expect(url).toBe(api + "/" + id);
      expect(init.cache).toBe("no-store");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return Response.json(article);
    });
    expect(result).toEqual(article);
  });
  test("rejects malformed IDs without contacting the backend", async () => {
    expect(await fetchPublicNewsArticle(api, "../private", async () => {
      throw new Error("Unexpected fetch");
    })).toBeNull();
  });
  test("returns null for a genuine 404 only", async () => {
    expect(await fetchPublicNewsArticle(api, id, async () =>
      new Response(null, { status: 404 }))).toBeNull();
  });
  for (const status of [401, 403, 429, 500, 502, 503, 504]) {
    test(`propagates HTTP ${status} instead of false 404`, async () => {
      await expect(fetchPublicNewsArticle(api, id, async () =>
        new Response(null, { status }))).rejects.toThrow(`HTTP ${status}`);
    });
  }
  test("propagates timeout and connection failures", async () => {
    for (const error of [new DOMException("Timed out", "TimeoutError"), new TypeError("fetch failed")]) {
      await expect(fetchPublicNewsArticle(api, id, async () => {
        throw error;
      })).rejects.toThrow(error.message);
    }
  });
  test("rejects malformed or empty successful payloads instead of false 404", async () => {
    for (const response of [Response.json(null), Response.json({}), new Response("not json")]) {
      await expect(fetchPublicNewsArticle(api, id, async () => response)).rejects.toThrow();
    }
  });
});
