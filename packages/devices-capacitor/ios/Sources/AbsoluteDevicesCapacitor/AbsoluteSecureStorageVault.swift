import Foundation
import Security

/** Native-only access for AbsoluteJS background components in the same app. */
public enum AbsoluteSecureStorageVault {
    private struct Lease { let id: String; let expiresAt: TimeInterval }
    private static let leaseLock = NSLock()
    private static var leases: [String: Lease] = [:]
    private static var service: String {
        "\(Bundle.main.bundleIdentifier ?? "absolutejs.app").absolutejs.secure-storage"
    }

    private static func query(_ key: String) -> [CFString: Any] {
        [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
            kSecAttrSynchronizable: kCFBooleanFalse as Any,
        ]
    }

    public static func get(_ key: String) throws -> String? {
        var request = query(key)
        request[kSecReturnData] = kCFBooleanTrue
        request[kSecMatchLimit] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status == errSecSuccess ? errSecDecode : status))
        }
        return value
    }

    public static func set(_ key: String, value: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw NSError(domain: "AbsoluteSecureStorage", code: 1)
        }
        let existing = query(key)
        let updated = SecItemUpdate(existing as CFDictionary, [
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ] as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(updated))
        }
        var addition = existing
        addition[kSecValueData] = data
        // Background processing may run while locked. This remains device-only
        // and becomes readable only after the first unlock following a reboot.
        addition[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let added = SecItemAdd(addition as CFDictionary, nil)
        guard added == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(added))
        }
    }

    public static func setIfLease(_ key: String, value: String, leaseId: String) throws -> Bool {
        leaseLock.lock(); defer { leaseLock.unlock() }
        let now = ProcessInfo.processInfo.systemUptime
        guard let lease = leases[key], lease.id == leaseId, lease.expiresAt > now else { return false }
        try set(key, value: value)
        return true
    }

    public static func remove(_ key: String) throws {
        leaseLock.lock(); leases.removeValue(forKey: key); leaseLock.unlock()
        let status = SecItemDelete(query(key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
    }

    public static func acquireLease(_ key: String, ttlMilliseconds: Int) -> String? {
        leaseLock.lock(); defer { leaseLock.unlock() }
        let now = ProcessInfo.processInfo.systemUptime
        if let lease = leases[key], lease.expiresAt > now { return nil }
        let id = UUID().uuidString
        leases[key] = Lease(id: id, expiresAt: now + Double(ttlMilliseconds) / 1_000)
        return id
    }

    public static func releaseLease(_ key: String, leaseId: String) {
        leaseLock.lock(); defer { leaseLock.unlock() }
        if leases[key]?.id == leaseId { leases.removeValue(forKey: key) }
    }
}
