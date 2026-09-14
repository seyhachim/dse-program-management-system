export interface StudentRosterOrderProfile {
  khmerFamilyName: string | null;
  khmerGivenName: string | null;
  latinFamilyName: string | null;
  latinGivenName: string | null;
}

export interface StudentRosterOrderRow {
  id: string;
  name: string;
  profile: StudentRosterOrderProfile | null;
}

const khmerCollator = new Intl.Collator("km-KH", {
  usage: "sort",
  sensitivity: "base",
});

const latinCollator = new Intl.Collator("en", {
  usage: "sort",
  sensitivity: "base",
});

function normalizedSortText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFC")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function compareOptionalText(
  left: string,
  right: string,
  collator: Intl.Collator,
): number {
  if (left && !right) return -1;
  if (!left && right) return 1;
  if (!left && !right) return 0;
  return collator.compare(left, right);
}

export function compareStudentRosterRows(
  left: StudentRosterOrderRow,
  right: StudentRosterOrderRow,
): number {
  const leftKhmerFamily = normalizedSortText(left.profile?.khmerFamilyName);
  const rightKhmerFamily = normalizedSortText(right.profile?.khmerFamilyName);
  const leftKhmerGiven = normalizedSortText(left.profile?.khmerGivenName);
  const rightKhmerGiven = normalizedSortText(right.profile?.khmerGivenName);
  const leftHasKhmer = Boolean(leftKhmerFamily || leftKhmerGiven);
  const rightHasKhmer = Boolean(rightKhmerFamily || rightKhmerGiven);

  if (leftHasKhmer !== rightHasKhmer) return leftHasKhmer ? -1 : 1;

  if (leftHasKhmer && rightHasKhmer) {
    const familyOrder = compareOptionalText(
      leftKhmerFamily,
      rightKhmerFamily,
      khmerCollator,
    );
    if (familyOrder !== 0) return familyOrder;

    const givenOrder = compareOptionalText(
      leftKhmerGiven,
      rightKhmerGiven,
      khmerCollator,
    );
    if (givenOrder !== 0) return givenOrder;
  }

  const latinFamilyOrder = compareOptionalText(
    normalizedSortText(left.profile?.latinFamilyName),
    normalizedSortText(right.profile?.latinFamilyName),
    latinCollator,
  );
  if (latinFamilyOrder !== 0) return latinFamilyOrder;

  const latinGivenOrder = compareOptionalText(
    normalizedSortText(left.profile?.latinGivenName),
    normalizedSortText(right.profile?.latinGivenName),
    latinCollator,
  );
  if (latinGivenOrder !== 0) return latinGivenOrder;

  const displayNameOrder = latinCollator.compare(
    normalizedSortText(left.name),
    normalizedSortText(right.name),
  );
  if (displayNameOrder !== 0) return displayNameOrder;

  return left.id.localeCompare(right.id);
}

export function sortStudentRosterRows<T extends StudentRosterOrderRow>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(compareStudentRosterRows);
}

export class StudentRosterCursorNotFoundError extends Error {}

export function pageStudentRosterRows<T extends StudentRosterOrderRow>(
  rows: readonly T[],
  limit: number,
  cursorId: string | null,
): { items: T[]; hasNextPage: boolean } {
  const ordered = sortStudentRosterRows(rows);
  let startIndex = 0;

  if (cursorId) {
    const cursorIndex = ordered.findIndex((row) => row.id === cursorId);
    if (cursorIndex < 0) {
      throw new StudentRosterCursorNotFoundError("Student roster cursor is no longer valid");
    }
    startIndex = cursorIndex + 1;
  }

  const window = ordered.slice(startIndex, startIndex + limit + 1);
  return {
    items: window.slice(0, limit),
    hasNextPage: window.length > limit,
  };
}
