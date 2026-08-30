export type QueryUxState =
  | "cold-loading"
  | "hard-error"
  | "ready"
  | "refreshing"
  | "refresh-error";

export interface QueryUxStateInput {
  hasData: boolean;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
}

/**
 * Keeps cold loading, hard failure, populated, background-refresh, and
 * background-refresh failure states explicit. Empty arrays still count as
 * usable data when callers pass `hasData: data !== undefined`.
 */
export function getQueryUxState(input: QueryUxStateInput): QueryUxState {
  if (!input.hasData) {
    return input.isError ? "hard-error" : "cold-loading";
  }
  if (input.isError) return "refresh-error";
  if (input.isFetching) return "refreshing";
  return "ready";
}
