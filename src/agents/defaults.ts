// Defaults for agent metadata when upstream does not supply them.
// These should be broadly-available defaults used when config does not specify a model.
export const DEFAULT_PROVIDER = "minimax";
export const DEFAULT_MODEL = "MiniMax-M2.1";
// Context window: MiniMax M2.1 supports ~200k tokens.
export const DEFAULT_CONTEXT_TOKENS = 200_000;
