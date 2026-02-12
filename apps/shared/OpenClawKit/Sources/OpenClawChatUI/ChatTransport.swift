import Foundation

public enum OmniClawChatTransportEvent: Sendable {
    case health(ok: Bool)
    case tick
    case chat(OmniClawChatEventPayload)
    case agent(OmniClawAgentEventPayload)
    case seqGap
}

public protocol OmniClawChatTransport: Sendable {
    func requestHistory(sessionKey: String) async throws -> OmniClawChatHistoryPayload
    func sendMessage(
        sessionKey: String,
        message: String,
        thinking: String,
        idempotencyKey: String,
        attachments: [OmniClawChatAttachmentPayload]) async throws -> OmniClawChatSendResponse

    func abortRun(sessionKey: String, runId: String) async throws
    func listSessions(limit: Int?) async throws -> OmniClawChatSessionsListResponse

    func requestHealth(timeoutMs: Int) async throws -> Bool
    func events() -> AsyncStream<OmniClawChatTransportEvent>

    func setActiveSessionKey(_ sessionKey: String) async throws
}

extension OmniClawChatTransport {
    public func setActiveSessionKey(_: String) async throws {}

    public func abortRun(sessionKey _: String, runId _: String) async throws {
        throw NSError(
            domain: "OmniClawChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "chat.abort not supported by this transport"])
    }

    public func listSessions(limit _: Int?) async throws -> OmniClawChatSessionsListResponse {
        throw NSError(
            domain: "OmniClawChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "sessions.list not supported by this transport"])
    }
}
