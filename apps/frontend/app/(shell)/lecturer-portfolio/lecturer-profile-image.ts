export const CHIM_SEYHA_PROFILE_IMAGE = "/staff/chim-seyha.jpg";

const PROFILE_IMAGES_BY_EMAIL: Readonly<Record<string, string>> = {
  "chim.seyha@rupp.edu.kh": CHIM_SEYHA_PROFILE_IMAGE,
};

export function lecturerProfileImage(email: string | null | undefined): string | null {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return null;
  return PROFILE_IMAGES_BY_EMAIL[normalizedEmail] ?? null;
}
