import { webcrypto } from "node:crypto";

const ALGO = "AES-GCM";
const IV_BYTES = 12;

function getKeyBytes(): Uint8Array {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY env var is not set");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to 32 bytes (AES-256)");
  }
  return new Uint8Array(bytes);
}

async function importKey(): Promise<CryptoKey> {
  return webcrypto.subtle.importKey(
    "raw",
    getKeyBytes(),
    { name: ALGO },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptToken(
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importKey();
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await webcrypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: Buffer.from(ct).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
  };
}

export async function decryptToken(
  ciphertext: string,
  iv: string,
): Promise<string> {
  const key = await importKey();
  const pt = await webcrypto.subtle.decrypt(
    { name: ALGO, iv: new Uint8Array(Buffer.from(iv, "base64")) },
    key,
    new Uint8Array(Buffer.from(ciphertext, "base64")),
  );
  return new TextDecoder().decode(pt);
}
