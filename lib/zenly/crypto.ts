import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function getKey() {
  const secret = process.env.ZENLY_TOKEN_SECRET;
  if (!secret) {
    throw new Error("ZENLY_TOKEN_SECRET is not set");
  }
  return createHash("sha256").update(secret).digest();
}

export function isTokenCryptoConfigured() {
  return Boolean(process.env.ZENLY_TOKEN_SECRET);
}

export function encryptToken(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptToken(payload: string) {
  const [iv, tag, data] = payload.split(".");
  if (!iv || !tag || !data) {
    throw new Error("Malformed encrypted token");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
