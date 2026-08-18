export interface QaLlmMessage {
  role: "system" | "user";
  content: string;
}

export interface QaLlmProvider {
  readonly model: string;
  completeJson(messages: QaLlmMessage[]): Promise<unknown>;
}

export class QaLlmProviderError extends Error {}

export class OpenAiCompatibleQaLlmProvider implements QaLlmProvider {
  readonly model: string;
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(options: { apiUrl: string; apiKey?: string; model: string }) {
    this.apiUrl = options.apiUrl;
    this.apiKey = options.apiKey ?? "";
    this.model = options.model;
  }

  async completeJson(messages: QaLlmMessage[]): Promise<unknown> {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) {
      throw new QaLlmProviderError(`QA LLM provider failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new QaLlmProviderError("QA LLM provider returned no JSON content");
    }
    try {
      return JSON.parse(content);
    } catch {
      throw new QaLlmProviderError("QA LLM provider returned invalid JSON");
    }
  }
}

export function configuredQaLlmProvider(
  env: NodeJS.ProcessEnv = process.env,
): QaLlmProvider | null {
  const apiUrl = env.QA_LLM_API_URL?.trim() ?? "";
  const model = env.QA_LLM_MODEL?.trim() ?? "";
  if (!apiUrl || !model) return null;
  return new OpenAiCompatibleQaLlmProvider({
    apiUrl,
    apiKey: env.QA_LLM_API_KEY,
    model,
  });
}
