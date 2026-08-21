import { expect, test } from "bun:test";
import { join } from "node:path";

test("PolicySection component regression keeps an unsaved sibling draft", async () => {
  const runner = join(import.meta.dir, "policy-section.component.runner.ts");
  const child = Bun.spawn([process.execPath, "test", runner], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`PolicySection component regression failed:\n${stdout}\n${stderr}`);
  }

  expect(exitCode).toBe(0);
});
