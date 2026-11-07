// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.3"),
        .package(name: "CapacitorApp", path: "../../../../marathon-app/node_modules/@capacitor/app"),
        .package(name: "CapacitorBrowser", path: "../../../../marathon-app/node_modules/@capacitor/browser"),
        .package(name: "CapacitorHaptics", path: "../../../../marathon-app/node_modules/@capacitor/haptics"),
        .package(name: "CapacitorKeyboard", path: "../../../../marathon-app/node_modules/@capacitor/keyboard"),
        .package(name: "CapacitorLocalNotifications", path: "../../../../marathon-app/node_modules/@capacitor/local-notifications"),
        .package(name: "CapacitorPreferences", path: "../../../../marathon-app/node_modules/@capacitor/preferences"),
        .package(name: "CapacitorPushNotifications", path: "../../../../marathon-app/node_modules/@capacitor/push-notifications"),
        .package(name: "CapgoCapacitorHealth", path: "../../../../marathon-app/node_modules/@capgo/capacitor-health"),
        .package(name: "EbarooniCapacitorCalendar", path: "../../../../marathon-app/node_modules/@ebarooni/capacitor-calendar")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorBrowser", package: "CapacitorBrowser"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapacitorPreferences", package: "CapacitorPreferences"),
                .product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"),
                .product(name: "CapgoCapacitorHealth", package: "CapgoCapacitorHealth"),
                .product(name: "EbarooniCapacitorCalendar", package: "EbarooniCapacitorCalendar")
            ]
        )
    ]
)
