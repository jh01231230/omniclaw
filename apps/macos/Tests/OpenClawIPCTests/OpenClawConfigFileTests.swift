import Foundation
import Testing
@testable import OmniClaw

@Suite(.serialized)
struct OmniClawConfigFileTests {
    @Test
    func configPathRespectsEnvOverride() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("omniclaw-config-\(UUID().uuidString)")
            .appendingPathComponent("omniclaw.json")
            .path

        await TestIsolation.withEnvValues(["OMNICLAW_CONFIG_PATH": override]) {
            #expect(OmniClawConfigFile.url().path == override)
        }
    }

    @MainActor
    @Test
    func remoteGatewayPortParsesAndMatchesHost() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("omniclaw-config-\(UUID().uuidString)")
            .appendingPathComponent("omniclaw.json")
            .path

        await TestIsolation.withEnvValues(["OMNICLAW_CONFIG_PATH": override]) {
            OmniClawConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "ws://gateway.ts.net:19999",
                    ],
                ],
            ])
            #expect(OmniClawConfigFile.remoteGatewayPort() == 19999)
            #expect(OmniClawConfigFile.remoteGatewayPort(matchingHost: "gateway.ts.net") == 19999)
            #expect(OmniClawConfigFile.remoteGatewayPort(matchingHost: "gateway") == 19999)
            #expect(OmniClawConfigFile.remoteGatewayPort(matchingHost: "other.ts.net") == nil)
        }
    }

    @MainActor
    @Test
    func setRemoteGatewayUrlPreservesScheme() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("omniclaw-config-\(UUID().uuidString)")
            .appendingPathComponent("omniclaw.json")
            .path

        await TestIsolation.withEnvValues(["OMNICLAW_CONFIG_PATH": override]) {
            OmniClawConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "wss://old-host:111",
                    ],
                ],
            ])
            OmniClawConfigFile.setRemoteGatewayUrl(host: "new-host", port: 2222)
            let root = OmniClawConfigFile.loadDict()
            let url = ((root["gateway"] as? [String: Any])?["remote"] as? [String: Any])?["url"] as? String
            #expect(url == "wss://new-host:2222")
        }
    }

    @Test
    func stateDirOverrideSetsConfigPath() async {
        let dir = FileManager().temporaryDirectory
            .appendingPathComponent("omniclaw-state-\(UUID().uuidString)", isDirectory: true)
            .path

        await TestIsolation.withEnvValues([
            "OMNICLAW_CONFIG_PATH": nil,
            "OMNICLAW_STATE_DIR": dir,
        ]) {
            #expect(OmniClawConfigFile.stateDirURL().path == dir)
            #expect(OmniClawConfigFile.url().path == "\(dir)/omniclaw.json")
        }
    }
}
