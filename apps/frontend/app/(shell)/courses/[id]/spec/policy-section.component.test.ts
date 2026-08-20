import { expect, test } from "bun:test";
import { join } from "node:path";

test("PolicySection component regression keeps an unsaved sibling draft", async () => {
  const runner = join(import.meta.dir, "policy-section.component.runner.ts");
  const process = Bun.spawn([process.execPath, "test", runner], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
});
