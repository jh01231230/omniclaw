import type { PluginRuntime } from "omniclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setMattermostRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getMattermostRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Mattermost runtime not initialized");
  }
  return runtime;
}
