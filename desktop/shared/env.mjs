import { safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * Secret vault for API keys.
 *
 * Keys are encrypted with safeStorage (macOS Keychain / Windows DPAPI)
 * and stored as JSON at secretsPath. Only boolean presence flags are
 * ever sent to the renderer — values stay in the main process.
 */
export class SecretVault {
  #path;
  #secrets = {};

  constructor(secretsPath) {
    this.#path = secretsPath;
  }

  /**
   * Load secrets from disk. Safe to call multiple times.
   */
  load() {
    try {
      if (!fs.existsSync(this.#path)) return;
      const raw = JSON.parse(fs.readFileSync(this.#path, "utf8"));
      for (const [key, encrypted] of Object.entries(raw)) {
        if (safeStorage.isEncryptionAvailable()) {
          this.#secrets[key] = safeStorage.decryptString(Buffer.from(encrypted, "base64"));
        } else {
          this.#secrets[key] = encrypted; // Plaintext fallback
        }
      }
    } catch {
      // Corrupt vault file — start fresh
      this.#secrets = {};
    }
  }

  /**
   * Persist secrets to encrypted disk storage.
   */
  save() {
    const dir = path.dirname(this.#path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const encrypted = {};
    for (const [key, value] of Object.entries(this.#secrets)) {
      if (!value) continue;
      if (safeStorage.isEncryptionAvailable()) {
        encrypted[key] = safeStorage.encryptString(value).toString("base64");
      } else {
        encrypted[key] = value; // Plaintext fallback
      }
    }

    fs.writeFileSync(this.#path, JSON.stringify(encrypted, null, 2), { mode: 0o600 });
  }

  /**
   * Get a single secret value (main process only).
   */
  get(key) {
    return this.#secrets[key] || "";
  }

  /**
   * Set a secret value.
   */
  set(key, value) {
    if (value) {
      this.#secrets[key] = value;
    } else {
      delete this.#secrets[key];
    }
    this.save();
  }

  /**
   * Clear a secret.
   */
  clear(key) {
    delete this.#secrets[key];
    this.save();
  }

  /**
   * Get boolean presence flags (safe to send to renderer).
   */
  getPresence() {
    return {
      hasOpenAI: !!this.#secrets["OPENAI_API_KEY"],
      hasDeepSeek: !!this.#secrets["DEEPSEEK_API_KEY"],
      hasYouTube: !!this.#secrets["YOUTUBE_API_KEY"],
      hasFal: !!this.#secrets["FAL_KEY"],
      hasElevenLabs: !!this.#secrets["ELEVENLABS_API_KEY"],
    };
  }

  /**
   * Inject all secrets into a process env object (for worker threads / child processes).
   */
  injectIntoEnv(env = {}) {
    for (const [key, value] of Object.entries(this.#secrets)) {
      if (value) env[key] = value;
    }
    return env;
  }
}
