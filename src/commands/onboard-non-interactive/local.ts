import type { OmniClawConfig } from "../../config/config.js";
import type { RuntimeEnv } from "../../runtime.js";
import type { OnboardOptions } from "../onboard-types.js";
import { formatCliCommand } from "../../cli/command-format.js";
import { resolveGatewayPort, writeConfigFile } from "../../config/config.js";
import { logConfigUpdated } from "../../config/logging.js";
import { DEFAULT_GATEWAY_DAEMON_RUNTIME } from "../daemon-runtime.js";
import { healthCommand } from "../health.js";
import {
  applyWizardMetadata,
  DEFAULT_WORKSPACE,
  ensureWorkspaceAndSessions,
  resolveControlUiLinks,
  waitForGatewayReachable,
} from "../onboard-helpers.js";
import { applyNonInteractiveAuthChoice } from "./local/auth-choice.js";
import { installGatewayDaemonNonInteractive } from "./local/daemon-install.js";
import { applyNonInteractiveGatewayConfig } from "./local/gateway-config.js";
import { logNonInteractiveOnboardingJson } from "./local/output.js";
import { applyNonInteractiveSkillsConfig } from "./local/skills-config.js";
import { resolveNonInteractiveWorkspaceDir } from "./local/workspace.js";
import { applyNonInteractiveSandboxDefaults } from "./sandbox-defaults.js";
import {
  applyMemoryDeploymentConfig,
  autoInstallMemoryServices,
  type MemoryDeploymentConfig,
} from "../../wizard/onboarding.memory.js";
import { ensureMemoryDir } from "../onboard-helpers.js";

export async function runNonInteractiveOnboardingLocal(params: {
  opts: OnboardOptions;
  runtime: RuntimeEnv;
  baseConfig: OmniClawConfig;
}) {
  const { opts, runtime, baseConfig } = params;
  const mode = "local" as const;

  const workspaceDir = resolveNonInteractiveWorkspaceDir({
    opts,
    baseConfig,
    defaultWorkspaceDir: DEFAULT_WORKSPACE,
  });

  let nextConfig: OmniClawConfig = {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        workspace: workspaceDir,
      },
    },
    gateway: {
      ...baseConfig.gateway,
      mode: "local",
    },
  };

  nextConfig = applyNonInteractiveSandboxDefaults(nextConfig);

  const authChoice = opts.authChoice ?? "skip";
  const nextConfigAfterAuth = await applyNonInteractiveAuthChoice({
    nextConfig,
    authChoice,
    opts,
    runtime,
    baseConfig,
  });
  if (!nextConfigAfterAuth) {
    return;
  }
  nextConfig = nextConfigAfterAuth;

  const gatewayBasePort = resolveGatewayPort(baseConfig);
  const gatewayResult = applyNonInteractiveGatewayConfig({
    nextConfig,
    opts,
    runtime,
    defaultPort: gatewayBasePort,
  });
  if (!gatewayResult) {
    return;
  }
  nextConfig = gatewayResult.nextConfig;

  nextConfig = applyNonInteractiveSkillsConfig({ nextConfig, opts, runtime });

  // Setup memory deployment (minimal vs full PostgreSQL)
  if (!opts.skipMemory) {
    const memoryMode = opts.memoryMode ?? "minimal";
    const memoryConfig: MemoryDeploymentConfig = { type: memoryMode };

    if (memoryMode === "full") {
      if (opts.autoInstallMemory && opts.memoryPath) {
        // Auto-install memory services
        try {
          runtime.log(`Auto-installing memory services to: ${opts.memoryPath}`);
          const installResult = await autoInstallMemoryServices(
            opts.memoryPath,
            { confirm: async () => true, note: async () => {} } as any,
            runtime,
          );
          memoryConfig.postgresql = installResult.postgresql;
          memoryConfig.autoInstall = true;
        } catch (err) {
          runtime.error(`Auto-install failed: ${err}, falling back to minimal mode`);
          memoryConfig.type = "minimal";
        }
      } else {
        // Use default PostgreSQL config
        memoryConfig.postgresql = {
          host: "localhost",
          port: 5432,
          database: "openclaw_memory",
          user: "postgres",
          password: "",
          installPath: "/media/tars/TARS_MEMORY/postgresql-installed",
          dataPath: "/media/tars/TARS_MEMORY/postgresql/data",
          autoStart: true,
        };
      }
    }

    nextConfig = applyMemoryDeploymentConfig(nextConfig, memoryConfig);

    // Create memory directory for minimal deployment
    if (memoryConfig.type === "minimal") {
      await ensureMemoryDir(runtime);
    }
  }

  nextConfig = applyWizardMetadata(nextConfig, { command: "onboard", mode });
  await writeConfigFile(nextConfig);
  logConfigUpdated(runtime);

  await ensureWorkspaceAndSessions(workspaceDir, runtime, {
    skipBootstrap: Boolean(nextConfig.agents?.defaults?.skipBootstrap),
  });

  await installGatewayDaemonNonInteractive({
    nextConfig,
    opts,
    runtime,
    port: gatewayResult.port,
    gatewayToken: gatewayResult.gatewayToken,
  });

  const daemonRuntimeRaw = opts.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME;
  if (!opts.skipHealth) {
    const links = resolveControlUiLinks({
      bind: gatewayResult.bind as "auto" | "lan" | "loopback" | "custom" | "tailnet",
      port: gatewayResult.port,
      customBindHost: nextConfig.gateway?.customBindHost,
      basePath: undefined,
      tlsEnabled: nextConfig.gateway?.tls?.enabled === true,
    });
    await waitForGatewayReachable({
      url: links.wsUrl,
      token: gatewayResult.gatewayToken,
      deadlineMs: 15_000,
    });
    await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
  }

  logNonInteractiveOnboardingJson({
    opts,
    runtime,
    mode,
    workspaceDir,
    authChoice,
    gateway: {
      port: gatewayResult.port,
      bind: gatewayResult.bind,
      authMode: gatewayResult.authMode,
      tailscaleMode: gatewayResult.tailscaleMode,
    },
    installDaemon: Boolean(opts.installDaemon),
    daemonRuntime: opts.installDaemon ? daemonRuntimeRaw : undefined,
    skipSkills: Boolean(opts.skipSkills),
    skipHealth: Boolean(opts.skipHealth),
  });

  if (!opts.json) {
    runtime.log(
      `Tip: run \`${formatCliCommand("omniclaw configure --section web")}\` to store your Brave API key for web_search. Docs: https://docs.omniclaw.ai/tools/web`,
    );
  }
}
