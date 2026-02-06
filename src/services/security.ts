import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";

import { logger } from "./logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedSecrets: Record<string, string> | null = null;

async function getSecretsFile() {
  const dbPath = process.env.DB_PATH || join(process.cwd(), "mailboxed.sqlite");
  const dataDir = dirname(dbPath);
  return join(dataDir, ".secrets.json");
}

async function loadSecrets() {
  if (cachedSecrets) return cachedSecrets;
  
  const filePath = await getSecretsFile();
  if (existsSync(filePath)) {
    try {
      const content = await readFile(filePath, "utf-8");
      cachedSecrets = JSON.parse(content);
      return cachedSecrets!;
    } catch (e) {
      // Don't log error if it's just missing
    }
  }
  
  cachedSecrets = {};
  return cachedSecrets;
}

async function saveSecrets(secrets: Record<string, string>) {
  const filePath = await getSecretsFile();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  cachedSecrets = secrets;
}

async function getMasterKey(): Promise<string> {
  const envKey = process.env.IMAP_CRED_MASTER_KEY;
  if (envKey) {
    if (envKey.length !== 64) {
      throw new Error("IMAP_CRED_MASTER_KEY must be a 64-character hex string (32 bytes)");
    }
    return envKey;
  }

  const secrets = await loadSecrets();
  if (secrets.imap_cred_master_key) {
    return secrets.imap_cred_master_key;
  }

  // Generate new key
  const newKey = randomBytes(32).toString("hex");
  secrets.imap_cred_master_key = newKey;
  await saveSecrets(secrets);
  logger.info("Generated new IMAP_CRED_MASTER_KEY and saved to .secrets.json");

  return newKey;
}

async function getAppSecret(): Promise<string> {
  const envKey = process.env.APP_SECRET;
  if (envKey) {
    return envKey;
  }

  const secrets = await loadSecrets();
  if (secrets.app_secret) {
    return secrets.app_secret;
  }

  // Generate new secret
  const newSecret = randomBytes(32).toString("hex");
  secrets.app_secret = newSecret;
  await saveSecrets(secrets);
  logger.info("Generated new APP_SECRET and saved to .secrets.json");

  return newSecret;
}

export async function getAppSecretValue(): Promise<string> {
  return await getAppSecret();
}

/**
 * Hash a password using Argon2id via Bun's built-in password API.
 */
export async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, "argon2id");
}

/**
 * Verify a password against a hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

/**
 * Encrypt a string using AES-256-GCM.
 * Uses IMAP_CRED_MASTER_KEY from environment or stored in DB.
 */
export async function encrypt(text: string): Promise<string> {
  const masterKey = await getMasterKey();
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
export async function decrypt(encryptedData: string): Promise<string> {
  const masterKey = await getMasterKey();
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
