import { describe, expect, test } from "bun:test";
import type { RecheckAttendanceInput, SaveAttendanceInput } from "@dse-pms/shared-types";
import { ApiError } from "./api";
import {
  ATTENDANCE_SAVE_TIMEOUT_MS,
  ATTENDANCE_RECHECK_TIMEOUT_MS,
  recheckAttendanceWithTimeout,
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

describe("Check 2 recheck timeout", () => {
  const input = {
    studentId: "student-1",
    observation: { status: "Late", permissionPending: false, note: "" },
    final: { status: "Late", permissionPending: false, note: "" },
  } as RecheckAttendanceInput;

  test("limits a pending recheck to 65 seconds", () => {
    expect(ATTENDANCE_RECHECK_TIMEOUT_MS).toBe(65_000);
  });

  test("aborts once, warns about a possibly committed Check 2, and does not retry", async () => {
    let attempts = 0;
    let receivedSignal: AbortSignal | undefined;
    const post = <T>(_path: string, _body: unknown, signal?: AbortSignal): Promise<T> => {
      attempts += 1;
      receivedSignal = signal;
      return new Promise<T>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
          once: true,
        });
      });
    };

    await expect(recheckAttendanceWithTimeout("offering-1", "2026-11-19", input, 1, post))
      .rejects.toMatchObject({
        status: 504,
        message: expect.stringContaining("may have recorded Check 2"),
      } satisfies Partial<ApiError>);
    expect(attempts).toBe(1);
    expect(receivedSignal?.aborted).toBe(true);
  });

  test("propagates a duplicate-checkpoint conflict without another save attempt", async () => {
    let attempts = 0;
    const failure = new ApiError(409, "Check 2 has already been recorded");
    const post = <T>(): Promise<T> => {
      attempts += 1;
      return Promise.reject(failure);
    };
    await expect(recheckAttendanceWithTimeout("offering-1", "2026-11-19", input, 20, post))
      .rejects.toBe(failure);
    expect(attempts).toBe(1);
  });

  test("preserves an acknowledged attendance-session response", async () => {
    const session = { sessionId: "session-1", records: [] };
    let path = "";
    const post = <T>(requestPath: string): Promise<T> => {
      path = requestPath;
      return Promise.resolve(session as T);
    };
    await expect(recheckAttendanceWithTimeout("offering-1", "2026-11-19", input, 20, post))
      .resolves.toEqual(session);
    expect(path).toBe("/api/offerings/offering-1/attendance/2026-11-19/recheck");
  });
});
