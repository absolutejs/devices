package js.absolute.devices;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.spec.InvalidKeySpecException;
import java.util.ArrayList;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;

@CapacitorPlugin(name = "AbsoluteSecureStorage")
public class AbsoluteSecureStoragePlugin extends Plugin {
    private static final String ALIAS = "absolutejs.devices.secure-storage.v1";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final int MAX_KEY_LENGTH = 256;

    private static String requireText(PluginCall call, String name) {
        String value = call.getString(name);
        if (value == null || value.isEmpty() || value.length() > MAX_KEY_LENGTH) {
            call.reject(name + " must contain between 1 and " + MAX_KEY_LENGTH + " characters.", "INVALID_ARGUMENT");
            return null;
        }
        return value;
    }

    private SecretKey key() throws GeneralSecurityException {
        KeyStore store = KeyStore.getInstance(ANDROID_KEYSTORE);
        try {
            store.load(null);
        } catch (IOException error) {
            throw new GeneralSecurityException("Unable to load Android Keystore.", error);
        }
        SecretKey existing = (SecretKey) store.getKey(ALIAS, null);
        if (existing != null) return existing;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build()
        );
        return generator.generateKey();
    }

    private boolean hardwareBacked() throws GeneralSecurityException {
        try {
            SecretKeyFactory factory = SecretKeyFactory.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
            KeyInfo info = (KeyInfo) factory.getKeySpec(key(), KeyInfo.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                int level = info.getSecurityLevel();
                return level == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT ||
                    level == KeyProperties.SECURITY_LEVEL_STRONGBOX;
            }
            return info.isInsideSecureHardware();
        } catch (InvalidKeySpecException error) {
            return false;
        }
    }

    private void rejectStorage(PluginCall call, Exception error) {
        call.reject("Native secure storage operation failed.", "STORAGE_FAILURE", error);
    }

    @PluginMethod
    public void status(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("backend", "keystore");
            result.put("hardwareBacked", hardwareBacked());
            result.put("persistent", true);
            result.put("secure", true);
            call.resolve(result);
        } catch (GeneralSecurityException error) {
            rejectStorage(call, error);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String name = requireText(call, "key");
        String value = call.getString("value");
        if (name == null) return;
        if (value == null) {
            call.reject("value is required.", "INVALID_ARGUMENT");
            return;
        }
        try {
            String leaseId = call.getString("leaseId");
            if (leaseId != null && !AbsoluteSecureStorageVault.setIfLease(getContext(), name, value, leaseId)) {
                call.reject("Native secure-storage lease was lost.", "LEASE_LOST");
                return;
            }
            if (leaseId == null) AbsoluteSecureStorageVault.set(getContext(), name, value);
            call.resolve();
        } catch (GeneralSecurityException | IOException error) {
            rejectStorage(call, error);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String name = requireText(call, "key");
        if (name == null) return;
        try {
            JSObject result = new JSObject();
            String value = AbsoluteSecureStorageVault.get(getContext(), name);
            result.put("value", value == null ? JSObject.NULL : value);
            call.resolve(result);
        } catch (GeneralSecurityException | IOException error) {
            rejectStorage(call, error);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String name = requireText(call, "key");
        if (name == null) return;
        try {
            AbsoluteSecureStorageVault.remove(getContext(), name);
            call.resolve();
        } catch (IOException error) {
            rejectStorage(call, error);
        }
    }

    @PluginMethod
    public void keys(PluginCall call) {
        String prefix = requireText(call, "prefix");
        if (prefix == null) return;
        try {
            ArrayList<String> matches = AbsoluteSecureStorageVault.keys(getContext(), prefix);
            JSObject result = new JSObject();
            result.put("keys", new JSArray(matches));
            call.resolve(result);
        } catch (IOException error) {
            rejectStorage(call, error);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        String prefix = requireText(call, "prefix");
        if (prefix == null) return;
        try {
            AbsoluteSecureStorageVault.clear(getContext(), prefix);
            call.resolve();
        } catch (IOException error) {
            rejectStorage(call, error);
        }
    }

    @PluginMethod
    public void acquireLease(PluginCall call) {
        String name = requireText(call, "key");
        Integer ttl = call.getInt("ttlMs");
        if (name == null) return;
        if (ttl == null || ttl < 1000 || ttl > 120000) {
            call.reject("ttlMs must be between 1000 and 120000.", "INVALID_ARGUMENT");
            return;
        }
        JSObject result = new JSObject();
        String leaseId = AbsoluteSecureStorageVault.acquireLease(name, ttl);
        result.put("leaseId", leaseId == null ? JSObject.NULL : leaseId);
        call.resolve(result);
    }

    @PluginMethod
    public void releaseLease(PluginCall call) {
        String name = requireText(call, "key");
        String leaseId = requireText(call, "leaseId");
        if (name == null || leaseId == null) return;
        AbsoluteSecureStorageVault.releaseLease(name, leaseId);
        call.resolve();
    }
}
