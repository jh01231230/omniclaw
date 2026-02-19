/**
 * Onboarding step for sudo/root password policy.
 * Lets the user choose: never, consent (ask in chat each time), or always (use stored password without asking).
 */

import type { OmniClawConfig } from "../config/config.js";
import type { WizardPrompter } from "./prompts.js";
import {
  writeSudoCredentials,
  clearSudoCredentials,
  type SudoMode,
} from "../infra/sudo-credentials.js";

export async function applyOnboardingSudoSelection(params: {
  nextConfig: OmniClawConfig;
  prompter: WizardPrompter;
}): Promise<OmniClawConfig> {
  const { prompter } = params;

  const options: Array<{
    value: SudoMode | "skip";
    label: string;
    hint: string;
  }> = [
    {
      value: "skip",
      label: "Skip (configure later)",
      hint: "Leave tools.sudo unset. You can set it later via omniclaw configure or by editing config.",
    },
    {
      value: "never",
      label: "Never allow sudo",
      hint: "Do not store or use root/sudo password. Commands needing elevation will fail.",
    },
    {
      value: "consent",
      label: "Use only with strict consent",
      hint: "Store password; use only after you explicitly approve each sudo use in chat.",
    },
    {
      value: "always",
      label: "Always allow (use without asking)",
      hint: "Store password; use automatically when commands need sudo. No per-use prompt.",
    },
  ];

  const existing = params.nextConfig.tools?.sudo?.mode as SudoMode | undefined;
  const choice = await prompter.select<SudoMode | "skip">({
    message: "Sudo/root password policy",
    options,
    initialValue: existing ?? "skip",
  });

  if (choice === "skip") {
    return params.nextConfig;
  }
  if (choice === "never") {
    clearSudoCredentials();
    return {
      ...params.nextConfig,
      tools: {
        ...params.nextConfig.tools,
        sudo: { mode: "never" },
      },
    };
  }

  const password = await prompter.text({
    message: "Enter your sudo password (stored under ~/.omniclaw/credentials; chmod 600)",
    placeholder: "••••••••",
    validate: (v) => (v.trim().length > 0 ? undefined : "Password is required"),
  });

  writeSudoCredentials({ mode: choice, password: password.trim() });

  await prompter.note(
    [
      `tools.sudo.mode: ${choice}`,
      "",
      choice === "consent"
        ? "When a command needs sudo, OmniClaw will ask for your approval in the chat before using the stored password."
        : "When a command needs sudo, OmniClaw will use the stored password automatically.",
      "",
      "To change later: omniclaw onboard (or edit tools.sudo and ~/.omniclaw/credentials/sudo.json)",
    ].join("\n"),
    "Sudo policy",
  );

  return {
    ...params.nextConfig,
    tools: {
      ...params.nextConfig.tools,
      sudo: { mode: choice },
    },
  };
}
