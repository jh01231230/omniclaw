// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "OmniClawKit",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
    ],
    products: [
        .library(name: "OmniClawProtocol", targets: ["OmniClawProtocol"]),
        .library(name: "OmniClawKit", targets: ["OmniClawKit"]),
        .library(name: "OmniClawChatUI", targets: ["OmniClawChatUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/steipete/ElevenLabsKit", exact: "0.1.0"),
        .package(url: "https://github.com/gonzalezreal/textual", exact: "0.3.1"),
    ],
    targets: [
        .target(
            name: "OmniClawProtocol",
            path: "Sources/OmniClawProtocol",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "OmniClawKit",
            dependencies: [
                "OmniClawProtocol",
                .product(name: "ElevenLabsKit", package: "ElevenLabsKit"),
            ],
            path: "Sources/OmniClawKit",
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "OmniClawChatUI",
            dependencies: [
                "OmniClawKit",
                .product(
                    name: "Textual",
                    package: "textual",
                    condition: .when(platforms: [.macOS, .iOS])),
            ],
            path: "Sources/OmniClawChatUI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "OmniClawKitTests",
            dependencies: ["OmniClawKit", "OmniClawChatUI"],
            path: "Tests/OmniClawKitTests",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
