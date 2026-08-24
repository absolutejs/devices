package js.absolute.devices;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.util.ArrayList;
import java.util.Properties;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "AbsoluteSecureStorage")
public class AbsoluteSecureStoragePlugin extends Plugin {
    private static final String ALIAS = "absolutejs.devices.secure-storage.v1";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String CIPHER = "AES/GCM/NoPadding";
    private static final String FILE_NAME = "absolutejs-secure-storage.properties";
    private static final int GCM_TAG_BITS = 128;
    private static final int IV_BYTES = 12;
    private static final int MAX_KEY_LENGTH = 256;
    private static final Object LOCK = new Object();

    private AtomicFile storageFile() {
        return new AtomicFile(new File(getContext().getNoBackupFilesDir(), FILE_NAME));
    }

    private static String requireText(PluginCall call, String name) {
        String value = call.getString(name);
        if (value == null || value.isEmpty() || value.length() > MAX_KEY_LENGTH) {
            call.reject(name + " must contain between 1 and " + MAX_KEY_LENGTH + " characters.", "INVALID_ARGUMENT");
            return null;
        }
        return value;
    }

    private Properties readValues() throws IOException {
        Properties values = new Properties();
        File file = storageFile().getBaseFile();
        if (!file.exists()) return values;
        try (FileInputStream input = storageFile().openRead()) {
            values.load(input);
        }
        return values;
    }

    private void writeValues(Properties values) throws IOException {
        AtomicFile file = storageFile();
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

    private SecretKey key() throws GeneralSecurityException {
        KeyStore store = KeyStore.getInstance(ANDROID_KEYSTORE);
        store.load(null);
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

    private String encrypt(String value) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance(CIPHER);
        byte[] iv = new byte[IV_BYTES];
        new SecureRandom().nextBytes(iv);
        cipher.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(GCM_TAG_BITS, iv));
        byte[] encrypted = cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        return Base64.encodeToString(iv, Base64.NO_WRAP) + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP);
    }

    private String decrypt(String encoded) throws GeneralSecurityException {
        String[] parts = encoded.split("\\.", -1);
        if (parts.length != 2) throw new GeneralSecurityException("Invalid encrypted record.");
        byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
        byte[] encrypted = Base64.decode(parts[1], Base64.NO_WRAP);
        if (iv.length != IV_BYTES) throw new GeneralSecurityException("Invalid encrypted record.");
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(GCM_TAG_BITS, iv));
        return new String(cipher.doFinal(encrypted), java.nio.charset.StandardCharsets.UTF_8);
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
            synchronized (LOCK) {
                Properties values = readValues();
                values.setProperty(name, encrypt(value));
                writeValues(values);
            }
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
            synchronized (LOCK) {
                String encoded = readValues().getProperty(name);
                result.put("value", encoded == null ? JSObject.NULL : decrypt(encoded));
            }
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
            synchronized (LOCK) {
                Properties values = readValues();
                if (values.remove(name) != null) writeValues(values);
            }
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
            ArrayList<String> matches = new ArrayList<>();
            synchronized (LOCK) {
                for (Object candidate : readValues().keySet()) {
                    String name = candidate.toString();
                    if (name.startsWith(prefix)) matches.add(name);
                }
            }
            matches.sort(String::compareTo);
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
            synchronized (LOCK) {
                Properties values = readValues();
                boolean changed = values.keySet().removeIf(candidate -> candidate.toString().startsWith(prefix));
                if (changed) writeValues(values);
            }
            call.resolve();
        } catch (IOException error) {
            rejectStorage(call, error);
        }
    }
}
