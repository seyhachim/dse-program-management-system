import { createApp } from "./core/app.ts";
import { validateAuthConfig } from "./core/config/auth.ts";

validateAuthConfig();

const app = createApp();
const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`DSE-PMS backend listening on http://localhost:${port}`);
});
