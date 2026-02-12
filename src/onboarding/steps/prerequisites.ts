import { execa } from "execa";
import { platform } from "node:os";
import { stepHeader, success, warn, fail, info, spinner } from "../utils/ui.js";
import { askYesNo } from "../utils/prompt.js";
import { validateOllamaConnection } from "../utils/validate.js";
import { t } from "../../i18n/index.js";

export interface PrerequisiteResult {
  nodeOk: boolean;
  pnpmOk: boolean;
  ollamaOk: boolean;
  modelLoaded: boolean;
  claudeCliOk: boolean;
}

export async function runPrerequisites(model = "qwen3:8b", ollamaUrl = "http://localhost:11434"): Promise<PrerequisiteResult> {
  stepHeader(0, t("onboarding.prereqTitle"));

  const result: PrerequisiteResult = {
    nodeOk: false,
    pnpmOk: false,
    ollamaOk: false,
    modelLoaded: false,
    claudeCliOk: false,
  };

  // 1. Node.js
  const nodeVersion = parseInt(process.version.slice(1), 10);
  if (nodeVersion >= 22) {
    success(`Node.js ${process.version}`);
    result.nodeOk = true;
  } else {
    fail(t("onboarding.nodeVersionFail", { version: process.version }));
    info("→ nvm install 22");
    return result;
  }

  // 2. pnpm
  try {
    const { stdout } = await execa("pnpm", ["--version"]);
    success(`pnpm ${stdout.trim()}`);
    result.pnpmOk = true;
  } catch {
    warn(t("onboarding.pnpmNotFound"));
    info("→ npm install -g pnpm");
  }

  // 3. Ollama
  let ollamaStatus = await validateOllamaConnection(ollamaUrl);
  if (ollamaStatus.connected) {
    success(t("onboarding.ollamaRunning", { url: ollamaUrl }));
    result.ollamaOk = true;
  } else {
    warn(t("onboarding.ollamaNotReachable"));
    const startOllama = await askYesNo(`→ ${t("onboarding.ollamaStart")}`);
    if (startOllama) {
      try {
        if (platform() === "win32") {
          const child = execa("cmd", ["/c", "start", "/b", "ollama", "serve"], { stdio: "ignore" });
          child.unref();
        } else {
          const child = execa("ollama", ["serve"], { detached: true, stdio: "ignore" });
          child.unref();
        }
        const spin = spinner(t("onboarding.ollamaStarting"));
        await new Promise((r) => setTimeout(r, 3000));
        ollamaStatus = await validateOllamaConnection(ollamaUrl);
        if (ollamaStatus.connected) {
          spin.succeed(t("onboarding.ollamaStarted"));
          result.ollamaOk = true;
        } else {
          spin.fail(t("onboarding.ollamaStartFailed"));
          info(`→ ${t("onboarding.ollamaStartManual")}`);
        }
      } catch {
        fail(t("onboarding.ollamaStartError"));
        info(`→ ${t("onboarding.ollamaInstallHint")}`);
      }
    }
  }

  // 4. Model check
  if (result.ollamaOk) {
    if (ollamaStatus.models.some((m) => m.startsWith(model.split(":")[0]))) {
      success(t("onboarding.modelLoaded", { model }));
      result.modelLoaded = true;
    } else {
      warn(t("onboarding.modelNotLoaded", { model }));
      const pullModel = await askYesNo(`→ ${t("onboarding.modelDownload")}`);
      if (pullModel) {
        const spin = spinner(t("onboarding.modelDownloading", { model }));
        try {
          await execa("ollama", ["pull", model], { timeout: 600_000 });
          spin.succeed(t("onboarding.modelLoaded", { model }));
          result.modelLoaded = true;
        } catch {
          spin.fail(t("onboarding.modelDownloadFailed", { model }));
        }
      }
    }
  }

  // 5. Claude Code CLI
  try {
    const { stdout } = await execa("claude", ["--version"]);
    success(t("onboarding.claudeCliFound", { version: stdout.trim() }));
    result.claudeCliOk = true;
  } catch {
    warn(t("onboarding.claudeCliNotFound"));
    const install = await askYesNo(`→ ${t("onboarding.claudeCliInstall")}`);
    if (install) {
      const spin = spinner(t("onboarding.claudeCliInstalling"));
      try {
        await execa("npm", ["install", "-g", "@anthropic-ai/claude-code"], { timeout: 120_000 });
        spin.succeed(t("onboarding.claudeCliInstalled"));
        result.claudeCliOk = true;
      } catch {
        spin.fail(t("onboarding.claudeCliInstallFailed"));
        info("→ npm install -g @anthropic-ai/claude-code");
      }
    }
  }

  return result;
}
