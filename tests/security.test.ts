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
    test("should encrypt and decrypt strings", () => {
      // Use the key set in beforeAll/env
      process.env.IMAP_CRED_MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      
      const secret = "imap-password-123";
      const encrypted = encrypt(secret);
      
      expect(encrypted).not.toBe(secret);
      expect(encrypted.split(":")).toHaveLength(3);
      
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(secret);
    });

    test("should throw error if master key is missing or invalid", () => {
      const originalKey = process.env.IMAP_CRED_MASTER_KEY;
      
      process.env.IMAP_CRED_MASTER_KEY = "";
      expect(() => encrypt("test")).toThrow();
      
      process.env.IMAP_CRED_MASTER_KEY = "too-short";
      expect(() => encrypt("test")).toThrow();
      
      process.env.IMAP_CRED_MASTER_KEY = originalKey;
    });
  });
});
