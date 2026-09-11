import type { StudentProfileInput } from "@dse-pms/shared-types";

export type StudentLatinNameProfile = Pick<
  StudentProfileInput,
  "latinFamilyName" | "latinGivenName"
>;

export function normalizeNameWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeUniformCaseSegment(segment: string): string {
  const letters = segment.match(/\p{L}/gu)?.join("") ?? "";
  if (!letters) return segment;

  const isAllUpper = letters === letters.toLocaleUpperCase();
  const isAllLower = letters === letters.toLocaleLowerCase();
  if (!isAllUpper && !isAllLower) return segment;

  const lower = segment.toLocaleLowerCase();
  return lower.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase());
}

function normalizeLatinWord(word: string): string {
  return word
    .split(/([-’'])/u)
    .map((segment) => (segment === "-" || segment === "’" || segment === "'" ? segment : normalizeUniformCaseSegment(segment)))
    .join("");
}

export function normalizeLatinNamePart(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = normalizeNameWhitespace(value);
  if (!normalized) return null;
  return normalized.split(" ").map(normalizeLatinWord).join(" ");
}

export function normalizeStudentProfileNameFields<T extends StudentProfileInput | undefined>(
  profile: T,
): T {
  if (!profile) return profile;
  return {
    ...profile,
    ...(Object.prototype.hasOwnProperty.call(profile, "latinFamilyName")
      ? { latinFamilyName: normalizeLatinNamePart(profile.latinFamilyName) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(profile, "latinGivenName")
      ? { latinGivenName: normalizeLatinNamePart(profile.latinGivenName) }
      : {}),
  } as T;
}

export function canonicalStudentDisplayName(
  profile: StudentLatinNameProfile | null | undefined,
  fallbackName: string,
): string {
  const familyName = normalizeLatinNamePart(profile?.latinFamilyName);
  const givenName = normalizeLatinNamePart(profile?.latinGivenName);
  if (familyName && givenName) return `${familyName} ${givenName}`;
  return normalizeNameWhitespace(fallbackName);
}
