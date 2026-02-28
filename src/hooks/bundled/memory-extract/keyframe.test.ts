import { describe, expect, it } from "vitest";
import { buildSessionCompression } from "./compression.js";
import {
  buildMemoryKeyframeRecord,
  buildReconstructableSummaryRecord,
  buildSessionKeyframeBundle,
  renderReconstructableSummaryPreview,
} from "./keyframe.js";

describe("memory keyframe builders", () => {
  it("builds structured keyframe records for memory-extract", () => {
    const compression = buildSessionCompression(
      [
        {
          role: "user",
          content: "Alice 建议把 OmniClaw v3.2 的发布窗口改到周五前，并保留 2 个 reviewer。",
          timestamp: "2026-02-10T10:00:00.000Z",
        },
      ],
      {
        minImportance: 0.2,
      },
    );

    const bundle = buildSessionKeyframeBundle("session-a.jsonl", compression);
    expect(bundle.keyframes).toHaveLength(1);

    const keyframe = bundle.keyframes[0];
    if (!keyframe) {
      throw new Error("expected keyframe");
    }
    const record = buildMemoryKeyframeRecord({
      id: "kf-001",
      createdAt: "2026-02-10T10:30:00.000Z",
      sessionBundle: bundle,
      keyframe,
    });

    expect(record.schema).toBe("omniclaw.memory.keyframe.v1");
    expect(record.keyframe.sequence).toBe(1);
    expect(record.keyframe.anchors.names).toEqual(expect.arrayContaining(["Alice", "OmniClaw"]));
    expect(record.sessionContext.keywordCapsule.length).toBeGreaterThan(0);
  });

  it("builds reconstructable periodic summary with global anchors", () => {
    const sessionA = buildSessionKeyframeBundle(
      "session-a.jsonl",
      buildSessionCompression(
        [
          {
            role: "user",
            content: "Peter 问：Jetson 上 120s 超时要不要调到 300s？",
          },
          {
            role: "assistant",
            content: "建议先把 timeout 调整到 300s，并在周一前回归 2 轮。",
          },
        ],
        { minImportance: 0.2 },
      ),
    );
    const sessionB = buildSessionKeyframeBundle(
      "session-b.jsonl",
      buildSessionCompression(
        [
          {
            role: "user",
            content: "最终决定先合并 periodic-summary，再处理 PostgreSQL 索引优化。",
          },
        ],
        { minImportance: 0.2 },
      ),
    );

    const summary = buildReconstructableSummaryRecord({
      id: "sum-001",
      createdAt: "2026-02-11T00:00:00.000Z",
      prompt: "test prompt",
      sessions: [sessionA, sessionB],
    });

    expect(summary.schema).toBe("omniclaw.memory.periodic-summary.v1");
    expect(summary.sessions).toHaveLength(2);
    expect(summary.overview.detailCapsule.names).toEqual(
      expect.arrayContaining(["Peter", "Jetson", "PostgreSQL"]),
    );
    expect(summary.overview.detailCapsule.numbers).toEqual(
      expect.arrayContaining(["120s", "300s", "2"]),
    );
    expect(summary.overview.timeline.length).toBeGreaterThan(0);

    const preview = renderReconstructableSummaryPreview(summary);
    expect(preview).toContain("Periodic Summary (Reconstructable)");
    expect(preview).toContain("sum-001");
  });
});
