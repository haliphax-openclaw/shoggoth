import { describe, it, expect } from "vitest";
import type { ChatContentPart } from "@shoggoth/models";
import { extractOutboundImages } from "../../src/presentation/image-outbound.js";

describe("extractOutboundImages", () => {
  it("returns unchanged text and empty attachments for string content", () => {
    const result = extractOutboundImages("hello world");
    expect(result.textContent).toBe("hello world");
    expect(result.imageAttachments).toEqual([]);
  });

  it("returns empty text and empty attachments for null content", () => {
    const result = extractOutboundImages(null);
    expect(result.textContent).toBe("");
    expect(result.imageAttachments).toEqual([]);
  });

  it("extracts text from ChatContentPart[] with only text parts", () => {
    const parts: ChatContentPart[] = [
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
    ];
    const result = extractOutboundImages(parts);
    expect(result.textContent).toBe("Hello world");
    expect(result.imageAttachments).toEqual([]);
  });

  it("decodes base64 image to correct bytes and generates filename", () => {
    const raw = Buffer.from("fake-png-bytes");
    const parts: ChatContentPart[] = [
      {
        type: "image",
        mediaType: "image/png",
        base64: raw.toString("base64"),
      },
    ];
    const result = extractOutboundImages(parts);
    expect(result.textContent).toBe("");
    expect(result.imageAttachments).toHaveLength(1);
    expect(result.imageAttachments[0]!.filename).toBe("image-0.png");
    expect(result.imageAttachments[0]!.mediaType).toBe("image/png");
    expect(Buffer.compare(result.imageAttachments[0]!.bytes, raw)).toBe(0);
  });

  it("handles mixed text + base64 image parts", () => {
    const imgBytes = Buffer.from("jpeg-data");
    const parts: ChatContentPart[] = [
      { type: "text", text: "Before " },
      {
        type: "image",
        mediaType: "image/jpeg",
        base64: imgBytes.toString("base64"),
      },
      { type: "text", text: " After" },
    ];
    const result = extractOutboundImages(parts);
    expect(result.textContent).toBe("Before  After");
    expect(result.imageAttachments).toHaveLength(1);
    expect(result.imageAttachments[0]!.filename).toBe("image-0.jpg");
    expect(result.imageAttachments[0]!.mediaType).toBe("image/jpeg");
    expect(Buffer.compare(result.imageAttachments[0]!.bytes, imgBytes)).toBe(0);
  });

  it("replaces URL-only image with [image] placeholder", () => {
    const parts: ChatContentPart[] = [
      { type: "text", text: "See: " },
      {
        type: "image",
        mediaType: "image/webp",
        url: "https://example.com/img.webp",
      },
    ];
    const result = extractOutboundImages(parts);
    expect(result.textContent).toBe("See: [image]");
    expect(result.imageAttachments).toEqual([]);
  });

  it("indexes multiple base64 images sequentially", () => {
    const parts: ChatContentPart[] = [
      {
        type: "image",
        mediaType: "image/png",
        base64: Buffer.from("a").toString("base64"),
      },
      {
        type: "image",
        mediaType: "image/gif",
        base64: Buffer.from("b").toString("base64"),
      },
    ];
    const result = extractOutboundImages(parts);
    expect(result.imageAttachments).toHaveLength(2);
    expect(result.imageAttachments[0]!.filename).toBe("image-0.png");
    expect(result.imageAttachments[1]!.filename).toBe("image-1.gif");
  });

  it("falls back to .png extension for unknown media type", () => {
    const parts: ChatContentPart[] = [
      {
        type: "image",
        mediaType: "image/bmp",
        base64: Buffer.from("x").toString("base64"),
      },
    ];
    const result = extractOutboundImages(parts);
    expect(result.imageAttachments[0]!.filename).toBe("image-0.png");
  });

  it("handles empty ChatContentPart array", () => {
    const result = extractOutboundImages([]);
    expect(result.textContent).toBe("");
    expect(result.imageAttachments).toEqual([]);
  });

  it("URL-only images do not increment the image index for base64 filenames", () => {
    const parts: ChatContentPart[] = [
      {
        type: "image",
        mediaType: "image/png",
        url: "https://example.com/a.png",
      },
      {
        type: "image",
        mediaType: "image/jpeg",
        base64: Buffer.from("data").toString("base64"),
      },
    ];
    const result = extractOutboundImages(parts);
    expect(result.textContent).toBe("[image]");
    expect(result.imageAttachments).toHaveLength(1);
    // Index is 0 because URL-only images don't increment imageIndex
    expect(result.imageAttachments[0]!.filename).toBe("image-0.jpg");
  });
});
