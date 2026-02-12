import Foundation

public enum OmniClawCameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
}

public enum OmniClawCameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum OmniClawCameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum OmniClawCameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct OmniClawCameraSnapParams: Codable, Sendable, Equatable {
    public var facing: OmniClawCameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: OmniClawCameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: OmniClawCameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: OmniClawCameraImageFormat? = nil,
        deviceId: String? = nil,
        delayMs: Int? = nil)
    {
        self.facing = facing
        self.maxWidth = maxWidth
        self.quality = quality
        self.format = format
        self.deviceId = deviceId
        self.delayMs = delayMs
    }
}

public struct OmniClawCameraClipParams: Codable, Sendable, Equatable {
    public var facing: OmniClawCameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: OmniClawCameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: OmniClawCameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: OmniClawCameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}
