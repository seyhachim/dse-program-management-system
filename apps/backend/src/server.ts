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
  void import("../scripts/portal-profile-diagnostic.ts")
    .then(({ runPortalProfileDiagnostic }) => runPortalProfileDiagnostic())
    .catch((error) => console.error("[portal-profile-diagnostic] boot FAIL", error instanceof Error ? error.message : "unknown"));
});
