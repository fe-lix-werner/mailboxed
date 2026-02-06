import * as argon2 from "argon2";
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Hash a password using Argon2.
 */
export async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password);
}

/**
 * Verify a password against a hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await argon2.verify(hash, password);
}

/**
 * Encrypt a string using AES-256-GCM.
 * Uses IMAP_CRED_MASTER_KEY from environment.
 */
export function encrypt(text: string): string {
  const masterKey = process.env.IMAP_CRED_MASTER_KEY;
  if (!masterKey || masterKey.length !== 64) {
    throw new Error("IMAP_CRED_MASTER_KEY must be a 64-character hex string (32 bytes)");
  }

  const key = Buffer.from(masterKey, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  // Combine IV + AuthTag + EncryptedData
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a string using AES-256-GCM.
 */
export function decrypt(encryptedData: string): string {
  const masterKey = process.env.IMAP_CRED_MASTER_KEY;
  if (!masterKey || masterKey.length !== 64) {
    throw new Error("IMAP_CRED_MASTER_KEY must be a 64-character hex string (32 bytes)");
  }

  const key = Buffer.from(masterKey, "hex");
  const [ivHex, tagHex, dataHex] = encryptedData.split(":");

  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid encrypted data format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(tag);

  let decrypted = decipher.update(dataHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
