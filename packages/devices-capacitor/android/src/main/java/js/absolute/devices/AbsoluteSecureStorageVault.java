package js.absolute.devices;

import android.content.Context;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.Properties;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Native-only access for AbsoluteJS background components in the same app. */
public final class AbsoluteSecureStorageVault {
    private static final String ALIAS = "absolutejs.devices.secure-storage.v1";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String CIPHER = "AES/GCM/NoPadding";
    private static final String FILE_NAME = "absolutejs-secure-storage.properties";
    private static final int GCM_TAG_BITS = 128;
    private static final int IV_BYTES = 12;
    private static final Object LOCK = new Object();
    private static final Map<String, Lease> LEASES = new HashMap<>();
    private static final class Lease { final String id; final long expiresAt; Lease(String id, long expiresAt) { this.id = id; this.expiresAt = expiresAt; } }

    private AbsoluteSecureStorageVault() {}

    private static AtomicFile storageFile(Context context) {
        return new AtomicFile(new File(context.getNoBackupFilesDir(), FILE_NAME));
    }

    private static Properties readValues(Context context) throws IOException {
        Properties values = new Properties();
        AtomicFile storage = storageFile(context);
        if (!storage.getBaseFile().exists()) return values;
        try (FileInputStream input = storage.openRead()) { values.load(input); }
        return values;
    }

    private static void writeValues(Context context, Properties values) throws IOException {
        AtomicFile file = storageFile(context);
        FileOutputStream output = null;
        try {
            output = file.startWrite();
            values.store(output, null);
            file.finishWrite(output);
        } catch (IOException error) {
            if (output != null) file.failWrite(output);
            throw error;
        }
    }

    private static SecretKey key() throws GeneralSecurityException {
        KeyStore store = KeyStore.getInstance(ANDROID_KEYSTORE);
        try { store.load(null); }
        catch (IOException error) { throw new GeneralSecurityException("Unable to load Android Keystore.", error); }
        SecretKey existing = (SecretKey) store.getKey(ALIAS, null);
        if (existing != null) return existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private static String encrypt(String value) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length != IV_BYTES) throw new GeneralSecurityException("Invalid Keystore IV.");
        byte[] encrypted = cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        return Base64.encodeToString(iv, Base64.NO_WRAP) + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP);
    }

    private static String decrypt(String encoded) throws GeneralSecurityException {
        String[] parts = encoded.split("\\.", -1);
        if (parts.length != 2) throw new GeneralSecurityException("Invalid encrypted record.");
        byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
        byte[] encrypted = Base64.decode(parts[1], Base64.NO_WRAP);
        if (iv.length != IV_BYTES) throw new GeneralSecurityException("Invalid encrypted record.");
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(GCM_TAG_BITS, iv));
        return new String(cipher.doFinal(encrypted), java.nio.charset.StandardCharsets.UTF_8);
    }

    public static String get(Context context, String name) throws IOException, GeneralSecurityException {
        synchronized (LOCK) {
            String encoded = readValues(context).getProperty(name);
            return encoded == null ? null : decrypt(encoded);
        }
    }

    public static void set(Context context, String name, String value) throws IOException, GeneralSecurityException {
        synchronized (LOCK) {
            Properties values = readValues(context);
            values.setProperty(name, encrypt(value));
            writeValues(context, values);
        }
    }

    public static boolean setIfLease(Context context, String name, String value, String leaseId) throws IOException, GeneralSecurityException {
        synchronized (LOCK) {
            long now = android.os.SystemClock.elapsedRealtime();
            Lease current = LEASES.get(name);
            if (current == null || !current.id.equals(leaseId) || current.expiresAt <= now) return false;
            Properties values = readValues(context);
            values.setProperty(name, encrypt(value));
            writeValues(context, values);
            return true;
        }
    }

    public static void remove(Context context, String name) throws IOException {
        synchronized (LOCK) {
            LEASES.remove(name);
            Properties values = readValues(context);
            if (values.remove(name) != null) writeValues(context, values);
        }
    }

    public static ArrayList<String> keys(Context context, String prefix) throws IOException {
        synchronized (LOCK) {
            ArrayList<String> matches = new ArrayList<>();
            for (Object candidate : readValues(context).keySet()) {
                String name = candidate.toString();
                if (name.startsWith(prefix)) matches.add(name);
            }
            matches.sort(String::compareTo);
            return matches;
        }
    }

    public static void clear(Context context, String prefix) throws IOException {
        synchronized (LOCK) {
            LEASES.keySet().removeIf(name -> name.startsWith(prefix));
            Properties values = readValues(context);
            if (values.keySet().removeIf(candidate -> candidate.toString().startsWith(prefix))) writeValues(context, values);
        }
    }

    public static String acquireLease(String name, long ttlMilliseconds) {
        synchronized (LOCK) {
            long now = android.os.SystemClock.elapsedRealtime();
            Lease current = LEASES.get(name);
            if (current != null && current.expiresAt > now) return null;
            String id = UUID.randomUUID().toString();
            LEASES.put(name, new Lease(id, now + ttlMilliseconds));
            return id;
        }
    }

    public static void releaseLease(String name, String leaseId) {
        synchronized (LOCK) {
            Lease current = LEASES.get(name);
            if (current != null && current.id.equals(leaseId)) LEASES.remove(name);
        }
    }
}
