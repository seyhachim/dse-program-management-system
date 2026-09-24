import { describe, expect, test } from "bun:test";
import type { Request } from "express";
import type { AuthUser } from "./token.ts";
import { resolveRequestAuthOnce } from "./request-auth-cache.ts";

const user: AuthUser = {
  id: "user-1",
  email: "lecturer@example.test",
  roles: ["lecturer"],
  programmeRoles: [{ role: "lecturer", programmeId: "dse" }],
};

function freshRequest(): Request {
  return {} as Request;
}

describe("request-local auth resolution", () => {
  test("resolves once and reuses the same verified user on one Express request", async () => {
    const req = freshRequest();
    let resolutions = 0;

    const resolve = async () => {
      resolutions += 1;
      return user;
    };

    expect(await resolveRequestAuthOnce(req, resolve)).toEqual(user);
    expect(await resolveRequestAuthOnce(req, resolve)).toEqual(user);
    expect(resolutions).toBe(1);
    expect(req.user).toEqual(user);
  });

  test("never reuses identity verification across separate HTTP request objects", async () => {
    const first = freshRequest();
    const second = freshRequest();
    let resolutions = 0;

    const resolve = async () => {
      resolutions += 1;
      return user;
    };

    await resolveRequestAuthOnce(first, resolve);
    await resolveRequestAuthOnce(second, resolve);

    expect(resolutions).toBe(2);
  });

  test("does not cache a failed verification or password gate", async () => {
    const req = freshRequest();
    let resolutions = 0;

    await expect(
      resolveRequestAuthOnce(req, async () => {
        resolutions += 1;
        throw new Error("fail closed");
      }),
    ).rejects.toThrow("fail closed");

    expect(req.user).toBeUndefined();

    const recovered = await resolveRequestAuthOnce(req, async () => {
      resolutions += 1;
      return user;
    });

    expect(recovered).toEqual(user);
    expect(resolutions).toBe(2);
  });

  test("keeps the request-local marker out of enumerable request data", async () => {
    const req = freshRequest();
    await resolveRequestAuthOnce(req, async () => user);

    expect(Object.keys(req)).toEqual(["user"]);
    expect(JSON.stringify(req)).toContain('"user"');
    expect(JSON.stringify(req)).not.toContain("dse-pms-request-auth-user");
  });
});
