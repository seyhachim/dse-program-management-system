import { describe, expect, test } from "bun:test";
import { getQueryUxState } from "./query-ux-state";

describe("getQueryUxState", () => {
  test("distinguishes cold loading from populated refresh", () => {
    expect(
      getQueryUxState({
        hasData: false,
        isPending: true,
        isFetching: true,
        isError: false,
      }),
    ).toBe("cold-loading");
    expect(
      getQueryUxState({
        hasData: true,
        isPending: false,
        isFetching: true,
        isError: false,
      }),
    ).toBe("refreshing");
  });

  test("keeps refresh failures distinct from hard failures", () => {
    expect(
      getQueryUxState({
        hasData: false,
        isPending: false,
        isFetching: false,
        isError: true,
      }),
    ).toBe("hard-error");
    expect(
      getQueryUxState({
        hasData: true,
        isPending: false,
        isFetching: false,
        isError: true,
      }),
    ).toBe("refresh-error");
  });

  test("treats an already-loaded empty collection as ready data", () => {
    expect(
      getQueryUxState({
        hasData: true,
        isPending: false,
        isFetching: false,
        isError: false,
      }),
    ).toBe("ready");
  });
});
