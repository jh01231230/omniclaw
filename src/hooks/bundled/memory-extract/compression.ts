export type ConversationRole = "user" | "assistant";

export type MemoryContentType =
  | "question"
  | "task"
  | "decision"
  | "issue"
  | "suggestion"
  | "preference"
  | "fact"
  | "narrative";

export type SessionConversationMessage = {
  role: ConversationRole;
  content: string;
  timestamp?: string;
};

export type MemoryDetailAnchors = {
  names: string[];
  numbers: string[];
  suggestions: string[];
  keyTerms: string[];
  symbols: string[];
};

export type CompressedMemoryEntry = {
  role: ConversationRole;
  timestamp?: string;
  contentType: MemoryContentType;
  strategy: string;
  importance: number;
  core: string;
  details: string[];
  keywords: string[];
  names: string[];
  numbers: string[];
  suggestions: string[];
  symbols: string[];
  quote: string;
};

export type SessionKeyframeEntry = CompressedMemoryEntry & {
  sequence: number;
  messageIndex: number;
};

export type SessionCompressionResult = {
  overview: string;
  memories: CompressedMemoryEntry[];
  keyframes: SessionKeyframeEntry[];
  timeline: string[];
  keywordCapsule: string[];
  detailCapsule: {
    names: string[];
    numbers: string[];
    suggestions: string[];
    symbols: string[];
  };
};

type BuildSessionCompressionOptions = {
  maxMemories?: number;
  minImportance?: number;
  maxKeywords?: number;
};

const ENGLISH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with",
  "you",
]);

const CHINESE_STOPWORDS = new Set([
  "这个",
  "那个",
  "我们",
  "你们",
  "他们",
  "一下",
  "已经",
  "然后",
  "因为",
  "所以",
  "进行",
  "如果",
  "以及",
  "还有",
]);

const ISSUE_HINTS =
  /\b(error|exception|failed|failure|bug|crash|timeout|traceback|stack|panic)\b|报错|错误|异常|失败|超时|崩溃/i;
const DECISION_HINTS =
  /\b(decide|decision|decided|agreed|choose|chosen|final)\b|决定|确定|拍板|采用|选用|最终/i;
const TASK_HINTS =
  /\b(todo|fix|implement|ship|deliver|follow[- ]?up|deadline|milestone|action item)\b|待办|任务|修复|实现|跟进|截止|上线|处理/i;
const SUGGESTION_HINTS =
  /\b(should|recommend|consider|try|suggest|proposal)\b|建议|推荐|最好|可以考虑|试试|可改为/i;
const PREFERENCE_HINTS =
  /\b(prefer|preference|like|dislike|hate|always|never)\b|偏好|喜欢|不喜欢|讨厌|总是|从不/i;
const QUESTION_HINTS = /[?？]/;

const SENTENCE_REGEX = /[^.!?。！？\n]+[.!?。！？]?/g;
const MULTIWORD_NAME_REGEX = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g;
const PRODUCT_TOKEN_REGEX = /\b[A-Z][A-Za-z0-9]+(?:[._/:+-][A-Za-z0-9]+)*\b/g;
const ACRONYM_REGEX = /\b[A-Z]{2,}[A-Z0-9._-]*\b/g;
const TECHNICAL_TERM_REGEX = /\b[A-Za-z][A-Za-z0-9._/:+-]{2,}\b/g;
const CJK_TERM_REGEX = /[\u4e00-\u9fff]{2,10}/g;
const NUMBER_REGEX = /\b\d{1,4}(?:,\d{3})*(?:\.\d+)?(?:%|ms|s|m|h|d|kb|mb|gb|tb|k|K|M|x|X)?\b/g;
const VERSION_REGEX = /\bv?\d+\.\d+(?:\.\d+){0,2}\b/gi;
const ISSUE_SIGNATURE_REGEXES = [
  /\b[A-Za-z]+Error\b/g,
  /\b[A-Za-z]+Exception\b/g,
  /\b[A-Z]{2,}-\d+\b/g,
  /\b[A-Za-z0-9_.-]+\.(?:ts|js|tsx|jsx|py|go|java|rs):\d+\b/g,
];

const CONTENT_TYPE_PRIORITY: MemoryContentType[] = [
  "issue",
  "decision",
  "task",
  "suggestion",
  "preference",
  "question",
  "fact",
  "narrative",
];

