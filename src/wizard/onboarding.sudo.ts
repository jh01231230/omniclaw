/**
 * Onboarding step for sudo policy and authentication backend.
 * Lets the user choose: never, consent (ask in chat each time), or always.
 */

import type { OmniClawConfig } from "../config/config.js";
import type { WizardPrompter } from "./prompts.js";
import {
  writeSudoCredentials,
  clearSudoCredentials,
  type SudoMode,
} from "../infra/sudo-credentials.js";

function parseAllowPatterns(input: string): string[] | undefined {
  const parts = input
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  return Array.from(new Set(parts));
}

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
      hint: "Use sudo only after you explicitly approve each request in chat.",
    },
    {
      value: "always",
      label: "Always allow (use without asking)",
      hint: "Use sudo automatically when commands need elevation. No per-use prompt.",
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

  const existingAuth = params.nextConfig.tools?.sudo?.auth === "nopasswd" ? "nopasswd" : "password";
  const auth = await prompter.select<"password" | "nopasswd">({
    message: "How should OmniClaw authenticate sudo?",
    options: [
      {
        value: "password",
        label: "Stored password (sudo -S)",
        hint: "Uses ~/.omniclaw/credentials/sudo.json and works without NOPASSWD sudoers.",
      },
      {
        value: "nopasswd",
        label: "NOPASSWD sudoers rule (sudo -n)",
        hint: "No stored password. Requires a matching NOPASSWD rule in /etc/sudoers.d.",
      },
    ],
    initialValue: existingAuth,
  });

  let password: string | undefined;
  if (auth === "password") {
    password = await prompter.text({
      message: "Enter your sudo password (stored under ~/.omniclaw/credentials; chmod 600)",
      placeholder: "••••••••",
      validate: (v) => (v.trim().length > 0 ? undefined : "Password is required"),
    });
    writeSudoCredentials({ mode: choice, password: password.trim() });
  } else {
    writeSudoCredentials({ mode: choice });
  }

  const existingAllow = params.nextConfig.tools?.sudo?.allow ?? [];
  const allowInput = await prompter.text({
    message: "Optional sudo allowlist patterns (comma/newline separated; blank = allow any)",
    placeholder: "systemctl restart omniclaw-gateway.service",
    initialValue: existingAllow.length > 0 ? existingAllow.join(", ") : undefined,
  });
  const allow = parseAllowPatterns(String(allowInput ?? ""));

  await prompter.note(
    [
      `tools.sudo.mode: ${choice}`,
      `tools.sudo.auth: ${auth}`,
      `tools.sudo.allow: ${allow && allow.length > 0 ? allow.join(", ") : "(any elevated command)"}`,
      "",
      choice === "consent"
        ? auth === "password"
          ? "When a command needs sudo, OmniClaw will ask for your approval in chat before using the stored password."
          : "When a command needs sudo, OmniClaw will ask for your approval in chat and then run sudo -n (NOPASSWD)."
        : "When a command needs sudo, OmniClaw will run with your configured sudo auth mode automatically.",
      "",
      "To change later: omniclaw onboard (or edit tools.sudo and ~/.omniclaw/credentials/sudo.json)",
    ].join("\n"),
    "Sudo policy",
  );

  return {
    ...params.nextConfig,
    tools: {
      ...params.nextConfig.tools,
      sudo: {
        mode: choice,
        auth,
        ...(allow && allow.length > 0 ? { allow } : {}),
      },
    },
  };
}
