/** Demo course evidence belongs in local development and CI databases by default. */
export function shouldSeedDemoOffering(
  databaseUrl: string | undefined,
  allowRemote: boolean,
): boolean {
  if (allowRemote) return true;
  if (!databaseUrl) return false;

  try {
    const host = new URL(databaseUrl).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}
