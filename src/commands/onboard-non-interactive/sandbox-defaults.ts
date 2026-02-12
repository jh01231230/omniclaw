import type { OmniClawConfig } from "../../config/config.js";

/**
 * Non-interactive onboarding can't prompt, but we still want a safe baseline:
 * - Route exec via the sandbox by default.
 * - Default to sandboxing non-main sessions.
 * - Default to no sandbox networking unless the existing config already opted into host networking.
 */
export function applyNonInteractiveSandboxDefaults(nextConfig: OmniClawConfig): OmniClawConfig {
  const prevAgents = nextConfig.agents;
  const prevDefaults = prevAgents?.defaults;
  const prevSandbox = prevDefaults?.sandbox;
  const prevDocker = prevSandbox?.docker;

  const prevMode = prevSandbox?.mode;
  const prevNetwork = prevDocker?.network?.trim().toLowerCase();

  const sandboxMode = prevMode === "all" ? "all" : "non-main";
  const dockerNetwork = sandboxMode === "all" ? "none" : prevNetwork === "host" ? "host" : "none";

  return {
    ...nextConfig,
    tools: {
      ...nextConfig.tools,
      exec: {
        ...nextConfig.tools?.exec,
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
}
