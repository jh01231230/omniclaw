import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveGatewayStateDir } from "./paths.js";

describe("resolveGatewayStateDir", () => {
  it("uses the default state dir when no overrides are set", () => {
    const env = { HOME: "/Users/test" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".omniclaw"));
  });

  it("appends the profile suffix when set", () => {
    const env = { HOME: "/Users/test", OMNICLAW_PROFILE: "rescue" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".omniclaw-rescue"));
  });

  it("treats default profiles as the base state dir", () => {
    const env = { HOME: "/Users/test", OMNICLAW_PROFILE: "Default" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".omniclaw"));
  });

  it("uses OMNICLAW_STATE_DIR when provided", () => {
    const env = { HOME: "/Users/test", OMNICLAW_STATE_DIR: "/var/lib/omniclaw" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/var/lib/omniclaw"));
  });

  it("expands ~ in OMNICLAW_STATE_DIR", () => {
    const env = { HOME: "/Users/test", OMNICLAW_STATE_DIR: "~/omniclaw-state" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/Users/test/omniclaw-state"));
  });

  it("preserves Windows absolute paths without HOME", () => {
    const env = { OMNICLAW_STATE_DIR: "C:\\State\\omniclaw" };
    expect(resolveGatewayStateDir(env)).toBe("C:\\State\\omniclaw");
  });
});
