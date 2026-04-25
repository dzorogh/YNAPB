import { describe, it, expect, beforeAll } from "vitest";

import { encryptToken, decryptToken } from "./crypto";

describe("crypto", () => {
  beforeAll(() => {
    // 32 zero bytes, base64
    process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
  });

  it("round-trips a token", async () => {
    const plaintext = "ynab_pat_abc123";
    const { ciphertext, iv } = await encryptToken(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(iv).toMatch(/^[A-Za-z0-9+/=]+$/);
    const decrypted = await decryptToken(ciphertext, iv);
    expect(decrypted).toBe(plaintext);
  });

  it("uses a fresh IV each call", async () => {
    const a = await encryptToken("same");
    const b = await encryptToken("same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects ciphertext modified after encryption (auth tag check)", async () => {
    const { ciphertext, iv } = await encryptToken("hello");
    const tampered = Buffer.from(ciphertext, "base64");
    const firstByte = tampered.at(0);
    if (firstByte === undefined) {
      throw new Error("Ciphertext buffer is unexpectedly empty");
    }
    tampered[0] = firstByte ^ 0xff;
    await expect(
      decryptToken(tampered.toString("base64"), iv),
    ).rejects.toThrow();
  });

  it("throws if ENCRYPTION_KEY is missing", async () => {
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    try {
      await expect(encryptToken("x")).rejects.toThrow(/ENCRYPTION_KEY/);
    } finally {
      process.env.ENCRYPTION_KEY = original;
    }
  });
});
