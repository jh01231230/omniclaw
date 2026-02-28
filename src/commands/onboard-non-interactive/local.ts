import os from "node:os";
import path from "node:path";
import type { OmniClawConfig } from "../../config/config.js";
import type { RuntimeEnv } from "../../runtime.js";
import type { WizardPrompter } from "../../wizard/prompts.js";
import type { OnboardOptions } from "../onboard-types.js";
import { formatCliCommand } from "../../cli/command-format.js";
import { resolveGatewayPort, writeConfigFile } from "../../config/config.js";
import { logConfigUpdated } from "../../config/logging.js";
import { resolveStateDir } from "../../config/paths.js";
import { resolveUserPath } from "../../utils.js";
import { applyBrowserConfig, promptBrowserSetup } from "../../wizard/onboarding.browser.js";
import {
  applyMemoryDeploymentConfig,
  autoInstallMemoryServices,
  type MemoryDeploymentConfig,
} from "../../wizard/onboarding.memory.js";
import { DEFAULT_GATEWAY_DAEMON_RUNTIME } from "../daemon-runtime.js";
import { healthCommand } from "../health.js";
import {
  applyWizardMetadata,
  DEFAULT_WORKSPACE,
  ensureWorkspaceAndSessions,
  resolveControlUiLinks,
  waitForGatewayReachable,
} from "../onboard-helpers.js";
import { ensureMemoryDir } from "../onboard-helpers.js";
import { applyNonInteractiveAuthChoice } from "./local/auth-choice.js";
import { installGatewayDaemonNonInteractive } from "./local/daemon-install.js";
import { applyNonInteractiveGatewayConfig } from "./local/gateway-config.js";
import { logNonInteractiveOnboardingJson } from "./local/output.js";
import { applyNonInteractiveSkillsConfig } from "./local/skills-config.js";
import { resolveNonInteractiveWorkspaceDir } from "./local/workspace.js";
import { applyNonInteractiveSandboxDefaults } from "./sandbox-defaults.js";

function createNonInteractivePrompter(runtime: RuntimeEnv): WizardPrompter {
  return {
    intro: async () => {},
    outro: async () => {},
    note: async (message: string, title?: string) => {
      runtime.log(title ? `${title}: ${message}` : message);
    },
    select: async <T>(params: { options: Array<{ value: T }>; initialValue?: T }): Promise<T> => {
      if (params.initialValue !== undefined) {
        return params.initialValue;
      }
      const first = params.options[0];
      if (first) {
        return first.value;
      }
      throw new Error("Non-interactive select has no options.");
    },
    multiselect: async <T>(): Promise<T[]> => [],
    text: async (params: { initialValue?: string }): Promise<string> => params.initialValue ?? "",
    confirm: async (params: { initialValue?: boolean }): Promise<boolean> =>
      params.initialValue ?? true,
    progress: () => ({
      update: () => {},
      stop: () => {},
    }),
  };
}

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
    const defaultMemoryRoot = path.join(
      resolveStateDir(process.env, os.homedir),
      "memory-services",
    );
    const memoryRootPath = resolveUserPath(opts.memoryPath ?? defaultMemoryRoot);
    const memoryConfig: MemoryDeploymentConfig = {
      type: memoryMode,
      autoInstall: Boolean(opts.autoInstallMemory),
      dataPath: memoryMode === "full" ? memoryRootPath : undefined,
    };

    if (memoryMode === "full") {
      if (opts.autoInstallMemory) {
        // Auto-install memory services
        try {
          runtime.log(`Auto-installing memory services to: ${memoryRootPath}`);
          const installResult = await autoInstallMemoryServices(
            memoryRootPath,
            createNonInteractivePrompter(runtime),
            runtime,
          );
          memoryConfig.postgresql = installResult.postgresql;
          memoryConfig.redis = installResult.redis;
          memoryConfig.autoInstall = true;
        } catch (err) {
          runtime.error(`Auto-install failed: ${String(err)}, falling back to minimal mode`);
          memoryConfig.type = "minimal";
        }
      } else {
        // Use default PostgreSQL config
        memoryConfig.postgresql = {
          host: process.platform === "linux" ? "/var/run/postgresql" : "127.0.0.1",
          port: 5432,
          database: "omniclaw_memory",
          user: process.platform === "linux" ? os.userInfo().username : "postgres",
          password: "",
          dataPath: path.join(memoryRootPath, "postgresql", "data"),
          autoStart: true,
        };
        memoryConfig.redis = {
          host: "127.0.0.1",
          port: 6379,
          db: 0,
          sessionPrefix: "session:",
          dataPath: path.join(memoryRootPath, "redis"),
        };
      }
    }

    nextConfig = applyMemoryDeploymentConfig(nextConfig, memoryConfig);

    // Create memory directory for minimal deployment
    if (memoryConfig.type === "minimal") {
      await ensureMemoryDir(runtime);
    }
  }

  if (!opts.skipBrowser) {
    const browserConfig = await promptBrowserSetup(createNonInteractivePrompter(runtime), runtime, {
      enabled: true,
      nonInteractive: true,
      autoInstallChromium: true,
    });
    nextConfig = applyBrowserConfig(nextConfig, browserConfig);
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
