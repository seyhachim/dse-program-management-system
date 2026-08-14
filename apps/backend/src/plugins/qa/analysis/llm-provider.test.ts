import { expect, test } from "bun:test";
import { configuredQaLlmProvider } from "./llm-provider.ts";

test("QA LLM provider fails closed unless URL and model are configured", () => {
  expect(configuredQaLlmProvider({} as NodeJS.ProcessEnv)).toBeNull();
  expect(
    configuredQaLlmProvider({ QA_LLM_API_URL: "https://example.test/chat" } as NodeJS.ProcessEnv),
  ).toBeNull();

  const configured = configuredQaLlmProvider({
    QA_LLM_API_URL: "https://example.test/chat",
    QA_LLM_MODEL: "qa-test-model",
  } as NodeJS.ProcessEnv);
  expect(configured?.model).toBe("qa-test-model");
});
