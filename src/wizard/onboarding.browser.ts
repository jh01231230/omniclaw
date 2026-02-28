import fs from "node:fs";
import type { OmniClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "./prompts.js";
import { runCommandWithTimeout } from "../process/exec.js";
import { defaultRuntime } from "../runtime.js";

export interface BrowserConfig {
  enabled: boolean;
  headless?: boolean;
  noSandbox?: boolean;
  executablePath?: string;
}

export interface PromptBrowserSetupOptions {
  enabled?: boolean;
  nonInteractive?: boolean;
  autoInstallChromium?: boolean;
}

async function detectPlaywrightChromiumExecutable(): Promise<string | null> {
  try {
    const playwrightModuleName = "playwright";
    const mod = (await import(playwrightModuleName)) as {
      chromium?: { executablePath?: () => string };
    };
    const executablePath = mod.chromium?.executablePath?.();
    if (!executablePath) {
      return null;
    }
    return fs.existsSync(executablePath) ? executablePath : null;
  } catch {
    return null;
  }
}

async function installPlaywrightChromium(runtime: RuntimeEnv): Promise<boolean> {
  const attempts: string[][] = [
    ["npx", "--yes", "playwright", "install", "chromium"],
    ["pnpm", "exec", "playwright", "install", "chromium"],
  ];
  for (const argv of attempts) {
    try {
      const result = await runCommandWithTimeout(argv, {
        timeoutMs: 30 * 60_000,
      });
      if (result.code === 0) {
        return true;
      }
      runtime.log(
        `[browser] Failed: ${argv.join(" ")} (${
          result.stderr.trim() || result.stdout.trim() || "no output"
        })`,
      );
    } catch (error) {
      runtime.log(`[browser] Failed: ${argv.join(" ")} (${String(error)})`);
    }
  }
  return false;
}

async function ensurePlaywrightChromium(params: {
  runtime: RuntimeEnv;
  prompter: WizardPrompter;
  nonInteractive?: boolean;
  autoInstallChromium?: boolean;
}): Promise<string | undefined> {
  const existing = await detectPlaywrightChromiumExecutable();
  if (existing) {
    return existing;
  }

  const shouldInstall =
    params.autoInstallChromium === false
      ? false
      : params.nonInteractive
        ? true
        : await params.prompter.confirm({
            message: "Install Playwright bundled Chromium now?",
            initialValue: true,
          });
  if (!shouldInstall) {
    return undefined;
  }

  await params.prompter.note(
    "Installing Playwright Chromium (embedded headless browser).",
    "Browser",
  );
  const installed = await installPlaywrightChromium(params.runtime);
  if (!installed) {
    await params.prompter.note(
      "Could not install Playwright Chromium automatically. Browser will fall back to system Chrome/Chromium if available.",
      "Browser",
    );
    return undefined;
  }

  const detected = await detectPlaywrightChromiumExecutable();
  if (!detected) {
    await params.prompter.note(
      "Playwright install completed, but Chromium executable was not detected. Browser will fall back to system Chrome/Chromium.",
      "Browser",
    );
    return undefined;
  }
  return detected;
}

export async function promptBrowserSetup(
  prompter: WizardPrompter,
  runtime: RuntimeEnv = defaultRuntime,
  options?: PromptBrowserSetupOptions,
): Promise<BrowserConfig> {
  const enabled =
    options?.enabled ??
    (await prompter.confirm({
      message: "Enable browser automation?",
      initialValue: true,
    }));

  if (!enabled) {
    return {
      enabled: false,
      headless: false,
      noSandbox: false,
    };
  }

  const executablePath = await ensurePlaywrightChromium({
    runtime,
    prompter,
    nonInteractive: options?.nonInteractive,
    autoInstallChromium: options?.autoInstallChromium,
  });

  await prompter.note(
    [
      "Browser automation enabled.",
      "Mode: headless.",
      executablePath
        ? `Using Playwright Chromium: ${executablePath}`
        : "Using system Chrome/Chromium fallback.",
    ].join("\n"),
    "Browser",
  );

  return {
    enabled: true,
    headless: true,
    noSandbox: false,
    executablePath,
  };
}

export function applyBrowserConfig(
  baseConfig: OmniClawConfig,
  browserConfig: BrowserConfig,
): OmniClawConfig {
  if (!browserConfig.enabled) {
    return {
      ...baseConfig,
      browser: {
        enabled: false,
        headless: false,
        noSandbox: false,
      },
    };
  }

  const prevAgents = baseConfig.agents;
  const prevDefaults = prevAgents?.defaults;
  const prevSandbox = prevDefaults?.sandbox;
  const prevSandboxBrowser = prevSandbox?.browser;

  return {
    ...baseConfig,
    browser: {
      enabled: true,
      headless: browserConfig.headless ?? true,
      noSandbox: browserConfig.noSandbox ?? false,
      executablePath: browserConfig.executablePath,
    },
    agents: {
      ...prevAgents,
      defaults: {
        ...prevDefaults,
        sandbox: {
          ...prevSandbox,
          browser: {
            ...prevSandboxBrowser,
            // Keep sandbox sessions able to target host browser unless explicitly denied later.
            allowHostControl: prevSandboxBrowser?.allowHostControl ?? true,
          },
        },
      },
    },
  };
}
