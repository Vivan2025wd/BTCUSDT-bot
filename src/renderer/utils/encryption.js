/**
 * AES-256-GCM encryption service for API keys and sensitive data.
 *
 * ──────────────────────────────────────────────────────────────────
 * IMPORTANT — where this file runs
 * ──────────────────────────────────────────────────────────────────
 * This module uses Node's `crypto` module, so it MUST run in the
 * Electron **main process**, not the renderer.
 *
 * With `contextIsolation: true` + `nodeIntegration: false`, the
 * renderer has no `require` and no Node built-ins. If the renderer
 * ever calls into this file, it will crash with "require is not
 * defined" — the exact error we already fixed for webpack.
 *
 * Correct architecture:
 *
 *   1. Renderer collects plaintext API key from the user.
 *   2. Renderer sends it to main via IPC (ipcRenderer.invoke).
 *   3. Main encrypts with this module and writes to disk.
 *   4. Main returns only the ciphertext metadata (or nothing).
 *
 * A bridge class for the renderer side is provided at the bottom of
 * this file for convenience, but it assumes IPC is doing the real
 * crypto work in main.
 * ──────────────────────────────────────────────────────────────────
 */

'use strict';

const crypto = require('crypto');

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

const ALGORITHM      = 'aes-256-gcm';
const KEY_LENGTH     = 32;      // 256 bits
const IV_LENGTH      = 12;      // 96 bits — NIST SP 800-38D recommended for GCM
const TAG_LENGTH     = 16;      // 128 bits
const SALT_LENGTH    = 32;      // 256 bits
const PBKDF2_ITER    = 210000;  // OWASP 2023+ recommendation for SHA-512
const PBKDF2_DIGEST  = 'sha512';
const VERSION        = 1;       // bump when format changes

/* ═══════════════════════════════════════════════════════════════
   CLASS
   ═══════════════════════════════════════════════════════════════ */

class EncryptionService {
  constructor() {
    this.algorithm    = ALGORITHM;
    this.keyLength    = KEY_LENGTH;
    this.ivLength     = IV_LENGTH;
    this.tagLength    = TAG_LENGTH;
    this.saltLength   = SALT_LENGTH;
    this.iterations   = PBKDF2_ITER;
    this.digest       = PBKDF2_DIGEST;
    this.version      = VERSION;
  }

  /* ─────────────── KEY DERIVATION ─────────────── */

  /**
   * Derive a 32-byte key from a password + salt using PBKDF2-SHA512.
   * @private
   */
  _deriveKey(password, salt) {
    return crypto.pbkdf2Sync(
      password,
      salt,
      this.iterations,
      this.keyLength,
      this.digest
    );
  }

  /* ─────────────── LOW-LEVEL ENCRYPT/DECRYPT ─────────────── */

