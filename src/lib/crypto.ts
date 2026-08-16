import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// Agent-tokens (gateway-tokens, bot-tokens, Meta access tokens) staan versleuteld
// in de database. Ze worden alleen server-side ontsleuteld op het moment dat er
// daadwerkelijk een verbinding gelegd wordt — ze gaan nooit naar de browser.

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "APP_SECRET ontbreekt of is te kort. Genereer er een met `openssl rand -base64 32` en zet hem in .env",
    );
  }
  // Vaste salt: de sleutel moet deterministisch zijn, anders is data na een
  // herstart niet meer te ontsleutelen.
  cachedKey = scryptSync(secret, "bhmgmt-hq-secretbox", 32);
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/// Toont een token als `1234…cdef` zodat je in de UI kunt zien wélk token er
/// staat, zonder het geheim prijs te geven.
export function maskSecret(plain: string): string {
  if (plain.length <= 8) return "••••";
  return `${plain.slice(0, 4)}…${plain.slice(-4)}`;
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
