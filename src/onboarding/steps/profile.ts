import { askText, askChoice, askYesNo } from "../utils/prompt.js";
import { t } from "../../i18n/index.js";
import { stepHeader } from "../utils/ui.js";

export interface ProfileResult {
  name: string;
  timezone: string;
  workDirectory?: string;
  communicationStyle: "formal" | "casual" | "mixed";
  interests: string[];
}

export async function runProfileStep(): Promise<ProfileResult> {
  stepHeader(5, t("onboarding.profile.title"));

  const name = await askText(t("onboarding.profile.name"));

  // Auto-detect timezone
  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzOk = await askYesNo(t("onboarding.profile.timezone.confirm", { timezone: detectedTz }));
  const timezone = tzOk ? detectedTz : await askText(t("onboarding.profile.timezone.enter"));

  // Work directory — scan common paths
  const homedir = (await import("node:os")).homedir();
  const { existsSync } = await import("node:fs");
  const candidates = ["Code", "Projects", "Developer", "Documents"]
    .map((d) => `${homedir}/${d}`)
    .filter((p) => existsSync(p));

  let workDirectory: string | undefined;
  if (candidates.length > 0) {
    const choices = [
      ...candidates.map((p) => ({ name: p.replace(homedir, "~"), value: p })),
      { name: t("onboarding.profile.workdir.custom"), value: "__custom__" },
    ];
    const picked = await askChoice(t("onboarding.profile.workdir"), choices);
    if (picked === "__custom__") {
      workDirectory = await askText(t("onboarding.profile.workdir"));
    } else {
      workDirectory = picked;
    }
  }

  // Communication style
  const communicationStyle = await askChoice<"formal" | "casual" | "mixed">(
    t("onboarding.profile.style"),
    [
      { name: t("onboarding.profile.style.formal"), value: "formal" as const },
      { name: t("onboarding.profile.style.casual"), value: "casual" as const },
      { name: t("onboarding.profile.style.mixed"), value: "mixed" as const },
    ],
  );

  // Interests
  const interestsRaw = await askText(t("onboarding.profile.interests"), "");
  const interests = interestsRaw
    ? interestsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  return { name, timezone, workDirectory, communicationStyle, interests };
}
