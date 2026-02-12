import type { OmniClawPluginApi } from "../../src/plugins/types.js";
import { createLlmTaskTool } from "./src/llm-task-tool.js";

export default function register(api: OmniClawPluginApi) {
  api.registerTool(createLlmTaskTool(api), { optional: true });
}
