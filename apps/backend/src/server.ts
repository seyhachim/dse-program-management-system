import { createApp } from "./core/app.ts";
import { validateAuthConfig } from "./core/config/auth.ts";
import { validateTelegramConfig } from "./plugins/telegram/config.ts";
import { runAuth1143HostedUat } from "../scripts/uat-auth-1143-hosted.ts";

validateAuthConfig();
validateTelegramConfig();

const app = createApp();
const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`DSE-PMS backend listening on http://localhost:${port}`);
  void runAuth1143HostedUat().catch((error) => {
    // No credentials, tokens, emails, or PII are logged by this harness.
    // eslint-disable-next-line no-console
    console.error("[uat-1143] FAIL", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
});
