import type { OmniClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "./prompts.js";
import { defaultRuntime } from "../runtime.js";

export interface BrowserConfig {
  enabled: boolean;
  headless?: boolean;
  noSandbox?: boolean;
}

/**
 * Prompt user to configure browser access
 */
export async function promptBrowserSetup(
  prompter: WizardPrompter,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<BrowserConfig> {
  const enabled = await prompter.confirm({
    message: "Enable browser automation?",
    initialValue: true,
  });

  if (enabled) {
    await prompter.note(
      [
        "Browser will run in headless mode with sandbox enabled.",
        "Security: sandbox protects against malicious websites.",
      ].join("\n"),
      "Browser",
    );
  }

  return {
    enabled,
    headless: enabled ? true : false,
    noSandbox: enabled ? false : false,
  };
}

/**
 * Apply browser configuration to omniclaw.json
 */
export function applyBrowserConfig(
  baseConfig: OmniClawConfig,
  browserConfig: BrowserConfig,
): OmniClawConfig {
  if (!browserConfig.enabled) {
    // Remove browser config if disabled, or set defaults
    return {
      ...baseConfig,
      browser: {
        enabled: false,
        headless: false,
        noSandbox: false,
      },
    };
  }

  return {
    ...baseConfig,
    browser: {
      enabled: true,
      headless: browserConfig.headless ?? true,
      noSandbox: browserConfig.noSandbox ?? false,
    },
  };
}
