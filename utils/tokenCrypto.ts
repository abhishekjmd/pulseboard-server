import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

const getEncryptionKey = () => {
  const configuredKey = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!configuredKey) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY is not configured");
  }

  const base64Key = Buffer.from(configuredKey, "base64");
  if (base64Key.length === KEY_LENGTH) {
    return base64Key;
  }

  const utf8Key = Buffer.from(configuredKey, "utf8");
  if (utf8Key.length === KEY_LENGTH) {
    return utf8Key;
  }

  throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be 32 bytes or base64-encoded 32 bytes");
};

export const encryptToken = (token: string) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted].map((part) => part.toString("base64url")).join(".");
};

export const decryptToken = (encryptedToken: string) => {
  const [ivPart, authTagPart, encryptedPart] = encryptedToken.split(".");
  if (!ivPart || !authTagPart || !encryptedPart) {
    throw new Error("Invalid encrypted token format");
  }

  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(authTagPart, "base64url");
  const encrypted = Buffer.from(encryptedPart, "base64url");
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
};