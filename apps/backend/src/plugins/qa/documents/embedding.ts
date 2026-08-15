export interface QaEmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

export class QaEmbeddingProviderError extends Error {}

function validateVectors(vectors: unknown, expectedCount: number): number[][] {
  if (!Array.isArray(vectors) || vectors.length !== expectedCount) {
    throw new QaEmbeddingProviderError("Embedding provider returned an unexpected vector count");
  }

  let dimension: number | null = null;
  return vectors.map((vector) => {
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new QaEmbeddingProviderError("Embedding provider returned an empty vector");
    }
    const values = vector.map((value) => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new QaEmbeddingProviderError("Embedding provider returned a non-numeric vector value");
      }
      return value;
    });
    dimension ??= values.length;
    if (values.length !== dimension) {
      throw new QaEmbeddingProviderError("Embedding provider returned inconsistent vector dimensions");
    }
    return values;
  });
}

export class OpenAiCompatibleQaEmbeddingProvider implements QaEmbeddingProvider {
  readonly model: string;
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(options: { apiUrl: string; apiKey?: string; model: string }) {
    this.apiUrl = options.apiUrl;
    this.apiKey = options.apiKey ?? "";
    this.model = options.model;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!response.ok) {
      throw new QaEmbeddingProviderError(
        `Embedding provider request failed with status ${response.status}`,
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{ index?: number; embedding?: unknown }>;
    };
    if (!Array.isArray(payload.data) || payload.data.length !== texts.length) {
      throw new QaEmbeddingProviderError("Embedding provider returned an invalid response shape");
    }
    const ordered = [...payload.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return validateVectors(
      ordered.map((item) => item.embedding),
      texts.length,
    );
  }
}

export function configuredQaEmbeddingProvider(
  env: NodeJS.ProcessEnv = process.env,
): QaEmbeddingProvider | null {
  const apiUrl = env.QA_EMBEDDING_API_URL?.trim() ?? "";
  const model = env.QA_EMBEDDING_MODEL?.trim() ?? "";
  if (!apiUrl || !model) return null;
  return new OpenAiCompatibleQaEmbeddingProvider({
    apiUrl,
    apiKey: env.QA_EMBEDDING_API_KEY,
    model,
  });
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return -1;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return -1;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
