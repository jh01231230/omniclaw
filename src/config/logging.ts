import type { RuntimeEnv } from "../runtime.js";
import { displayPath } from "../utils.js";
import { resolveConfigPath } from "./paths.js";

type LogConfigUpdatedOptions = {
  path?: string;
  suffix?: string;
};

export function formatConfigPath(path: string = resolveConfigPath()): string {
  return displayPath(path);
}

export function logConfigUpdated(runtime: RuntimeEnv, opts: LogConfigUpdatedOptions = {}): void {
  const path = formatConfigPath(opts.path ?? resolveConfigPath());
  const suffix = opts.suffix ? ` ${opts.suffix}` : "";
  runtime.log(`Updated ${path}${suffix}`);
}
