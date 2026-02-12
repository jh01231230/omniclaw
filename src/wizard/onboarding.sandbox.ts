import type { OmniClawConfig } from "../config/config.js";
import type { WizardPrompter } from "./prompts.js";

type SandboxOnboardingChoice = "non-main" | "host-network" | "all";

function resolveInitialChoice(cfg: OmniClawConfig): SandboxOnboardingChoice {
  const sandbox = cfg.agents?.defaults?.sandbox;
  const mode = sandbox?.mode;
  const network = sandbox?.docker?.network?.trim().toLowerCase();

  if (mode === "all") {
    return "all";
  }
  if (network === "host") {
    return "host-network";
  }
  return "non-main";
}

export async function applyOnboardingSandboxSelection(params: {
  nextConfig: OmniClawConfig;
  prompter: WizardPrompter;
}): Promise<OmniClawConfig> {
  const { prompter } = params;

  const options: Array<{
    value: SandboxOnboardingChoice;
    label: string;
    hint: string;
  }> = [
    {
      value: "non-main",
      label: "Sandbox non-main sessions (recommended)",
      hint: 'Sets agents.defaults.sandbox.mode="non-main" (main runs direct; groups/channels sandboxed).',
    },
    ...(process.platform === "linux"
      ? [
          {
            value: "host-network" as const,
            label: "Sandbox non-main + host networking (Linux)",
            hint: 'Sets agents.defaults.sandbox.mode="non-main" + agents.defaults.sandbox.docker.network="host" (less isolated; sandbox can reach the Gateway).',
          },
        ]
      : []),
    {
      value: "all",
      label: "Sandbox all sessions",
      hint: 'Sets agents.defaults.sandbox.mode="all" (most isolated; to run host commands later, use elevated exec gates).',
    },
  ];

  const choice = await prompter.select<SandboxOnboardingChoice>({
    message: "Sandbox defaults",
    options,
    initialValue: resolveInitialChoice(params.nextConfig),
  });

  const dockerNetwork = choice === "host-network" ? "host" : "none";
  const sandboxMode = choice === "all" ? "all" : "non-main";

  const prevAgents = params.nextConfig.agents;
  const prevDefaults = prevAgents?.defaults;
  const prevSandbox = prevDefaults?.sandbox;
  const prevDocker = prevSandbox?.docker;

  const nextConfig: OmniClawConfig = {
    ...params.nextConfig,
    tools: {
      ...params.nextConfig.tools,
      exec: {
        ...params.nextConfig.tools?.exec,
        // Security hardening: keep exec routed to the sandbox by default.
        host: "sandbox",
      },
    },
    agents: {
      ...prevAgents,
      defaults: {
        ...prevDefaults,
        sandbox: {
          ...prevSandbox,
          mode: sandboxMode,
          docker: {
            ...prevDocker,
            network: dockerNetwork,
          },
        },
      },
    },
  };

  // Best-effort informational note (does not block onboarding).
  await params.prompter.note(
    [
      `tools.exec.host: sandbox (enforced)`,
      `agents.defaults.sandbox.mode: ${sandboxMode}`,
      `agents.defaults.sandbox.docker.network: ${dockerNetwork}`,
      "",
      "Tip: if a task needs host-only access, use your main session (non-main mode) or configure elevated exec.",
    ].join("\n"),
    "Sandbox",
  );

  return nextConfig;
}
