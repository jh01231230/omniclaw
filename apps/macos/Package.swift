// swift-tools-version: 6.2
// Package manifest for the OmniClaw macOS companion (menu bar app + IPC library).

import PackageDescription

let package = Package(
    name: "OmniClaw",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "OmniClawIPC", targets: ["OmniClawIPC"]),
        .library(name: "OmniClawDiscovery", targets: ["OmniClawDiscovery"]),
        .executable(name: "OmniClaw", targets: ["OmniClaw"]),
        .executable(name: "omniclaw-mac", targets: ["OmniClawMacCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.1.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.8.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.8.1"),
        .package(url: "https://github.com/steipete/Peekaboo.git", branch: "main"),
        .package(path: "../shared/OmniClawKit"),
        .package(path: "../../Swabble"),
    ],
    targets: [
        .target(
            name: "OmniClawIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "OmniClawDiscovery",
            dependencies: [
                .product(name: "OmniClawKit", package: "OmniClawKit"),
            ],
            path: "Sources/OmniClawDiscovery",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "OmniClaw",
            dependencies: [
                "OmniClawIPC",
                "OmniClawDiscovery",
                .product(name: "OmniClawKit", package: "OmniClawKit"),
                .product(name: "OmniClawChatUI", package: "OmniClawKit"),
                .product(name: "OmniClawProtocol", package: "OmniClawKit"),
                .product(name: "SwabbleKit", package: "swabble"),
                .product(name: "MenuBarExtraAccess", package: "MenuBarExtraAccess"),
                .product(name: "Subprocess", package: "swift-subprocess"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
                .product(name: "PeekabooBridge", package: "Peekaboo"),
                .product(name: "PeekabooAutomationKit", package: "Peekaboo"),
            ],
            exclude: [
                "Resources/Info.plist",
            ],
            resources: [
                .copy("Resources/OmniClaw.icns"),
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "OmniClawMacCLI",
            dependencies: [
                "OmniClawDiscovery",
                .product(name: "OmniClawKit", package: "OmniClawKit"),
                .product(name: "OmniClawProtocol", package: "OmniClawKit"),
            ],
            path: "Sources/OmniClawMacCLI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "OmniClawIPCTests",
            dependencies: [
                "OmniClawIPC",
                "OmniClaw",
                "OmniClawDiscovery",
                .product(name: "OmniClawProtocol", package: "OmniClawKit"),
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
