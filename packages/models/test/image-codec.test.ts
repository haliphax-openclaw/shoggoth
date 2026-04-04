import { describe, it, expect } from "vitest";
import {
  openaiImageBlockCodec,
  anthropicImageBlockCodec,
  geminiImageBlockCodec,
  getImageBlockCodec,
  wrapCodecWithCapabilities,
} from "../src/image-codec";
import type { ImageBlock, ModelCapabilities } from "../src/types";

const MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

function base64Block(mediaType: string): ImageBlock {
  return { type: "image", mediaType, base64: "AAAA" };
}

function urlBlock(mediaType: string): ImageBlock {
  return { type: "image", mediaType, url: "https://example.com/img.png" };
}

function bothBlock(mediaType: string): ImageBlock {
  return {
    type: "image",
    mediaType,
    base64: "AAAA",
    url: "https://example.com/img.png",
  };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible codec
// ---------------------------------------------------------------------------
describe("openaiImageBlockCodec", () => {
  it("supportsUrl is true", () => {
    expect(openaiImageBlockCodec.supportsUrl).toBe(true);
  });

  for (const mime of MIME_TYPES) {
    it(`round-trips base64 encode/decode for ${mime}`, () => {
      const block = base64Block(mime);
      const wire = openaiImageBlockCodec.encode(block);
      const decoded = openaiImageBlockCodec.decode(wire);
      expect(decoded).toEqual(block);
    });
  }

  it("encodes URL-only block as image_url with plain URL", () => {
    const block = urlBlock("image/png");
    const wire = openaiImageBlockCodec.encode(block) as Record<string, unknown>;
    expect(wire).toEqual({
      type: "image_url",
      image_url: { url: "https://example.com/img.png" },
    });
  });

  it("prefers URL when both base64 and url are present", () => {
    const block = bothBlock("image/png");
    const wire = openaiImageBlockCodec.encode(block) as Record<string, unknown>;
    expect(wire).toEqual({
      type: "image_url",
      image_url: { url: "https://example.com/img.png" },
    });
  });

  it("decode returns null for non-image parts", () => {
    expect(openaiImageBlockCodec.decode({ type: "text", text: "hi" })).toBeNull();
    expect(openaiImageBlockCodec.decode("string")).toBeNull();
    expect(openaiImageBlockCodec.decode(null)).toBeNull();
    expect(openaiImageBlockCodec.decode(42)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Anthropic Messages codec
// ---------------------------------------------------------------------------
describe("anthropicImageBlockCodec", () => {
  it("supportsUrl is true", () => {
    expect(anthropicImageBlockCodec.supportsUrl).toBe(true);
  });

  for (const mime of MIME_TYPES) {
    it(`round-trips base64 encode/decode for ${mime}`, () => {
      const block = base64Block(mime);
      const wire = anthropicImageBlockCodec.encode(block);
      const decoded = anthropicImageBlockCodec.decode(wire);
      expect(decoded).toEqual(block);
    });
  }

  it("encodes URL-only block with source.type url", () => {
    const block = urlBlock("image/png");
    const wire = anthropicImageBlockCodec.encode(block) as Record<string, unknown>;
    expect(wire).toEqual({
      type: "image",
      source: { type: "url", url: "https://example.com/img.png" },
    });
  });

  it("prefers URL when both base64 and url are present", () => {
    const block = bothBlock("image/jpeg");
    const wire = anthropicImageBlockCodec.encode(block) as Record<string, unknown>;
    expect(wire).toEqual({
      type: "image",
      source: { type: "url", url: "https://example.com/img.png" },
    });
  });

  it("decode returns null for non-image parts", () => {
    expect(anthropicImageBlockCodec.decode({ type: "text", text: "hi" })).toBeNull();
    expect(anthropicImageBlockCodec.decode("string")).toBeNull();
    expect(anthropicImageBlockCodec.decode(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Gemini codec
// ---------------------------------------------------------------------------
describe("geminiImageBlockCodec", () => {
  it("supportsUrl is false", () => {
    expect(geminiImageBlockCodec.supportsUrl).toBe(false);
  });

  for (const mime of MIME_TYPES) {
    it(`round-trips base64 encode/decode for ${mime}`, () => {
      const block = base64Block(mime);
      const wire = geminiImageBlockCodec.encode(block);
      const decoded = geminiImageBlockCodec.decode(wire);
      expect(decoded).toEqual(block);
    });
  }

  it("throws on URL-only block (no base64)", () => {
    const block = urlBlock("image/png");
    expect(() => geminiImageBlockCodec.encode(block)).toThrow(
      /requires base64/,
    );
  });

  it("encodes block with both base64 and url using base64", () => {
    const block = bothBlock("image/webp");
    const wire = geminiImageBlockCodec.encode(block) as Record<string, unknown>;
    expect(wire).toEqual({
      inlineData: { mimeType: "image/webp", data: "AAAA" },
    });
  });

  it("decode returns null for non-image parts", () => {
    expect(geminiImageBlockCodec.decode({ text: "hi" })).toBeNull();
    expect(geminiImageBlockCodec.decode("string")).toBeNull();
    expect(geminiImageBlockCodec.decode(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getImageBlockCodec registry
// ---------------------------------------------------------------------------
describe("getImageBlockCodec", () => {
  it("returns openai codec", () => {
    expect(getImageBlockCodec("openai-compatible")).toBe(openaiImageBlockCodec);
  });

  it("returns anthropic codec", () => {
    expect(getImageBlockCodec("anthropic-messages")).toBe(anthropicImageBlockCodec);
  });

  it("returns gemini codec", () => {
    expect(getImageBlockCodec("gemini")).toBe(geminiImageBlockCodec);
  });

  it("throws for unknown kind", () => {
    expect(() => getImageBlockCodec("unknown" as never)).toThrow(/Unknown/);
  });
});

// ---------------------------------------------------------------------------
// wrapCodecWithCapabilities
// ---------------------------------------------------------------------------
describe("wrapCodecWithCapabilities", () => {
  const block = base64Block("image/png");

  it("returns original codec when imageInput is true", () => {
    const capabilities: ModelCapabilities = { imageInput: true };
    const wrapped = wrapCodecWithCapabilities(openaiImageBlockCodec, capabilities);
    expect(wrapped).toBe(openaiImageBlockCodec);
  });

  it("returns original codec when imageInput is undefined", () => {
    const capabilities: ModelCapabilities = {};
    const wrapped = wrapCodecWithCapabilities(openaiImageBlockCodec, capabilities);
    expect(wrapped).toBe(openaiImageBlockCodec);
  });

  it("returns wrapped codec when imageInput is false", () => {
    const capabilities: ModelCapabilities = { imageInput: false };
    const wrapped = wrapCodecWithCapabilities(openaiImageBlockCodec, capabilities);
    expect(wrapped).not.toBe(openaiImageBlockCodec);
  });

  it("throws when encoding with imageInput: false", () => {
    const capabilities: ModelCapabilities = { imageInput: false };
    const wrapped = wrapCodecWithCapabilities(openaiImageBlockCodec, capabilities);
    expect(() => wrapped.encode(block)).toThrow(/does not support image input/);
  });

  it("preserves supportsUrl from original codec", () => {
    const capabilities: ModelCapabilities = { imageInput: false };
    const wrapped = wrapCodecWithCapabilities(openaiImageBlockCodec, capabilities);
    expect(wrapped.supportsUrl).toBe(true);
  });

  it("sets supportsImageInput to false when wrapped", () => {
    const capabilities: ModelCapabilities = { imageInput: false };
    const wrapped = wrapCodecWithCapabilities(openaiImageBlockCodec, capabilities);
    expect(wrapped.supportsImageInput).toBe(false);
  });

  it("delegates decode to original codec", () => {
    const capabilities: ModelCapabilities = { imageInput: false };
    const wrapped = wrapCodecWithCapabilities(openaiImageBlockCodec, capabilities);
    const wire = { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } };
    expect(wrapped.decode(wire)).toEqual(block);
  });

  it("works with anthropic codec", () => {
    const capabilities: ModelCapabilities = { imageInput: false };
    const wrapped = wrapCodecWithCapabilities(anthropicImageBlockCodec, capabilities);
    expect(() => wrapped.encode(block)).toThrow(/does not support image input/);
  });

  it("works with gemini codec", () => {
    const capabilities: ModelCapabilities = { imageInput: false };
    const wrapped = wrapCodecWithCapabilities(geminiImageBlockCodec, capabilities);
    expect(() => wrapped.encode(block)).toThrow(/does not support image input/);
  });
});