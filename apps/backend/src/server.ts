import { createApp } from "./core/app.ts";
import { validateAuthConfig } from "./core/config/auth.ts";
import { main as verifyStagingDatabase } from "../scripts/verify-staging-db.ts";
import { validateTelegramConfig } from "./plugins/telegram/config.ts";
import { verifyUatBrevoOnce } from "./uat/brevo-smoke.ts";

validateAuthConfig();
// Protect direct starts as well as the Render pre-migration guard.
// Neither staging-auth nor any app route can listen against an unmarked DB.
if (process.env.AUTH_MODE === "neon-staging") await verifyStagingDatabase();
validateTelegramConfig();
await verifyUatBrevoOnce();

const app = createApp();
const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`DSE-PMS backend listening on http://localhost:${port}`);
});
