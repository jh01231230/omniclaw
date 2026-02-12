import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "omniclaw", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "omniclaw", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "omniclaw", "status"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "omniclaw", "status", "--json"], 2)).toEqual(["status"]);
    expect(getCommandPath(["node", "omniclaw", "agents", "list"], 2)).toEqual(["agents", "list"]);
    expect(getCommandPath(["node", "omniclaw", "status", "--", "ignored"], 2)).toEqual(["status"]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "omniclaw", "agents", "list"])).toBe("agents");
    expect(getPrimaryCommand(["node", "omniclaw"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "omniclaw", "status", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "omniclaw", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(getFlagValue(["node", "omniclaw", "status", "--timeout", "5000"], "--timeout")).toBe(
      "5000",
    );
    expect(getFlagValue(["node", "omniclaw", "status", "--timeout=2500"], "--timeout")).toBe(
      "2500",
    );
    expect(getFlagValue(["node", "omniclaw", "status", "--timeout"], "--timeout")).toBeNull();
    expect(getFlagValue(["node", "omniclaw", "status", "--timeout", "--json"], "--timeout")).toBe(
      null,
    );
    expect(getFlagValue(["node", "omniclaw", "--", "--timeout=99"], "--timeout")).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "omniclaw", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "omniclaw", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "omniclaw", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it("parses positive integer flag values", () => {
    expect(getPositiveIntFlagValue(["node", "omniclaw", "status"], "--timeout")).toBeUndefined();
    expect(
      getPositiveIntFlagValue(["node", "omniclaw", "status", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(["node", "omniclaw", "status", "--timeout", "5000"], "--timeout"),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(["node", "omniclaw", "status", "--timeout", "nope"], "--timeout"),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "omniclaw",
      rawArgs: ["node", "omniclaw", "status"],
    });
    expect(nodeArgv).toEqual(["node", "omniclaw", "status"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "omniclaw",
      rawArgs: ["node-22", "omniclaw", "status"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "omniclaw", "status"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "omniclaw",
      rawArgs: ["node-22.2.0.exe", "omniclaw", "status"],
    });
    expect(versionedNodeWindowsArgv).toEqual(["node-22.2.0.exe", "omniclaw", "status"]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "omniclaw",
      rawArgs: ["node-22.2", "omniclaw", "status"],
    });
    expect(versionedNodePatchlessArgv).toEqual(["node-22.2", "omniclaw", "status"]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "omniclaw",
      rawArgs: ["node-22.2.exe", "omniclaw", "status"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual(["node-22.2.exe", "omniclaw", "status"]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "omniclaw",
      rawArgs: ["/usr/bin/node-22.2.0", "omniclaw", "status"],
    });
    expect(versionedNodeWithPathArgv).toEqual(["/usr/bin/node-22.2.0", "omniclaw", "status"]);

    const nodejsArgv = buildParseArgv({
      programName: "omniclaw",
      rawArgs: ["nodejs", "omniclaw", "status"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "omniclaw", "status"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "omniclaw",
      rawArgs: ["node-dev", "omniclaw", "status"],
    });
    expect(nonVersionedNodeArgv).toEqual(["node", "omniclaw", "node-dev", "omniclaw", "status"]);

    const directArgv = buildParseArgv({
      programName: "omniclaw",
      rawArgs: ["omniclaw", "status"],
    });
    expect(directArgv).toEqual(["node", "omniclaw", "status"]);

    const bunArgv = buildParseArgv({
      programName: "omniclaw",
      rawArgs: ["bun", "src/entry.ts", "status"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "status"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "omniclaw",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "omniclaw", "status"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "omniclaw", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "omniclaw", "health"])).toBe(false);
    expect(shouldMigrateState(["node", "omniclaw", "sessions"])).toBe(false);
    expect(shouldMigrateState(["node", "omniclaw", "memory", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "omniclaw", "agent", "--message", "hi"])).toBe(false);
    expect(shouldMigrateState(["node", "omniclaw", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "omniclaw", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
