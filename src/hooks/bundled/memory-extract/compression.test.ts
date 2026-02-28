import { describe, expect, it } from "vitest";
import {
  buildSessionCompression,
  classifyMemoryContentType,
  compressConversationMessage,
  parseSessionJsonlMessages,
} from "./compression.js";

describe("memory extraction compression", () => {
  it("keeps question symbols and concrete entities in compressed output", () => {
    const compressed = compressConversationMessage({
      role: "user",
      content:
        "Peter，OmniClaw v2.3 在 Jetson 上为什么会在 120s 后超时？建议把 timeout 调到 300s 吗？",
    });

    expect(["question", "issue"]).toContain(compressed.contentType);
    expect(compressed.core).toMatch(/[?？]/);
    expect(compressed.keywords).toContain("?");
    expect(compressed.names).toEqual(expect.arrayContaining(["OmniClaw", "Jetson", "Peter"]));
    expect(compressed.numbers).toEqual(expect.arrayContaining(["120s", "300s"]));
    expect(compressed.numbers.some((value) => /(?:^|v)2\.3$/.test(value))).toBe(true);
  });

  it("uses issue strategy and preserves error signatures", () => {
    const compressed = compressConversationMessage({
      role: "assistant",
      content:
        "部署时报错 TypeError: Cannot read properties of undefined at handler.ts:42, 先定位 memory-extract 里的空值。",
    });

    expect(classifyMemoryContentType(compressed.quote)).toBe("issue");
    expect(compressed.strategy).toBe("error-signature");
    expect(compressed.core).toContain("TypeError");
    expect(compressed.details.join(" ")).toContain("handler.ts:42");
    expect(compressed.keywords).toContain("TypeError");
  });

  it("captures actionable suggestions and timing details", () => {
    const compressed = compressConversationMessage({
      role: "assistant",
      content:
        "建议先在 staging 跑 2 轮回归测试，然后周一前把 periodic-summary 合并到 main，并保留人名、产品名和数字。",
    });

    expect(["task", "suggestion"]).toContain(compressed.contentType);
    expect(compressed.suggestions.length).toBeGreaterThan(0);
    expect(compressed.details.join(" ")).toMatch(/周一|staging|main/);
    expect(compressed.numbers).toContain("2");
  });

  it("builds session-level compression with detail anchors", () => {
    const result = buildSessionCompression(
      [
        {
          role: "user",
          content: "Alice 说 OmniClaw 需要在 24h 内发布 beta 吗？",
        },
        {
          role: "assistant",
          content: "建议先修复 PostgreSQL timeout，再把重试次数设为 3 次；这样周五前更稳妥。",
        },
        {
          role: "user",
          content: "好的，最终决定保留 periodic-summary 的关键词胶囊输出。",
        },
      ],
      {
        maxMemories: 6,
        minImportance: 0.4,
      },
    );

    expect(result.overview.length).toBeGreaterThan(0);
    expect(result.keywordCapsule).toContain("?");
    expect(result.detailCapsule.names).toEqual(
      expect.arrayContaining(["Alice", "OmniClaw", "PostgreSQL"]),
    );
    expect(result.detailCapsule.numbers).toEqual(expect.arrayContaining(["24h", "3"]));
    expect(result.timeline.length).toBeGreaterThan(0);
    expect(result.keyframes.length).toBeGreaterThan(0);
    expect(result.keyframes[0]?.sequence).toBe(1);
    expect(result.keyframes[0]?.messageIndex).toBeGreaterThanOrEqual(0);
  });

  it("parses session JSONL entries with structured message content", () => {
    const jsonl = [
      JSON.stringify({
        type: "message",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "请记住 OmniClaw 需要 2 个 reviewer。" }],
        },
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-01-01T00:00:01.000Z",
        message: {
          role: "assistant",
          content: "收到，我会保留 reviewer 数字细节。",
        },
      }),
      JSON.stringify({
        type: "tool_use",
        message: {
          role: "assistant",
          content: "this should be ignored",
        },
      }),
    ].join("\n");

    const messages = parseSessionJsonlMessages(jsonl);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain("2");
    expect(messages[1]?.role).toBe("assistant");
  });

  it("keeps timestamp and sequence for reconstructable keyframes", () => {
    const result = buildSessionCompression(
      [
        {
          role: "user",
          content: "请在周三前完成 OmniClaw v3.0 的发布准备。",
          timestamp: "2026-02-01T09:00:00.000Z",
        },
      ],
      {
        minImportance: 0.2,
      },
    );

    expect(result.keyframes).toHaveLength(1);
    expect(result.keyframes[0]?.timestamp).toBe("2026-02-01T09:00:00.000Z");
    expect(result.keyframes[0]?.sequence).toBe(1);
  });
});
