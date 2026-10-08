const crypto = require('crypto');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 32; // 256 bits
    this.iterations = 100000; // PBKDF2 iterations
  }

  /**
   * Derive encryption key from password using PBKDF2
   */
  deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, this.iterations, this.keyLength, 'sha512');
  }

  /**
   * Encrypt API keys with AES-256-GCM
   */
  encryptApiKeys(apiKey, apiSecret, password) {
    try {
      if (!apiKey || !apiSecret || !password) {
        throw new Error('Missing required parameters');
      }

      // Generate random salt and IV
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      
      // Derive encryption key
      const key = this.deriveKey(password, salt);
      
      // Create cipher
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(Buffer.from('api-keys')); // Additional authenticated data
      
      // Encrypt API key
      const apiKeyData = Buffer.from(apiKey, 'utf8');
      let encryptedApiKey = cipher.update(apiKeyData);
      encryptedApiKey = Buffer.concat([encryptedApiKey, cipher.final()]);
      const apiKeyTag = cipher.getAuthTag();
      
      // Create new cipher for secret
      const cipher2 = crypto.createCipher(this.algorithm, key);
      cipher2.setAAD(Buffer.from('api-secret'));
      
      // Encrypt API secret
      const apiSecretData = Buffer.from(apiSecret, 'utf8');
      let encryptedApiSecret = cipher2.update(apiSecretData);
      encryptedApiSecret = Buffer.concat([encryptedApiSecret, cipher2.final()]);
      const apiSecretTag = cipher2.getAuthTag();
      
      return {
        encryptedApiKey: encryptedApiKey.toString('base64'),
        encryptedApiSecret: encryptedApiSecret.toString('base64'),
        apiKeyTag: apiKeyTag.toString('base64'),
        apiSecretTag: apiSecretTag.toString('base64'),
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        algorithm: this.algorithm,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt API keys
   */
  decryptApiKeys(encryptedData, password) {
    try {
      if (!encryptedData || !password) {
        throw new Error('Missing required parameters');
      }

      const {
        encryptedApiKey,
        encryptedApiSecret,
        apiKeyTag,
        apiSecretTag,
        salt,
        iv,
        algorithm
      } = encryptedData;

      if (algorithm !== this.algorithm) {
        throw new Error('Unsupported encryption algorithm');
      }

      // Convert from base64
      const saltBuffer = Buffer.from(salt, 'base64');
      const ivBuffer = Buffer.from(iv, 'base64');
      const encryptedApiKeyBuffer = Buffer.from(encryptedApiKey, 'base64');
      const encryptedApiSecretBuffer = Buffer.from(encryptedApiSecret, 'base64');
      const apiKeyTagBuffer = Buffer.from(apiKeyTag, 'base64');
      const apiSecretTagBuffer = Buffer.from(apiSecretTag, 'base64');
      
      // Derive decryption key
      const key = this.deriveKey(password, saltBuffer);
      
      // Decrypt API key
      const decipher = crypto.createDecipher(algorithm, key);
      decipher.setAAD(Buffer.from('api-keys'));
      decipher.setAuthTag(apiKeyTagBuffer);
      
      let decryptedApiKey = decipher.update(encryptedApiKeyBuffer);
      decryptedApiKey = Buffer.concat([decryptedApiKey, decipher.final()]);
      
      // Decrypt API secret
      const decipher2 = crypto.createDecipher(algorithm, key);
      decipher2.setAAD(Buffer.from('api-secret'));
      decipher2.setAuthTag(apiSecretTagBuffer);
      
      let decryptedApiSecret = decipher2.update(encryptedApiSecretBuffer);
      decryptedApiSecret = Buffer.concat([decryptedApiSecret, decipher2.final()]);
      
      return {
        apiKey: decryptedApiKey.toString('utf8'),
        apiSecret: decryptedApiSecret.toString('utf8')
      };
      
    } catch (error) {
      console.error('Decryption error:', error);
      if (error.message.includes('bad decrypt') || error.message.includes('auth')) {
        throw new Error('Invalid password or corrupted data');
      }
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate secure random password
   */
  generateSecurePassword(length = 32) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      password += charset[randomIndex];
    }
    
    return password;
  }

  /**
   * Hash password for verification (not for encryption key derivation)
   */
  hashPassword(password, salt = null) {
    const saltBuffer = salt || crypto.randomBytes(this.saltLength);
    const hash = crypto.pbkdf2Sync(password, saltBuffer, this.iterations, this.keyLength, 'sha512');
    
    return {
      hash: hash.toString('base64'),
      salt: saltBuffer.toString('base64')
    };
  }

  /**
   * Verify password against hash
   */
  verifyPassword(password, hash, salt) {
    try {
      const saltBuffer = Buffer.from(salt, 'base64');
      const hashBuffer = Buffer.from(hash, 'base64');
      const computedHash = crypto.pbkdf2Sync(password, saltBuffer, this.iterations, this.keyLength, 'sha512');
      
      return crypto.timingSafeEqual(hashBuffer, computedHash);
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  /**
   * Encrypt general data (for configuration, etc.)
   */
  encryptData(data, password) {
    try {
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      const key = this.deriveKey(password, salt);
      
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(Buffer.from('general-data'));
      
      const dataBuffer = Buffer.from(JSON.stringify(data), 'utf8');
      let encrypted = cipher.update(dataBuffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      const tag = cipher.getAuthTag();
      
      return {
        encrypted: encrypted.toString('base64'),
        tag: tag.toString('base64'),
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        algorithm: this.algorithm,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Data encryption error:', error);
      throw new Error(`Data encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt general data
   */
  decryptData(encryptedData, password) {
    try {
      const { encrypted, tag, salt, iv, algorithm } = encryptedData;
      
      if (algorithm !== this.algorithm) {
        throw new Error('Unsupported encryption algorithm');
      }

      const saltBuffer = Buffer.from(salt, 'base64');
      const ivBuffer = Buffer.from(iv, 'base64');
      const encryptedBuffer = Buffer.from(encrypted, 'base64');
      const tagBuffer = Buffer.from(tag, 'base64');
      
      const key = this.deriveKey(password, saltBuffer);
      
      const decipher = crypto.createDecipher(algorithm, key);
      decipher.setAAD(Buffer.from('general-data'));
      decipher.setAuthTag(tagBuffer);
      
      let decrypted = decipher.update(encryptedBuffer);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return JSON.parse(decrypted.toString('utf8'));
      
    } catch (error) {
      console.error('Data decryption error:', error);
      if (error.message.includes('bad decrypt') || error.message.includes('auth')) {
        throw new Error('Invalid password or corrupted data');
      }
      throw new Error(`Data decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate encryption key fingerprint for verification
   */
  getKeyFingerprint(password, salt) {
    const saltBuffer = Buffer.from(salt, 'base64');
    const key = this.deriveKey(password, saltBuffer);
    return crypto.createHash('sha256').update(key).digest('base64').substring(0, 16);
  }

  /**
   * Secure memory cleanup (best effort)
   */
  clearSensitiveData(obj) {
    if (typeof obj === 'string') {
      // For strings, we can't actually clear memory in JS, but we can overwrite references
      return '';
    } else if (Buffer.isBuffer(obj)) {
      obj.fill(0);
    } else if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          if (typeof obj[key] === 'string') {
            obj[key] = '';
          } else if (Buffer.isBuffer(obj[key])) {
            obj[key].fill(0);
          }
        }
      }
    }
  }

  /**
   * Validate encryption integrity
   */
  validateEncryptedData(encryptedData) {
    const requiredFields = [
      'encryptedApiKey', 'encryptedApiSecret', 
      'apiKeyTag', 'apiSecretTag', 
      'salt', 'iv', 'algorithm'
    ];
    
    for (const field of requiredFields) {
      if (!encryptedData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    if (encryptedData.algorithm !== this.algorithm) {
      throw new Error(`Unsupported algorithm: ${encryptedData.algorithm}`);
    }
    
    return true;
  }

  /**
   * Get encryption metadata
   */
  getEncryptionInfo() {
    return {
      algorithm: this.algorithm,
      keyLength: this.keyLength,
      ivLength: this.ivLength,
      tagLength: this.tagLength,
      saltLength: this.saltLength,
      iterations: this.iterations,
      version: '1.0.0'
    };
  }
}

// Frontend bridge for Electron renderer process
class EncryptionServiceBridge {
  constructor() {
    this.encryptionService = new EncryptionService();
    this.currentPassword = null;
    this.isUnlocked = false;
  }

  async setPassword(password) {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    
    this.currentPassword = password;
    this.isUnlocked = true;
    
    // Clear password from memory after 30 minutes of inactivity
    setTimeout(() => {
      this.lock();
    }, 30 * 60 * 1000);
  }

  lock() {
    if (this.currentPassword) {
      this.currentPassword = null;
    }
    this.isUnlocked = false;
  }

  isLocked() {
    return !this.isUnlocked;
  }

  async encryptAndSaveKeys(apiKey, apiSecret) {
    if (!this.isUnlocked) {
      throw new Error('Encryption service is locked');
    }

    const encrypted = this.encryptionService.encryptApiKeys(apiKey, apiSecret, this.currentPassword);
    
    if (window.electronAPI) {
      const result = await window.electronAPI.saveApiKeys(encrypted);
      if (!result.success) {
        throw new Error(result.error);
      }
    }
    
    return encrypted;
  }

  async loadAndDecryptKeys() {
    if (!this.isUnlocked) {
      throw new Error('Encryption service is locked');
    }

    let encrypted;
    if (window.electronAPI) {
      encrypted = await window.electronAPI.loadApiKeys();
    }
    
    if (!encrypted) {
      return null;
    }

    return this.encryptionService.decryptApiKeys(encrypted, this.currentPassword);
  }

  generateSecurePassword(length = 32) {
    return this.encryptionService.generateSecurePassword(length);
  }

  async testPassword(password) {
    try {
      if (window.electronAPI) {
        const encrypted = await window.electronAPI.loadApiKeys();
        if (!encrypted) {
          return true; // No keys to test against
        }
        
        this.encryptionService.decryptApiKeys(encrypted, password);
        return true;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  getEncryptionInfo() {
    return this.encryptionService.getEncryptionInfo();
  }
}

// Export both classes
module.exports = {
  EncryptionService,
  EncryptionServiceBridge
};