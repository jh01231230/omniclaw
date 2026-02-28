import type { SessionCompressionResult, SessionKeyframeEntry } from "./compression.js";

type DetailAnchors = {
  names: string[];
  numbers: string[];
  suggestions: string[];
  symbols: string[];
};

export type StructuredMemoryKeyframe = {
  sequence: number;
  messageIndex: number;
  role: SessionKeyframeEntry["role"];
  timestamp?: string;
  contentType: SessionKeyframeEntry["contentType"];
  strategy: string;
  importance: number;
  core: string;
  details: string[];
  quote: string;
  keywords: string[];
  anchors: DetailAnchors;
};

export type SessionKeyframeBundle = {
  sessionFile: string;
  overview: string;
  timeline: string[];
  keywordCapsule: string[];
  detailCapsule: DetailAnchors;
  keyframes: StructuredMemoryKeyframe[];
};

export type MemoryKeyframeRecord = {
  schema: "omniclaw.memory.keyframe.v1";
  id: string;
  createdAt: string;
  source: "memory-extract";
  sessionFile: string;
  keyframe: StructuredMemoryKeyframe;
  sessionContext: {
    overview: string;
    timeline: string[];
    keywordCapsule: string[];
    detailCapsule: DetailAnchors;
  };
};

export type ReconstructableSummaryRecord = {
  schema: "omniclaw.memory.periodic-summary.v1";
  id: string;
  createdAt: string;
  source: "periodic-summary";
  prompt: string;
  overview: {
    coreNarrative: string[];
    timeline: string[];
    keywordCapsule: string[];
    detailCapsule: DetailAnchors;
  };
  sessions: SessionKeyframeBundle[];
};

type BuildMemoryKeyframeRecordOptions = {
  id: string;
  createdAt: string;
  sessionBundle: SessionKeyframeBundle;
  keyframe: StructuredMemoryKeyframe;
};

type BuildReconstructableSummaryOptions = {
  id: string;
  createdAt: string;
  prompt: string;
  sessions: SessionKeyframeBundle[];
};

function uniqueOrdered(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(value);
  }
  return out;
}

function toDetailAnchors(entry: SessionKeyframeEntry): DetailAnchors {
  return {
    names: [...entry.names],
    numbers: [...entry.numbers],
    suggestions: [...entry.suggestions],
    symbols: [...entry.symbols],
  };
}

function toStructuredKeyframe(entry: SessionKeyframeEntry): StructuredMemoryKeyframe {
  return {
    sequence: entry.sequence,
    messageIndex: entry.messageIndex,
    role: entry.role,
    timestamp: entry.timestamp,
    contentType: entry.contentType,
    strategy: entry.strategy,
    importance: Number(entry.importance.toFixed(3)),
    core: entry.core,
    details: [...entry.details],
    quote: entry.quote,
    keywords: [...entry.keywords],
    anchors: toDetailAnchors(entry),
  };
}

export function buildSessionKeyframeBundle(
  sessionFile: string,
  compression: SessionCompressionResult,
): SessionKeyframeBundle {
  const keyframes = compression.keyframes.map(toStructuredKeyframe);
  return {
    sessionFile,
    overview: compression.overview,
    timeline: [...compression.timeline],
    keywordCapsule: [...compression.keywordCapsule],
    detailCapsule: {
      names: [...compression.detailCapsule.names],
      numbers: [...compression.detailCapsule.numbers],
      suggestions: [...compression.detailCapsule.suggestions],
      symbols: [...compression.detailCapsule.symbols],
    },
    keyframes,
  };
}

export function buildMemoryKeyframeRecord(
  options: BuildMemoryKeyframeRecordOptions,
): MemoryKeyframeRecord {
  const { id, createdAt, sessionBundle, keyframe } = options;
  return {
    schema: "omniclaw.memory.keyframe.v1",
    id,
    createdAt,
    source: "memory-extract",
    sessionFile: sessionBundle.sessionFile,
    keyframe: {
      sequence: keyframe.sequence,
      messageIndex: keyframe.messageIndex,
      role: keyframe.role,
      timestamp: keyframe.timestamp,
      contentType: keyframe.contentType,
      strategy: keyframe.strategy,
      importance: keyframe.importance,
      core: keyframe.core,
      details: [...keyframe.details],
      quote: keyframe.quote,
      keywords: [...keyframe.keywords],
      anchors: {
        names: [...keyframe.anchors.names],
        numbers: [...keyframe.anchors.numbers],
        suggestions: [...keyframe.anchors.suggestions],
        symbols: [...keyframe.anchors.symbols],
      },
    },
    sessionContext: {
      overview: sessionBundle.overview,
      timeline: [...sessionBundle.timeline],
      keywordCapsule: [...sessionBundle.keywordCapsule],
      detailCapsule: {
        names: [...sessionBundle.detailCapsule.names],
        numbers: [...sessionBundle.detailCapsule.numbers],
        suggestions: [...sessionBundle.detailCapsule.suggestions],
        symbols: [...sessionBundle.detailCapsule.symbols],
      },
    },
  };
}

