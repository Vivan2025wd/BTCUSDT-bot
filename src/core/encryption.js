// src/core/encryption.js
'use strict';

const crypto = require('crypto');

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

const ALGORITHM     = 'aes-256-gcm';
const KEY_LENGTH    = 32;        // 256 bits
const IV_LENGTH     = 12;        // 96 bits — NIST recommended for GCM
const TAG_LENGTH    = 16;        // 128 bits
const SALT_LENGTH   = 32;        // 256 bits
const PBKDF2_ITER   = 210000;    // OWASP 2023+ for SHA-512
const PBKDF2_DIGEST = 'sha512';
const VERSION       = 1;

/* ═══════════════════════════════════════════════════════════════
   ENCRYPTION SERVICE (main process only)
   ═══════════════════════════════════════════════════════════════ */

class EncryptionService {
  constructor() {
    this.algorithm  = ALGORITHM;
    this.keyLength  = KEY_LENGTH;
    this.ivLength   = IV_LENGTH;
    this.tagLength  = TAG_LENGTH;
    this.saltLength = SALT_LENGTH;
    this.iterations = PBKDF2_ITER;
    this.digest     = PBKDF2_DIGEST;
    this.version    = VERSION;
  }

  /* ─── KEY DERIVATION ─── */

  _deriveKey(password, salt) {
    return crypto.pbkdf2Sync(
      password,
      salt,
      this.iterations,
      this.keyLength,
      this.digest
    );
  }

  /* ─── LOW-LEVEL ─── */

  _encrypt(plaintext, key, iv, aad) {
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(plaintext, 'utf8')),
      cipher.final()
    ]);
    return { ciphertext, tag: cipher.getAuthTag() };
  }

  _decrypt(ciphertext, key, iv, tag, aad) {
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]).toString('utf8');
  }

  /* ─── API KEY PAIR ─── */

  encryptApiKeys(apiKey, apiSecret, password) {
    if (!apiKey || !apiSecret || !password) {
      throw new Error('encryptApiKeys: missing apiKey/apiSecret/password');
    }

    const salt = crypto.randomBytes(this.saltLength);
    const key  = this._deriveKey(password, salt);

    // Separate IVs — GCM must never reuse (key, IV)
    const ivKey    = crypto.randomBytes(this.ivLength);
    const ivSecret = crypto.randomBytes(this.ivLength);

    const encKey = this._encrypt(apiKey,    key, ivKey,    'api-keys');
    const encSec = this._encrypt(apiSecret, key, ivSecret, 'api-secret');

    return {
      version:    this.version,
      algorithm:  this.algorithm,

      encryptedApiKey:    encKey.ciphertext.toString('base64'),
      apiKeyTag:          encKey.tag.toString('base64'),
      apiKeyIv:           ivKey.toString('base64'),

      encryptedApiSecret: encSec.ciphertext.toString('base64'),
      apiSecretTag:       encSec.tag.toString('base64'),
      apiSecretIv:        ivSecret.toString('base64'),

      salt:       salt.toString('base64'),
      iterations: this.iterations,
      digest:     this.digest,
      createdAt:  new Date().toISOString()
    };
  }

  decryptApiKeys(payload, password) {
    if (!payload || !password) {
      throw new Error('decryptApiKeys: missing payload/password');
    }

    this.validateEncryptedData(payload);

    const salt = Buffer.from(payload.salt, 'base64');
    const key  = this._deriveKey(password, salt);

    const apiKey = this._decrypt(
      Buffer.from(payload.encryptedApiKey, 'base64'),
      key,
      Buffer.from(payload.apiKeyIv, 'base64'),
      Buffer.from(payload.apiKeyTag, 'base64'),
      'api-keys'
    );

    const apiSecret = this._decrypt(
      Buffer.from(payload.encryptedApiSecret, 'base64'),
      key,
      Buffer.from(payload.apiSecretIv, 'base64'),
      Buffer.from(payload.apiSecretTag, 'base64'),
      'api-secret'
    );

    return { apiKey, apiSecret };
  }

  /* ─── GENERIC JSON ─── */

  encryptData(data, password) {
    if (data === undefined || !password) {
      throw new Error('encryptData: missing data/password');
    }

    const salt = crypto.randomBytes(this.saltLength);
    const iv   = crypto.randomBytes(this.ivLength);
    const key  = this._deriveKey(password, salt);

    const { ciphertext, tag } = this._encrypt(
      JSON.stringify(data), key, iv, 'general-data'
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
  }

  decryptData(payload, password) {
    if (!payload || !password) {
      throw new Error('decryptData: missing payload/password');
    }
    if (payload.algorithm !== this.algorithm) {
      throw new Error(`decryptData: unsupported algorithm ${payload.algorithm}`);
    }

    const salt = Buffer.from(payload.salt, 'base64');
    const key  = this._deriveKey(password, salt);

    const plaintext = this._decrypt(
      Buffer.from(payload.encrypted, 'base64'),
      key,
      Buffer.from(payload.iv, 'base64'),
      Buffer.from(payload.tag, 'base64'),
      'general-data'
    );

    return JSON.parse(plaintext);
  }

  /* ─── PASSWORD UTILS ─── */

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

  hashPassword(password, salt = null) {
    const saltBuffer = salt
      ? Buffer.from(salt, 'base64')
      : crypto.randomBytes(this.saltLength);

    const hash = crypto.pbkdf2Sync(
      password, saltBuffer, this.iterations, this.keyLength, this.digest
    );

    return {
      hash:       hash.toString('base64'),
      salt:       saltBuffer.toString('base64'),
      iterations: this.iterations,
      digest:     this.digest
    };
  }

  verifyPassword(password, expectedHash, salt, iterations = this.iterations, digest = this.digest) {
    try {
      const expected = Buffer.from(expectedHash, 'base64');
      const computed = crypto.pbkdf2Sync(
        password,
        Buffer.from(salt, 'base64'),
        iterations,
        expected.length,
        digest
      );
      return crypto.timingSafeEqual(expected, computed);
    } catch {
      return false;
    }
  }

  /* ─── MISC ─── */

  getKeyFingerprint(password, salt) {
    const key = this._deriveKey(password, Buffer.from(salt, 'base64'));
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  }

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

  validateEncryptedData(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('validateEncryptedData: not an object');
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
      if (!payload[field]) {
        throw new Error(`validateEncryptedData: missing "${field}"`);
      }
    }

    if (payload.algorithm !== this.algorithm) {
      throw new Error(`validateEncryptedData: unsupported algorithm ${payload.algorithm}`);
    }

    return true;
  }

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
   EXPORTS
   ═══════════════════════════════════════════════════════════════ */

module.exports = { EncryptionService };