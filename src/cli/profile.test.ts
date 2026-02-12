import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "omniclaw",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "omniclaw", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "omniclaw", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "omniclaw", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "omniclaw", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "omniclaw", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "omniclaw", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs(["node", "omniclaw", "--dev", "--profile", "work", "status"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs(["node", "omniclaw", "--profile", "work", "--dev", "status"]);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join("/home/peter", ".omniclaw-dev");
    expect(env.OMNICLAW_PROFILE).toBe("dev");
    expect(env.OMNICLAW_STATE_DIR).toBe(expectedStateDir);
    expect(env.OMNICLAW_CONFIG_PATH).toBe(path.join(expectedStateDir, "omniclaw.json"));
    expect(env.OMNICLAW_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      OMNICLAW_STATE_DIR: "/custom",
      OMNICLAW_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.OMNICLAW_STATE_DIR).toBe("/custom");
    expect(env.OMNICLAW_GATEWAY_PORT).toBe("19099");
    expect(env.OMNICLAW_CONFIG_PATH).toBe(path.join("/custom", "omniclaw.json"));
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("omniclaw doctor --fix", {})).toBe("omniclaw doctor --fix");
  });

  it("returns command unchanged when profile is default", () => {
    expect(formatCliCommand("omniclaw doctor --fix", { OMNICLAW_PROFILE: "default" })).toBe(
      "omniclaw doctor --fix",
    );
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(formatCliCommand("omniclaw doctor --fix", { OMNICLAW_PROFILE: "Default" })).toBe(
      "omniclaw doctor --fix",
    );
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(formatCliCommand("omniclaw doctor --fix", { OMNICLAW_PROFILE: "bad profile" })).toBe(
      "omniclaw doctor --fix",
    );
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(
      formatCliCommand("omniclaw --profile work doctor --fix", { OMNICLAW_PROFILE: "work" }),
    ).toBe("omniclaw --profile work doctor --fix");
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(formatCliCommand("omniclaw --dev doctor", { OMNICLAW_PROFILE: "dev" })).toBe(
      "omniclaw --dev doctor",
    );
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("omniclaw doctor --fix", { OMNICLAW_PROFILE: "work" })).toBe(
      "omniclaw --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("omniclaw doctor --fix", { OMNICLAW_PROFILE: "  jbopenclaw  " })).toBe(
      "omniclaw --profile jbopenclaw doctor --fix",
    );
  });

  it("handles command with no args after omniclaw", () => {
    expect(formatCliCommand("omniclaw", { OMNICLAW_PROFILE: "test" })).toBe(
      "omniclaw --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm omniclaw doctor", { OMNICLAW_PROFILE: "work" })).toBe(
      "pnpm omniclaw --profile work doctor",
    );
  });
});