export function buildReconstructableSummaryRecord(
  options: BuildReconstructableSummaryOptions,
): ReconstructableSummaryRecord {
  const { id, createdAt, prompt, sessions } = options;

  const coreNarrative = uniqueOrdered(sessions.map((session) => session.overview)).slice(0, 10);
  const timeline = sessions
    .flatMap((session) => session.timeline.map((line) => `${session.sessionFile}: ${line}`))
    .slice(0, 120);
  const keywordCapsule = uniqueOrdered(sessions.flatMap((session) => session.keywordCapsule)).slice(
    0,
    40,
  );
  const detailCapsule = {
    names: uniqueOrdered(sessions.flatMap((session) => session.detailCapsule.names)).slice(0, 24),
    numbers: uniqueOrdered(sessions.flatMap((session) => session.detailCapsule.numbers)).slice(
      0,
      24,
    ),
    suggestions: uniqueOrdered(
      sessions.flatMap((session) => session.detailCapsule.suggestions),
    ).slice(0, 20),
    symbols: uniqueOrdered(sessions.flatMap((session) => session.detailCapsule.symbols)).slice(
      0,
      8,
    ),
  };

  return {
    schema: "omniclaw.memory.periodic-summary.v1",
    id,
    createdAt,
    source: "periodic-summary",
    prompt,
    overview: {
      coreNarrative,
      timeline,
      keywordCapsule,
      detailCapsule,
    },
    sessions: sessions.map((session) => ({
      sessionFile: session.sessionFile,
      overview: session.overview,
      timeline: [...session.timeline],
      keywordCapsule: [...session.keywordCapsule],
      detailCapsule: {
        names: [...session.detailCapsule.names],
        numbers: [...session.detailCapsule.numbers],
        suggestions: [...session.detailCapsule.suggestions],
        symbols: [...session.detailCapsule.symbols],
      },
      keyframes: session.keyframes.map((keyframe) => ({
        sequence: keyframe.sequence,
        messageIndex: keyframe.messageIndex,
        role: keyframe.role,
        timestamp: keyframe.timestamp,
        contentType: keyframe.contentType,
        strategy: keyframe.strategy,
        importance: keyframe.importance,
        core: keyframe.core,
        details: [...keyframe.details],
        quote: keyframe.quote,
        keywords: [...keyframe.keywords],
        anchors: {
          names: [...keyframe.anchors.names],
          numbers: [...keyframe.anchors.numbers],
          suggestions: [...keyframe.anchors.suggestions],
          symbols: [...keyframe.anchors.symbols],
        },
      })),
    })),
  };
}

function buildListLine(label: string, values: string[], fallback: string = "none"): string {
  return `- ${label}: ${values.length > 0 ? values.join(", ") : fallback}`;
}

export function renderReconstructableSummaryPreview(summary: ReconstructableSummaryRecord): string {
  const topCore = summary.overview.coreNarrative.slice(0, 5);
  const sessionLines = summary.sessions.slice(0, 8).map((session) => {
    const first = session.keyframes[0];
    if (!first) {
      return `- ${session.sessionFile}: (no keyframes)`;
    }
    return `- ${session.sessionFile}: [${first.contentType}] ${first.core}`;
  });

  return `# Periodic Summary (Reconstructable)

${buildListLine("Summary ID", [summary.id])}
${buildListLine("Schema", [summary.schema])}
${buildListLine("Sessions", [String(summary.sessions.length)])}

## Core Narrative
${topCore.length > 0 ? topCore.map((line) => `- ${line}`).join("\n") : "- (none)"}

## Session Replay Seeds
${sessionLines.length > 0 ? sessionLines.join("\n") : "- (none)"}

## Global Anchors
${buildListLine("Names/Products", summary.overview.detailCapsule.names)}
${buildListLine("Numbers", summary.overview.detailCapsule.numbers)}
${buildListLine("Suggestions", summary.overview.detailCapsule.suggestions)}
${buildListLine("Keywords", summary.overview.keywordCapsule)}
${buildListLine("Symbols", summary.overview.detailCapsule.symbols)}
`;
}
