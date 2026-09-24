import { createApp } from "./core/app.ts";
import { validateAuthConfig } from "./core/config/auth.ts";
import { validateTelegramConfig } from "./plugins/telegram/config.ts";

validateAuthConfig();
validateTelegramConfig();

const app = createApp();
const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`DSE-PMS backend listening on http://localhost:${port}`);
  if (process.env.AUTH_UAT_1141 === "1") {
    void import("../scripts/uat-auth-1141-google.ts")
      .then(({ runGoogle1141HostedUat }) => runGoogle1141HostedUat())
      .catch((error) => {
        // UAT logs never print tokens, passwords, emails, UIDs, or provider IDs.
        // eslint-disable-next-line no-console
        console.error("[uat-1141] FAIL", error instanceof Error ? error.message : "unknown");
        process.exitCode = 1;
        setTimeout(() => process.exit(1), 250).unref();
      });
  }
});
