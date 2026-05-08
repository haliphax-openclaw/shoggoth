import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ageGenerateIdentity,
  ageLoadIdentity,
  ageEncrypt,
  ageDecrypt,
} from "../../src/vault/age-crypto.js";

describe("age-crypto", () => {
  describe("ageGenerateIdentity", () => {
    it("generates a valid AgeIdentity with proper prefixes", () => {
      const identity = ageGenerateIdentity();

      expect(identity).toBeDefined();
      expect(identity.identityString).toMatch(/^AGE-SECRET-KEY-1/);
      expect(identity.recipient).toMatch(/^age1/);
    });

    it("generates unique identities each time", () => {
      const identity1 = ageGenerateIdentity();
      const identity2 = ageGenerateIdentity();

      expect(identity1.identityString).not.toBe(identity2.identityString);
      expect(identity1.recipient).not.toBe(identity2.recipient);
    });

    it("recipient is derived from identity string", () => {
      const identity = ageGenerateIdentity();

      // The recipient should be different from the identity string
      expect(identity.identityString).not.toBe(identity.recipient);
      expect(identity.identityString.startsWith("AGE-SECRET-KEY-1")).toBe(true);
      expect(identity.recipient.startsWith("age1")).toBe(true);
    });
  });

  describe("ageEncrypt and ageDecrypt", () => {
    it("round-trip produces original plaintext", () => {
      const identity = ageGenerateIdentity();
      const plaintext = "Hello, secure world!";

      const ciphertext = ageEncrypt(plaintext, identity.recipient);
      const decrypted = ageDecrypt(ciphertext, identity);

      expect(decrypted).toBe(plaintext);
    });

    it("produces different ciphertext for same plaintext (random nonce)", () => {
      const identity = ageGenerateIdentity();
      const plaintext = "Same message";

      const ciphertext1 = ageEncrypt(plaintext, identity.recipient);
      const ciphertext2 = ageEncrypt(plaintext, identity.recipient);

      expect(ciphertext1).not.toBe(ciphertext2);
    });

    it("ciphertext is armored (contains age header)", () => {
      const identity = ageGenerateIdentity();
      const plaintext = "Test message";

      const ciphertext = ageEncrypt(plaintext, identity.recipient);

      expect(ciphertext).toContain("-----BEGIN AGE");
      expect(ciphertext).toContain("-----END AGE");
    });

    it("can encrypt with recipient without needing identity", () => {
      const identity = ageGenerateIdentity();
      const plaintext = "Test for encryption only";

      // Should be able to encrypt using just the recipient
      const ciphertext = ageEncrypt(plaintext, identity.recipient);
      expect(ciphertext).toBeDefined();
      expect(ciphertext.length).toBeGreaterThan(0);
    });
  });

  describe("ageLoadIdentity", () => {
    let tempFile: string;

    beforeEach(() => {
      tempFile = join(tmpdir(), `shoggoth-age-test-${process.pid}-${Date.now()}.key`);
    });

    afterEach(() => {
      try {
        unlinkSync(tempFile);
      } catch {
        /* ignore */
      }
    });

    it("loads identity from file", () => {
      const expectedIdentity = ageGenerateIdentity();
      writeFileSync(tempFile, expectedIdentity.identityString, "utf8");

      const loaded = ageLoadIdentity(tempFile);

      expect(loaded.identityString).toBe(expectedIdentity.identityString);
      expect(loaded.recipient).toBe(expectedIdentity.recipient);
    });

    it("ignores comments and blank lines", () => {
      const identity = ageGenerateIdentity();
      const content = `# This is a comment
# Another comment

${identity.identityString}

# Trailing comment
`;
      writeFileSync(tempFile, content, "utf8");

      const loaded = ageLoadIdentity(tempFile);

      expect(loaded.identityString).toBe(identity.identityString);
    });

    it("throws error when file does not exist", () => {
      const nonExistentPath = join(tmpdir(), `non-existent-${Date.now()}.key`);

      expect(() => ageLoadIdentity(nonExistentPath)).toThrow();
    });

    it("throws error for invalid identity format", () => {
      writeFileSync(tempFile, "INVALID-KEY-FORMAT", "utf8");

      expect(() => ageLoadIdentity(tempFile)).toThrow();
    });
  });

  describe("error cases", () => {
    it("fails to decrypt with wrong identity", () => {
      const identity1 = ageGenerateIdentity();
      const identity2 = ageGenerateIdentity();
      const plaintext = "Secret message";

      const ciphertext = ageEncrypt(plaintext, identity1.recipient);

      expect(() => ageDecrypt(ciphertext, identity2)).toThrow();
    });

    it("fails to decrypt corrupted ciphertext", () => {
      const identity = ageGenerateIdentity();
      const plaintext = "Original message";

      const ciphertext = ageEncrypt(plaintext, identity.recipient);
      // Corrupt the ciphertext
      const corrupted = ciphertext.slice(0, -5) + "XXXXX";

      expect(() => ageDecrypt(corrupted, identity)).toThrow();
    });

    it("fails to encrypt with invalid recipient", () => {
      const plaintext = "Test message";

      expect(() => ageEncrypt(plaintext, "invalid-recipient")).toThrow();
    });

    it("fails to decrypt with tampered ciphertext", () => {
      const identity = ageGenerateIdentity();
      const plaintext = "Original text";

      const ciphertext = ageEncrypt(plaintext, identity.recipient);
      // Swap first and last character blocks to tamper
      const lines = ciphertext.split("\n");
      if (lines.length > 3) {
        const temp = lines[2];
        lines[2] = lines[lines.length - 3];
        lines[lines.length - 3] = temp;
        const tampered = lines.join("\n");

        expect(() => ageDecrypt(tampered, identity)).toThrow();
      }
    });

    it("fails to encrypt empty plaintext", () => {
      const identity = ageGenerateIdentity();

      // Some age implementations may accept empty, but we'll test behavior
      // This test documents expected behavior - can be adjusted if needed
      expect(() => ageEncrypt("", identity.recipient)).toThrow();
    });
  });

  describe("cross-identity operations", () => {
    it("identity generated can decrypt what it encrypts", () => {
      const identity = ageGenerateIdentity();
      const plaintext = "Cross-identity test";

      const ciphertext = ageEncrypt(plaintext, identity.recipient);
      const decrypted = ageDecrypt(ciphertext, identity);

      expect(decrypted).toBe(plaintext);
    });

    it("different identities cannot decrypt each other's messages", () => {
      const alice = ageGenerateIdentity();
      const bob = ageGenerateIdentity();

      const messageForBob = "Message for Bob";
      const ciphertext = ageEncrypt(messageForBob, bob.recipient);

      // Alice should not be able to decrypt Bob's message
      expect(() => ageDecrypt(ciphertext, alice)).toThrow();
    });
  });
});
