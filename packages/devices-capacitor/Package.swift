// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AbsoluteDevicesCapacitor",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "AbsoluteDevicesCapacitor", targets: ["AbsoluteDevicesCapacitor"]),
        // Capacitor 8's generated CapApp-SPM names a plugin's product from
        // its npm scope and name, so it asks for AbsolutejsDevicesCapacitor.
        // The same target under that name, beside the original.
        .library(name: "AbsolutejsDevicesCapacitor", targets: ["AbsoluteDevicesCapacitor"]),
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
    ],
    targets: [
        .target(
            name: "AbsoluteDevicesCapacitor",
            dependencies: [.product(name: "Capacitor", package: "capacitor-swift-pm")],
            path: "ios/Sources/AbsoluteDevicesCapacitor"
        ),
    ]
)