const TYPE_STRATEGY_LABEL: Record<MemoryContentType, string> = {
  question: "question-preserving",
  task: "action-oriented",
  decision: "decision-rationale",
  issue: "error-signature",
  suggestion: "proposal-focused",
  preference: "preference-profile",
  fact: "fact-anchor",
  narrative: "timeline-condense",
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clip(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

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

function collectRegexMatches(input: string, regex: RegExp): string[] {
  const matches = input.match(regex) ?? [];
  return matches.map((match) => normalizeWhitespace(match));
}

function splitSentences(content: string): string[] {
  const matches = content.match(SENTENCE_REGEX) ?? [];
  return matches.map((part) => normalizeWhitespace(part)).filter(Boolean);
}

function extractBacktickedTerms(content: string): string[] {
  const terms: string[] = [];
  const backtickRegex = /`([^`]+)`/g;
  let match = backtickRegex.exec(content);
  while (match) {
    const term = normalizeWhitespace(match[1] ?? "");
    if (term) {
      terms.push(term);
    }
    match = backtickRegex.exec(content);
  }
  return terms;
}

function extractIssueSignatures(content: string): string[] {
  const signatures: string[] = [];
  for (const regex of ISSUE_SIGNATURE_REGEXES) {
    signatures.push(...collectRegexMatches(content, regex));
  }
  return uniqueOrdered(signatures);
}

function isLikelyStopword(term: string): boolean {
  const lower = term.toLowerCase();
  if (ENGLISH_STOPWORDS.has(lower)) {
    return true;
  }
  if (CHINESE_STOPWORDS.has(term)) {
    return true;
  }
  return false;
}

function findMatchingSentence(sentences: string[], hint: RegExp): string | undefined {
  return sentences.find((sentence) => hint.test(sentence));
}

function ensureQuestionSymbol(sentence: string): string {
  if (!sentence) {
    return sentence;
  }
  if (/[?？]$/.test(sentence)) {
    return sentence;
  }
  return `${sentence}?`;
}

function getRoleLabel(role: ConversationRole): string {
  return role === "user" ? "User" : "Assistant";
}

export function extractTextFromContent(content: unknown): string {
  if (content === null || content === undefined) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  if (typeof content === "number" || typeof content === "boolean" || typeof content === "bigint") {
    return String(content);
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (!part || typeof part !== "object") {
          return "";
        }
        const record = part as Record<string, unknown>;
        const text = record.text;
        if (typeof text === "string") {
          return text;
        }
        if (text && typeof text === "object") {
          const nested = text as Record<string, unknown>;
          if (typeof nested.value === "string") {
            return nested.value;
          }
        }
        if (typeof record.thinking === "string") {
          return record.thinking;
        }
        if (typeof record.content === "string") {
          return record.content;
        }
        return "";
      })
      .join(" ");
  }
  if (typeof content === "object") {
    try {
      return JSON.stringify(content);
    } catch {
      return "";
    }
  }
  return "";
}

export function parseSessionJsonlMessages(jsonl: string): SessionConversationMessage[] {
  const messages: SessionConversationMessage[] = [];
  const lines = jsonl.split(/\r?\n/).map((line) => line.trim());

  for (const line of lines) {
    if (!line) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") {
      continue;
    }
    const row = parsed as Record<string, unknown>;
    if (row.type !== "message") {
      continue;
    }
    const rawMessage = row.message;
    if (!rawMessage || typeof rawMessage !== "object") {
      continue;
    }
    const message = rawMessage as Record<string, unknown>;
    const role = message.role;
    if (role !== "user" && role !== "assistant") {
      continue;
    }
    const content = normalizeWhitespace(extractTextFromContent(message.content));
    if (!content || content.startsWith("/")) {
      continue;
    }
    const timestamp = typeof row.timestamp === "string" ? row.timestamp : undefined;
    messages.push({
      role,
      content,
      timestamp,
    });
  }
  return messages;
}

function scoreContentType(
  content: string,
  anchors: MemoryDetailAnchors,
): Record<MemoryContentType, number> {
  const scores: Record<MemoryContentType, number> = {
    question: 0,
    task: 0,
    decision: 0,
    issue: 0,
    suggestion: 0,
    preference: 0,
    fact: 0,
    narrative: 0.05,
  };

  if (QUESTION_HINTS.test(content)) {
    scores.question += 1.2;
  }
  if (ISSUE_HINTS.test(content)) {
    scores.issue += 2;
  }
  if (DECISION_HINTS.test(content)) {
    scores.decision += 1.5;
  }
  if (TASK_HINTS.test(content)) {
    scores.task += 1.4;
  }
  if (SUGGESTION_HINTS.test(content)) {
    scores.suggestion += 1.3;
  }
  if (PREFERENCE_HINTS.test(content)) {
    scores.preference += 1.1;
  }

  const bulletCount = (content.match(/(?:^|\s)(?:-|\*|\d+\.)\s/g) ?? []).length;
  if (bulletCount > 0) {
    scores.task += 0.8;
  }
  if (anchors.numbers.length > 0) {
    scores.fact += 0.8;
  }
  if (anchors.names.length > 0) {
    scores.fact += 0.6;
  }
  if (content.length > 180) {
    scores.narrative += 0.3;
  }

  return scores;
}

export function classifyMemoryContentType(
  content: string,
  anchors: MemoryDetailAnchors = extractDetailAnchors(content),
): MemoryContentType {
  const normalized = normalizeWhitespace(content);
  if (!normalized) {
    return "narrative";
  }
  const scores = scoreContentType(normalized, anchors);

  let bestType: MemoryContentType = "narrative";
  let bestScore = -1;
  for (const type of CONTENT_TYPE_PRIORITY) {
    const score = scores[type];
    if (score > bestScore) {
      bestType = type;
      bestScore = score;
    }
  }
  if (bestScore <= 0.2 && (anchors.names.length > 0 || anchors.numbers.length > 0)) {
    return "fact";
  }
  return bestType;
}

export function extractDetailAnchors(content: string): MemoryDetailAnchors {
  const normalized = normalizeWhitespace(content);
  if (!normalized) {
    return {
      names: [],
      numbers: [],
      suggestions: [],
      keyTerms: [],
      symbols: [],
    };
  }

  const sentences = splitSentences(normalized);
  const symbols = uniqueOrdered([
    normalized.includes("?") || normalized.includes("？") ? "?" : "",
    normalized.includes("!") || normalized.includes("！") ? "!" : "",
  ]).filter(Boolean);

  const names = uniqueOrdered([
    ...collectRegexMatches(normalized, MULTIWORD_NAME_REGEX),
    ...collectRegexMatches(normalized, PRODUCT_TOKEN_REGEX),
    ...collectRegexMatches(normalized, ACRONYM_REGEX),
    ...extractBacktickedTerms(normalized),
  ])
    .filter((term) => term.length >= 2 && !isLikelyStopword(term))
    .slice(0, 10);

  const numbers = uniqueOrdered([
    ...collectRegexMatches(normalized, NUMBER_REGEX),
    ...collectRegexMatches(normalized, VERSION_REGEX),
  ]).slice(0, 10);

  const suggestions = uniqueOrdered(
    sentences
      .filter((sentence) => SUGGESTION_HINTS.test(sentence) || TASK_HINTS.test(sentence))
      .map((sentence) => clip(sentence, 180)),
  ).slice(0, 6);

  const keyTerms = uniqueOrdered([
    ...names,
    ...numbers,
    ...extractBacktickedTerms(normalized),
    ...collectRegexMatches(normalized, TECHNICAL_TERM_REGEX),
    ...collectRegexMatches(normalized, CJK_TERM_REGEX),
  ])
    .filter((term) => term.length >= 2 && !isLikelyStopword(term))
    .slice(0, 24);

  return {
    names,
    numbers,
    suggestions,
    keyTerms,
    symbols,
  };
}

function buildCoreByType(
  contentType: MemoryContentType,
  content: string,
  sentences: string[],
  anchors: MemoryDetailAnchors,
): string {
  if (sentences.length === 0) {
    return clip(content, 220);
  }

  const decisionSentence = findMatchingSentence(sentences, DECISION_HINTS);
  const taskSentence = findMatchingSentence(sentences, TASK_HINTS);
  const suggestionSentence = findMatchingSentence(sentences, SUGGESTION_HINTS);
  const questionSentence = findMatchingSentence(sentences, QUESTION_HINTS);
  const issueSentence = findMatchingSentence(sentences, ISSUE_HINTS);
  const preferenceSentence = findMatchingSentence(sentences, PREFERENCE_HINTS);

  switch (contentType) {
    case "question":
      return ensureQuestionSymbol(clip(questionSentence ?? sentences[0], 220));
    case "issue": {
      const signatures = extractIssueSignatures(content);
      const base = issueSentence ?? sentences[0];
      if (signatures.length === 0 || signatures.some((signature) => base.includes(signature))) {
        return clip(base, 220);
      }
      return clip(`${base} [${signatures.slice(0, 2).join(", ")}]`, 220);
    }
    case "decision": {
      const reasonSentence = sentences.find((sentence) =>
        /\b(because|reason|therefore)\b|因为|由于|所以|为了/i.test(sentence),
      );
      if (decisionSentence && reasonSentence && reasonSentence !== decisionSentence) {
        return clip(`${decisionSentence} Reason: ${reasonSentence}`, 220);
      }
      return clip(decisionSentence ?? sentences[0], 220);
    }
    case "task":
      return clip(taskSentence ?? suggestionSentence ?? sentences[0], 220);
    case "suggestion":
      return clip(suggestionSentence ?? taskSentence ?? sentences[0], 220);
    case "preference":
      return clip(preferenceSentence ?? sentences[0], 220);
    case "fact": {
      const factualSentence =
        sentences.find(
          (sentence) =>
            anchors.numbers.some((number) => sentence.includes(number)) ||
            anchors.names.some((name) => sentence.includes(name)),
        ) ?? sentences[0];
      return clip(factualSentence, 220);
    }
    case "narrative":
    default:
      return clip(sentences[0], 220);
  }
}

function buildDetailLines(
  contentType: MemoryContentType,
  content: string,
  sentences: string[],
  anchors: MemoryDetailAnchors,
): string[] {
  const detailLines: string[] = [];

  if (anchors.names.length > 0) {
    detailLines.push(`Names/Products: ${anchors.names.slice(0, 5).join(", ")}`);
  }
  if (anchors.numbers.length > 0) {
    detailLines.push(`Numbers: ${anchors.numbers.slice(0, 6).join(", ")}`);
  }
  if (anchors.suggestions.length > 0) {
    detailLines.push(`Suggestions: ${anchors.suggestions.slice(0, 3).join(" | ")}`);
  }
  if (anchors.symbols.length > 0) {
    detailLines.push(`Tone symbols: ${anchors.symbols.join(" ")}`);
  }

  if (contentType === "issue") {
    const signatures = extractIssueSignatures(content);
    if (signatures.length > 0) {
      detailLines.push(`Error signatures: ${signatures.slice(0, 4).join(", ")}`);
    }
  }

  if (contentType === "question") {
    const questionSentences = sentences.filter((sentence) => QUESTION_HINTS.test(sentence));
    if (questionSentences.length > 1) {
      detailLines.push(`Follow-up question: ${clip(questionSentences[1], 170)}`);
    }
  }

  if (contentType === "decision") {
    const reasonSentence = sentences.find((sentence) =>
      /\b(because|reason|therefore)\b|因为|由于|所以|为了/i.test(sentence),
    );
    if (reasonSentence) {
      detailLines.push(`Decision rationale: ${clip(reasonSentence, 170)}`);
    }
  }

  if (contentType === "task" || contentType === "suggestion") {
    const schedule = uniqueOrdered(
      collectRegexMatches(
        content,
        /\b(?:by|before)\s+[A-Za-z0-9:_-]+|周[一二三四五六日天]|\b\d{1,2}[:：]\d{2}\b/gi,
      ),
    );
    if (schedule.length > 0) {
      detailLines.push(`Timing details: ${schedule.slice(0, 3).join(", ")}`);
    }
  }

  return uniqueOrdered(detailLines).slice(0, 8);
}

function calculateImportance(
  role: ConversationRole,
  contentType: MemoryContentType,
  anchors: MemoryDetailAnchors,
  content: string,
  core: string,
): number {
  let score = 0.35;

  if (role === "user") {
    score += 0.04;
  }

  if (contentType === "issue" || contentType === "decision" || contentType === "task") {
    score += 0.2;
  } else if (contentType === "question" || contentType === "suggestion") {
    score += 0.14;
  } else if (contentType === "preference") {
    score += 0.12;
  } else if (contentType === "fact") {
    score += 0.1;
  }

  score += Math.min(anchors.names.length, 3) * 0.08;
  score += Math.min(anchors.numbers.length, 3) * 0.06;
  score += Math.min(anchors.suggestions.length, 2) * 0.07;

  if (anchors.symbols.includes("?")) {
    score += 0.05;
  }

  if (/\b(important|critical|remember|must|deadline)\b|重要|紧急|必须|记住/i.test(content)) {
    score += 0.1;
  }

  if (content.length >= 80) {
    score += 0.05;
  }
  if (content.length > 500) {
    score += 0.05;
  }
  if (core.length < 15) {
    score -= 0.05;
  }

  return Math.min(1, Math.max(0, score));
}

export function compressConversationMessage(
  message: SessionConversationMessage,
  maxKeywords: number = 14,
): CompressedMemoryEntry {
  const content = normalizeWhitespace(message.content);
  const anchors = extractDetailAnchors(content);
  const contentType = classifyMemoryContentType(content, anchors);
  const sentences = splitSentences(content);
  const core = buildCoreByType(contentType, content, sentences, anchors);
  const details = buildDetailLines(contentType, content, sentences, anchors);

  const keywords = uniqueOrdered([
    ...anchors.names,
    ...anchors.numbers,
    ...anchors.keyTerms,
    ...anchors.symbols,
  ]).slice(0, maxKeywords);

  const importance = calculateImportance(message.role, contentType, anchors, content, core);

  return {
    role: message.role,
    timestamp: message.timestamp,
    contentType,
    strategy: TYPE_STRATEGY_LABEL[contentType],
    importance,
    core,
    details,
    keywords,
    names: anchors.names,
    numbers: anchors.numbers,
    suggestions: anchors.suggestions,
    symbols: anchors.symbols,
    quote: clip(content, 320),
  };
}

export function buildSessionCompression(
  messages: SessionConversationMessage[],
  options: BuildSessionCompressionOptions = {},
): SessionCompressionResult {
  const maxMemories = Math.max(1, Math.floor(options.maxMemories ?? 8));
  const minImportance = Math.max(0, Math.min(1, options.minImportance ?? 0.58));
  const maxKeywords = Math.max(4, Math.floor(options.maxKeywords ?? 24));

  const compressedRanked = messages
    .map((message, index) => ({
      index,
      entry: compressConversationMessage(message, Math.min(maxKeywords, 16)),
    }))
    .filter(({ entry }) => entry.core.length > 0);

  let selected = compressedRanked.filter(({ entry }) => entry.importance >= minImportance);
  if (selected.length === 0) {
    selected = [...compressedRanked]
      .toSorted((a, b) => b.entry.importance - a.entry.importance)
      .slice(0, Math.min(maxMemories, 3));
  } else if (selected.length > maxMemories) {
    selected = selected
      .toSorted((a, b) => b.entry.importance - a.entry.importance)
      .slice(0, maxMemories);
  }

  const selectedSorted = selected.toSorted((a, b) => a.index - b.index);
  const selectedEntries = selectedSorted.map(({ entry }) => entry);
  const keyframes: SessionKeyframeEntry[] = selectedSorted.map(
    ({ index, entry }, keyframeIndex) => ({
      ...entry,
      sequence: keyframeIndex + 1,
      messageIndex: index,
    }),
  );
  const topForOverview = [...selectedEntries]
    .toSorted((a, b) => b.importance - a.importance)
    .slice(0, 3);

  const overview = topForOverview.map((entry) => entry.core).join(" | ");
  const timeline = selectedEntries.map(
    (entry) => `${getRoleLabel(entry.role)} (${entry.contentType}): ${entry.core}`,
  );

  const detailCapsule = {
    names: uniqueOrdered(selectedEntries.flatMap((entry) => entry.names)).slice(0, 12),
    numbers: uniqueOrdered(selectedEntries.flatMap((entry) => entry.numbers)).slice(0, 12),
    suggestions: uniqueOrdered(selectedEntries.flatMap((entry) => entry.suggestions)).slice(0, 8),
    symbols: uniqueOrdered(selectedEntries.flatMap((entry) => entry.symbols)).slice(0, 4),
  };

  const keywordCapsule = uniqueOrdered(selectedEntries.flatMap((entry) => entry.keywords)).slice(
    0,
    maxKeywords,
  );

  return {
    overview,
    memories: selectedEntries.slice(0, maxMemories),
    keyframes: keyframes.slice(0, maxMemories),
    timeline,
    keywordCapsule,
    detailCapsule,
  };
}
