import type { OmniClawPluginApi } from "omniclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "omniclaw/plugin-sdk";
import { createDiagnosticsOtelService } from "./src/service.js";

const plugin = {
  id: "diagnostics-otel",
  name: "Diagnostics OpenTelemetry",
  description: "Export diagnostics events to OpenTelemetry",
  configSchema: emptyPluginConfigSchema(),
  register(api: OmniClawPluginApi) {
    api.registerService(createDiagnosticsOtelService());
  },
};

export default plugin;
