import { runWizard } from "./wizard.js";
import { execa } from "execa";
import { askYesNo } from "./utils/prompt.js";
import { success, info } from "./utils/ui.js";

async function main() {
  const state = await runWizard();
  if (!state) {
    process.exit(1);
  }

  console.log("");
  success(".env wurde erstellt");

  const start = await askYesNo("\nSoll ich geofrey.ai jetzt starten?");
  if (start) {
    info("Starte geofrey.ai...\n");
    await execa("pnpm", ["dev"], { stdio: "inherit" });
  } else {
    info("Starte später mit: pnpm dev\n");
  }
}

main().catch((err) => {
  if (err instanceof Error && err.message.includes("User force closed")) {
    console.log("\n\nSetup abgebrochen.\n");
  } else {
    console.error("\nFehler:", err);
  }
  process.exit(1);
});