  /**
   * Encrypt a UTF-8 string with a given key + IV + AAD.
   * Returns { ciphertext, tag } as Buffers.
   * @private
   */
  _encryptString(plaintext, key, iv, aad) {
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));

    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(plaintext, 'utf8')),
      cipher.final()
    ]);

    return {
      ciphertext,
      tag: cipher.getAuthTag()
    };
  }

  /**
   * Decrypt a Buffer with a given key + IV + tag + AAD.
   * Returns UTF-8 string. Throws on auth failure.
   * @private
   */
  _decryptString(ciphertext, key, iv, tag, aad) {
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    return plaintext.toString('utf8');
  }

  /* ─────────────── API KEY ENCRYPTION ─────────────── */

  /**
   * Encrypt an API key + secret pair with AES-256-GCM.
   *
   * @param {string} apiKey
   * @param {string} apiSecret
   * @param {string} password
   * @returns {Object} serializable payload (safe to JSON.stringify)
   */
  encryptApiKeys(apiKey, apiSecret, password) {
    try {
      if (!apiKey || !apiSecret || !password) {
        throw new Error('Missing required parameters');
      }

      const salt = crypto.randomBytes(this.saltLength);
      const iv   = crypto.randomBytes(this.ivLength);
      const key  = this._deriveKey(password, salt);

      // Separate IVs for key and secret (best practice: never reuse a
      // (key, IV) pair in GCM, even within the same session).
      const ivKey    = iv;
      const ivSecret = crypto.randomBytes(this.ivLength);

      const encKey = this._encryptString(apiKey,    key, ivKey,    'api-keys');
      const encSec = this._encryptString(apiSecret, key, ivSecret, 'api-secret');

      return {
        version:            this.version,
        algorithm:          this.algorithm,

        encryptedApiKey:    encKey.ciphertext.toString('base64'),
        apiKeyTag:          encKey.tag.toString('base64'),
        apiKeyIv:           ivKey.toString('base64'),

        encryptedApiSecret: encSec.ciphertext.toString('base64'),
        apiSecretTag:       encSec.tag.toString('base64'),
        apiSecretIv:        ivSecret.toString('base64'),

        salt:               salt.toString('base64'),
        iterations:         this.iterations,
        digest:             this.digest,

        createdAt:          new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt an API key + secret pair.
   *
   * @param {Object} payload  — output of encryptApiKeys()
   * @param {string} password
   * @returns {{ apiKey: string, apiSecret: string }}
   */
  decryptApiKeys(payload, password) {
    try {
      if (!payload || !password) {
        throw new Error('Missing required parameters');
      }

      this.validateEncryptedData(payload);

      const salt = Buffer.from(payload.salt, 'base64');
      const key  = this._deriveKey(password, salt);

      const apiKey = this._decryptString(
        Buffer.from(payload.encryptedApiKey, 'base64'),
        key,
        Buffer.from(payload.apiKeyIv, 'base64'),
        Buffer.from(payload.apiKeyTag, 'base64'),
        'api-keys'
      );

      const apiSecret = this._decryptString(
        Buffer.from(payload.encryptedApiSecret, 'base64'),
        key,
        Buffer.from(payload.apiSecretIv, 'base64'),
        Buffer.from(payload.apiSecretTag, 'base64'),
        'api-secret'
      );

      return { apiKey, apiSecret };
    } catch (error) {
      if (
        error.message.includes('auth') ||
        error.message.includes('Unsupported state') ||
        error.message.includes('bad decrypt')
      ) {
        throw new Error('Invalid password or corrupted data');
      }
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /* ─────────────── GENERIC DATA ENCRYPTION ─────────────── */

  /**
   * Encrypt arbitrary JSON-serializable data.
   */
  encryptData(data, password) {
    try {
      if (data === undefined || !password) {
        throw new Error('Missing required parameters');
      }

      const salt = crypto.randomBytes(this.saltLength);
      const iv   = crypto.randomBytes(this.ivLength);
      const key  = this._deriveKey(password, salt);

      const { ciphertext, tag } = this._encryptString(
        JSON.stringify(data),
        key,
        iv,
        'general-data'
      );

      return {
        version:    this.version,
        algorithm:  this.algorithm,
        encrypted:  ciphertext.toString('base64'),
        tag:        tag.toString('base64'),
        iv:         iv.toString('base64'),
        salt:       salt.toString('base64'),
        iterations: this.iterations,
        digest:     this.digest,
        createdAt:  new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Data encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data produced by encryptData().
   */
  decryptData(payload, password) {
    try {
      if (!payload || !password) {
        throw new Error('Missing required parameters');
      }
      if (payload.algorithm !== this.algorithm) {
        throw new Error(`Unsupported algorithm: ${payload.algorithm}`);
      }

      const salt = Buffer.from(payload.salt, 'base64');
      const key  = this._deriveKey(password, salt);

      const plaintext = this._decryptString(
        Buffer.from(payload.encrypted, 'base64'),
        key,
        Buffer.from(payload.iv, 'base64'),
        Buffer.from(payload.tag, 'base64'),
        'general-data'
      );

      return JSON.parse(plaintext);
    } catch (error) {
      if (
        error.message.includes('auth') ||
        error.message.includes('Unsupported state') ||
        error.message.includes('bad decrypt')
      ) {
        throw new Error('Invalid password or corrupted data');
      }
      throw new Error(`Data decryption failed: ${error.message}`);
    }
  }

  /* ─────────────── PASSWORD UTILITIES ─────────────── */

  /**
   * Generate a cryptographically-secure random password.
   * Uses rejection sampling to avoid modulo bias.
   */
  generateSecurePassword(length = 32) {
    const charset =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
      'abcdefghijklmnopqrstuvwxyz' +
      '0123456789' +
      '!@#$%^&*()-_=+[]{}';
    const out = [];
    const max = Math.floor(256 / charset.length) * charset.length;

    while (out.length < length) {
      const byte = crypto.randomBytes(1)[0];
      if (byte < max) out.push(charset[byte % charset.length]);
    }

    return out.join('');
  }

  /**
   * One-way hash of a password for verification (not for key derivation).
   * Returns { hash, salt, iterations, digest }.
   */
  hashPassword(password, salt = null) {
    const saltBuffer = salt
      ? Buffer.from(salt, 'base64')
      : crypto.randomBytes(this.saltLength);

    const hash = crypto.pbkdf2Sync(
      password,
      saltBuffer,
      this.iterations,
      this.keyLength,
      this.digest
    );

    return {
      hash:       hash.toString('base64'),
      salt:       saltBuffer.toString('base64'),
      iterations: this.iterations,
      digest:     this.digest
    };
  }

  /**
   * Constant-time password verification.
   */
  verifyPassword(password, expectedHash, salt, iterations = this.iterations, digest = this.digest) {
    try {
      const saltBuffer = Buffer.from(salt, 'base64');
      const expected   = Buffer.from(expectedHash, 'base64');

      const computed = crypto.pbkdf2Sync(
        password,
        saltBuffer,
        iterations,
        expected.length,
        digest
      );

      return crypto.timingSafeEqual(expected, computed);
    } catch {
      return false;
    }
  }

  /* ─────────────── FINGERPRINT ─────────────── */

  /**
   * Short, stable identifier for a (password, salt) pair.
   * Useful for UX (e.g., "unlock with key 3f8a2c1e...").
   */
  getKeyFingerprint(password, salt) {
    const key = this._deriveKey(password, Buffer.from(salt, 'base64'));
    return crypto
      .createHash('sha256')
      .update(key)
      .digest('hex')
      .slice(0, 16);
  }

  /* ─────────────── MEMORY HYGIENE ─────────────── */

  /**
   * Best-effort overwrite of sensitive buffers / strings.
   * JS strings are immutable, so we can only overwrite object keys.
   */
  clearSensitiveData(obj) {
    if (typeof obj === 'string') return '';
    if (Buffer.isBuffer(obj)) { obj.fill(0); return; }
    if (obj && typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        if (typeof obj[k] === 'string') obj[k] = '';
        else if (Buffer.isBuffer(obj[k])) obj[k].fill(0);
      }
    }
  }

  /* ─────────────── VALIDATION ─────────────── */

  /**
   * Ensure an encrypted payload from disk has all required fields.
   */
  validateEncryptedData(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid encrypted payload');
    }

    const required = [
      'encryptedApiKey',
      'encryptedApiSecret',
      'apiKeyTag',
      'apiSecretTag',
      'apiKeyIv',
      'apiSecretIv',
      'salt',
      'algorithm'
    ];

    for (const field of required) {
      if (!payload[field]) throw new Error(`Missing required field: ${field}`);
    }

    if (payload.algorithm !== this.algorithm) {
      throw new Error(`Unsupported algorithm: ${payload.algorithm}`);
    }

    return true;
  }

  /* ─────────────── METADATA ─────────────── */

  getEncryptionInfo() {
    return {
      algorithm:  this.algorithm,
      keyLength:  this.keyLength,
      ivLength:   this.ivLength,
      tagLength:  this.tagLength,
      saltLength: this.saltLength,
      iterations: this.iterations,
      digest:     this.digest,
      version:    this.version
    };
  }
}

/* ═══════════════════════════════════════════════════════════════
   RENDERER-SIDE BRIDGE
   Talks to main via IPC. The actual crypto happens in main.
   ═══════════════════════════════════════════════════════════════ */

class EncryptionServiceBridge {
  constructor() {
    this.encryptionService = new EncryptionService();
    this._lockTimer = null;
  }

  /* ─────── session ─────── */

  async setPassword(password) {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Verify against existing keys if any
    const ok = await this.testPassword(password);
    if (!ok) {
      throw new Error('Incorrect password');
    }

    // Stash the password in main (it will hold it in memory)
    if (window.electronAPI?.setEncryptionPassword) {
      const res = await window.electronAPI.setEncryptionPassword(password);
      if (!res?.success) throw new Error(res?.error || 'Failed to set password');
    }

    this._scheduleAutoLock(30 * 60 * 1000);
  }

  lock() {
    if (this._lockTimer) { clearTimeout(this._lockTimer); this._lockTimer = null; }
    window.electronAPI?.lockEncryption?.();
  }

  isLocked() {
    return !window.electronAPI?.isEncryptionUnlocked;
  }

  _scheduleAutoLock(ms) {
    if (this._lockTimer) clearTimeout(this._lockTimer);
    this._lockTimer = setTimeout(() => this.lock(), ms);
  }

  /* ─────── persistence ─────── */

  async encryptAndSaveKeys(apiKey, apiSecret) {
    if (!window.electronAPI?.saveApiKeys) {
      throw new Error('IPC bridge unavailable');
    }
    return window.electronAPI.saveApiKeys({ apiKey, apiSecret });
  }

  async loadAndDecryptKeys() {
    if (!window.electronAPI?.loadApiKeys) {
      throw new Error('IPC bridge unavailable');
    }
    return window.electronAPI.loadApiKeys();
  }

  /* ─────── utilities ─────── */

  generateSecurePassword(length = 32) {
    return this.encryptionService.generateSecurePassword(length);
  }

  async testPassword(password) {
    try {
      if (!window.electronAPI?.loadApiKeys) return true;
      const encrypted = await window.electronAPI.loadApiKeys();
      if (!encrypted) return true; // no keys yet
      const res = await window.electronAPI.testEncryptionPassword?.(password);
      return res?.success !== false;
    } catch {
      return false;
    }
  }

  getEncryptionInfo() {
    return this.encryptionService.getEncryptionInfo();
  }
}

/* ═══════════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════════ */

module.exports = { EncryptionService, EncryptionServiceBridge };