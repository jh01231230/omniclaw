import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createConfigIO } from "./io.js";

async function withTempHome(run: (home: string) => Promise<void>): Promise<void> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "omniclaw-config-"));
  try {
    await run(home);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}

async function writeConfig(
  home: string,
  dirname: ".omniclaw",
  port: number,
  filename: string = "omniclaw.json",
) {
  const dir = path.join(home, dirname);
  await fs.mkdir(dir, { recursive: true });
  const configPath = path.join(dir, filename);
  await fs.writeFile(configPath, JSON.stringify({ gateway: { port } }, null, 2));
  return configPath;
}

describe("config io paths", () => {
  it("uses ~/.omniclaw/omniclaw.json when config exists", async () => {
    await withTempHome(async (home) => {
      const configPath = await writeConfig(home, ".omniclaw", 19001);
      const io = createConfigIO({
        env: {} as NodeJS.ProcessEnv,
        homedir: () => home,
      });
      expect(io.configPath).toBe(configPath);
      expect(io.loadConfig().gateway?.port).toBe(19001);
    });
  });

  it("defaults to ~/.omniclaw/omniclaw.json when config is missing", async () => {
    await withTempHome(async (home) => {
      const io = createConfigIO({
        env: {} as NodeJS.ProcessEnv,
        homedir: () => home,
      });
      expect(io.configPath).toBe(path.join(home, ".omniclaw", "omniclaw.json"));
    });
  });

  it("honors explicit OMNICLAW_CONFIG_PATH override", async () => {
    await withTempHome(async (home) => {
      const customPath = await writeConfig(home, ".omniclaw", 20002, "custom.json");
      const io = createConfigIO({
        env: { OMNICLAW_CONFIG_PATH: customPath } as NodeJS.ProcessEnv,
        homedir: () => home,
      });
      expect(io.configPath).toBe(customPath);
      expect(io.loadConfig().gateway?.port).toBe(20002);
    });
  });

  it("does not fall back to default config when OMNICLAW_STATE_DIR is set", async () => {
    await withTempHome(async (home) => {
      const defaultConfigPath = await writeConfig(home, ".omniclaw", 19001);
      const overrideDir = path.join(home, "isolated-state");
      await fs.mkdir(overrideDir, { recursive: true });

      const io = createConfigIO({
        env: { OMNICLAW_STATE_DIR: overrideDir } as NodeJS.ProcessEnv,
        homedir: () => home,
      });

      expect(io.configPath).toBe(path.join(overrideDir, "omniclaw.json"));
      expect(io.configPath).not.toBe(defaultConfigPath);
    });
  });
});
