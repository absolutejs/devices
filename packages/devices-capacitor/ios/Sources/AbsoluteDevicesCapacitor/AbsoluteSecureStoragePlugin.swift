import Capacitor
import Foundation
import Security

@objc(AbsoluteSecureStoragePlugin)
public class AbsoluteSecureStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AbsoluteSecureStoragePlugin"
    public let jsName = "AbsoluteSecureStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keys", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    private var service: String {
        "\(Bundle.main.bundleIdentifier ?? "absolutejs.app").absolutejs.secure-storage"
    }

    public override func load() {
        let marker = "absolutejs.devices.secure-storage.installed"
        if !UserDefaults.standard.bool(forKey: marker) {
            SecItemDelete([
                kSecClass: kSecClassGenericPassword,
                kSecAttrService: service,
            ] as CFDictionary)
            UserDefaults.standard.set(true, forKey: marker)
        }
    }

    private func requireText(_ call: CAPPluginCall, _ name: String) -> String? {
        guard let value = call.getString(name), !value.isEmpty, value.count <= 256 else {
            call.reject("\(name) must contain between 1 and 256 characters.", "INVALID_ARGUMENT")
            return nil
        }
        return value
    }

    private func query(_ key: String) -> [CFString: Any] {
        [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
            kSecAttrSynchronizable: kCFBooleanFalse as Any,
        ]
    }

    private func rejectStorage(_ call: CAPPluginCall, _ status: OSStatus) {
        call.reject("Native secure storage operation failed (\(status)).", "STORAGE_FAILURE")
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve([
            "backend": "keychain",
            "hardwareBacked": false,
            "persistent": true,
            "secure": true,
        ])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = requireText(call, "key") else { return }
        guard let value = call.getString("value"), let data = value.data(using: .utf8) else {
            call.reject("value is required.", "INVALID_ARGUMENT")
            return
        }
        let existing = query(key)
        let updateStatus = SecItemUpdate(existing as CFDictionary, [kSecValueData: data] as CFDictionary)
        if updateStatus == errSecSuccess {
            call.resolve()
            return
        }
        guard updateStatus == errSecItemNotFound else {
            rejectStorage(call, updateStatus)
            return
        }
        var addition = existing
        addition[kSecValueData] = data
        addition[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let addStatus = SecItemAdd(addition as CFDictionary, nil)
        if addStatus == errSecSuccess {
            call.resolve()
        } else {
            rejectStorage(call, addStatus)
        }
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = requireText(call, "key") else { return }
        var request = query(key)
        request[kSecReturnData] = kCFBooleanTrue
        request[kSecMatchLimit] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound {
            call.resolve(["value": NSNull()])
            return
        }
        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            rejectStorage(call, status == errSecSuccess ? errSecDecode : status)
            return
        }
        call.resolve(["value": value])
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = requireText(call, "key") else { return }
        let status = SecItemDelete(query(key) as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            rejectStorage(call, status)
        }
    }

    private func matchingKeys(prefix: String) -> (keys: [String]?, status: OSStatus) {
        let request: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecReturnAttributes: kCFBooleanTrue as Any,
            kSecMatchLimit: kSecMatchLimitAll,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return ([], errSecSuccess) }
        guard status == errSecSuccess else { return (nil, status) }
        let records = result as? [[CFString: Any]] ?? []
        return (
            records.compactMap { $0[kSecAttrAccount] as? String }.filter { $0.hasPrefix(prefix) }.sorted(),
            errSecSuccess
        )
    }

    @objc func keys(_ call: CAPPluginCall) {
        guard let prefix = requireText(call, "prefix") else { return }
        let result = matchingKeys(prefix: prefix)
        if let keys = result.keys {
            call.resolve(["keys": keys])
        } else {
            rejectStorage(call, result.status)
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        guard let prefix = requireText(call, "prefix") else { return }
        let result = matchingKeys(prefix: prefix)
        guard let keys = result.keys else {
            rejectStorage(call, result.status)
            return
        }
        for key in keys {
            let status = SecItemDelete(query(key) as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else {
                rejectStorage(call, status)
                return
            }
        }
        call.resolve()
    }
}
