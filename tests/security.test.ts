import { expect, test, describe } from "bun:test";
import { hashPassword, verifyPassword, encrypt, decrypt } from "../src/services/security";

describe("Security Service", () => {
  describe("Password Hashing", () => {
    test("should hash and verify passwords", async () => {
      const password = "mysecretpassword";
      const hash = await hashPassword(password);
      
      expect(hash).not.toBe(password);
      expect(await verifyPassword(password, hash)).toBe(true);
      expect(await verifyPassword("wrongpassword", hash)).toBe(false);
    });
  });

  describe("IMAP Credential Encryption", () => {
    test("should encrypt and decrypt strings", async () => {
      // Use the key set in beforeAll/env
      process.env.IMAP_CRED_MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      
      const secret = "imap-password-123";
      const encrypted = await encrypt(secret);
      
      expect(encrypted).not.toBe(secret);
      expect(encrypted.split(":")).toHaveLength(3);
      
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(secret);
    });

    test("should throw error if master key is invalid", async () => {
      const originalKey = process.env.IMAP_CRED_MASTER_KEY;
      
      process.env.IMAP_CRED_MASTER_KEY = "too-short";
      // We need to use try-catch or rejects because it's async
      try {
        await encrypt("test");
        expect(true).toBe(false); // Should not reach here
      } catch (e: any) {
        expect(e.message).toContain("IMAP_CRED_MASTER_KEY must be a 64-character hex string");
      }
      
      process.env.IMAP_CRED_MASTER_KEY = originalKey;
    });

    test("should generate and use a key if env is missing", async () => {
        const originalKey = process.env.IMAP_CRED_MASTER_KEY;
        delete process.env.IMAP_CRED_MASTER_KEY;
        
        // Ensure no leftovers from previous tests
        const fs = require('fs');
        const path = require('path');
        const secretsFile = path.join(process.cwd(), ".secrets.json");
        if (fs.existsSync(secretsFile)) fs.unlinkSync(secretsFile);

        const secret = "another-secret";
        const encrypted = await encrypt(secret);
        const decrypted = await decrypt(encrypted);
        expect(decrypted).toBe(secret);
        
        expect(fs.existsSync(secretsFile)).toBe(true);

        process.env.IMAP_CRED_MASTER_KEY = originalKey;
        if (fs.existsSync(secretsFile)) fs.unlinkSync(secretsFile);
    });
  });
});
