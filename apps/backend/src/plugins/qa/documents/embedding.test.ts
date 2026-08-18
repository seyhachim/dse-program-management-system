import { expect, test } from "bun:test";
import { configuredQaEmbeddingProvider, cosineSimilarity } from "./embedding.ts";

test("embedding provider remains disabled unless both URL and model are configured", () => {
  expect(configuredQaEmbeddingProvider({} as NodeJS.ProcessEnv)).toBeNull();
  expect(
    configuredQaEmbeddingProvider({ QA_EMBEDDING_API_URL: "https://example.test/embeddings" } as NodeJS.ProcessEnv),
  ).toBeNull();

  const configured = configuredQaEmbeddingProvider({
    QA_EMBEDDING_API_URL: "https://example.test/embeddings",
    QA_EMBEDDING_MODEL: "example-embedding-model",
  } as NodeJS.ProcessEnv);
  expect(configured?.model).toBe("example-embedding-model");
});

test("cosine similarity ranks aligned vectors above unrelated vectors", () => {
  expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(-1);
  expect(cosineSimilarity([], [])).toBe(-1);
});
