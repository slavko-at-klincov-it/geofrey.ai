import { runWizard } from "./wizard.js";
import { execa } from "execa";
import { askYesNo } from "./utils/prompt.js";
import { success, info } from "./utils/ui.js";
import { t } from "../i18n/index.js";

async function main() {
  const state = await runWizard();
  if (!state) {
    process.exit(1);
  }

  console.log("");
  success(t("onboarding.envCreated"));
  info(t("onboarding.indexHint"));

  const start = await askYesNo(`\n${t("onboarding.startNow")}`);
  if (start) {
    info(`${t("onboarding.starting")}\n`);
    await execa("pnpm", ["dev"], { stdio: "inherit" });
  } else {
    info(`${t("onboarding.startLater")}\n`);
  }
}

main().catch((err) => {
  if (err instanceof Error && err.message.includes("User force closed")) {
    console.log(`\n\n${t("onboarding.setupAborted")}\n`);
  } else {
    console.error(`\n${t("onboarding.error")}`, err);
  }
  process.exit(1);
});
