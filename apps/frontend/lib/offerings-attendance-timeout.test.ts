import { describe, expect, test } from "bun:test";
import type { SaveAttendanceInput } from "@dse-pms/shared-types";
import { ApiError } from "./api";
import {
  ATTENDANCE_SAVE_TIMEOUT_MS,
  saveAttendanceWithTimeout,
} from "./offerings";

describe("attendance save timeout", () => {
  test("uses the 65-second production boundary", () => {
    expect(ATTENDANCE_SAVE_TIMEOUT_MS).toBe(65_000);
  });

  test("aborts once, reports uncertain commit status and never retries automatically", async () => {
    let attempts = 0;
    let receivedSignal: AbortSignal | undefined;
    const put = <T>(_path: string, _body: unknown, signal?: AbortSignal): Promise<T> => {
      attempts += 1;
      receivedSignal = signal;
      return new Promise<T>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
          once: true,
        });
      });
    };

    const input = { records: [] } as unknown as SaveAttendanceInput;
    const result = saveAttendanceWithTimeout("offering-1", "2026-09-21", input, 1, put);

    await expect(result).rejects.toMatchObject({
      status: 504,
      message: expect.stringContaining("server may have saved"),
    } satisfies Partial<ApiError>);
    expect(attempts).toBe(1);
    expect(receivedSignal?.aborted).toBe(true);
  });

  test("passes through an ordinary failed save without retrying", async () => {
    let attempts = 0;
    const failure = new ApiError(409, "Attendance changed");
    const put = <T>(): Promise<T> => {
      attempts += 1;
      return Promise.reject(failure);
    };

    const input = { records: [] } as unknown as SaveAttendanceInput;
    await expect(saveAttendanceWithTimeout("offering-1", "2026-09-21", input, 10, put)).rejects.toBe(failure);
    expect(attempts).toBe(1);
  });
});
