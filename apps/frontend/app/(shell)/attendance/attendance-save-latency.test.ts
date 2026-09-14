import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const attendanceClientSource = readFileSync(
  new URL("./attendance-client.tsx", import.meta.url),
  "utf8",
);

describe("attendance save latency", () => {
  test("successful saves refresh history without keeping the save spinner blocked", () => {
    expect(attendanceClientSource).toContain(
      "void queryClient.invalidateQueries({ queryKey: historyKey, exact: true });",
    );
    expect(attendanceClientSource).not.toContain(
      "await queryClient.invalidateQueries({ queryKey: historyKey, exact: true });",
    );
  });
});
