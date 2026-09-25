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
  if (process.env.AUTH_UAT_1141_BROWSER_APPROVE === "1") {
    void import("../scripts/uat-auth-1141-browser-approve.ts")
      .then(({ runBrowserApprovalUat }) => runBrowserApprovalUat())
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error("[uat-1141-browser] FAIL", error instanceof Error ? error.message : "unknown");
        process.exitCode = 1;
      });
  }
});
