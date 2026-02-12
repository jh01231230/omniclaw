import OmniClawKit
import OmniClawProtocol
import Foundation

// Prefer the OmniClawKit wrapper to keep gateway request payloads consistent.
typealias AnyCodable = OmniClawKit.AnyCodable
typealias InstanceIdentity = OmniClawKit.InstanceIdentity

extension AnyCodable {
    var stringValue: String? { self.value as? String }
    var boolValue: Bool? { self.value as? Bool }
    var intValue: Int? { self.value as? Int }
    var doubleValue: Double? { self.value as? Double }
    var dictionaryValue: [String: AnyCodable]? { self.value as? [String: AnyCodable] }
    var arrayValue: [AnyCodable]? { self.value as? [AnyCodable] }

    var foundationValue: Any {
        switch self.value {
        case let dict as [String: AnyCodable]:
            dict.mapValues { $0.foundationValue }
        case let array as [AnyCodable]:
            array.map(\.foundationValue)
        default:
            self.value
        }
    }
}

extension OmniClawProtocol.AnyCodable {
    var stringValue: String? { self.value as? String }
    var boolValue: Bool? { self.value as? Bool }
    var intValue: Int? { self.value as? Int }
    var doubleValue: Double? { self.value as? Double }
    var dictionaryValue: [String: OmniClawProtocol.AnyCodable]? { self.value as? [String: OmniClawProtocol.AnyCodable] }
    var arrayValue: [OmniClawProtocol.AnyCodable]? { self.value as? [OmniClawProtocol.AnyCodable] }

    var foundationValue: Any {
        switch self.value {
        case let dict as [String: OmniClawProtocol.AnyCodable]:
            dict.mapValues { $0.foundationValue }
        case let array as [OmniClawProtocol.AnyCodable]:
            array.map(\.foundationValue)
        default:
            self.value
        }
    }
}
