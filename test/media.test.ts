import { describe, expect, it } from "vitest";
import {
  boundStringWithMedia,
  boundValuePreservingMedia,
  containsMedia,
  normalizeImageBlocks,
} from "../src/domain/media.js";
import type { JsonValue } from "../src/domain/types.js";

// A data URI that is complete but far larger than a small text budget.
function dataUri(chars: number): string {
  return `data:image/png;base64,${"A".repeat(chars)}`;
}

describe("normalizeImageBlocks", () => {
  it("converts image content blocks into data URIs", () => {
    const value: JsonValue = {
      content: [
        { type: "text", text: "screenshot" },
        { type: "image", data: "aGVsbG8=", mimeType: "image/jpeg" },
      ],
    };
    expect(normalizeImageBlocks(value)).toEqual({
      content: [
        { type: "text", text: "screenshot" },
        "data:image/jpeg;base64,aGVsbG8=",
      ],
    });
  });

  it("converts bare img fields carrying base64 into data URIs", () => {
    const value: JsonValue = { img: "aGVsbG8=", note: "kept" };
    expect(normalizeImageBlocks(value)).toEqual({
      img: "data:image/png;base64,aGVsbG8=",
      note: "kept",
    });
  });

  it("leaves ordinary strings and non-image blocks untouched", () => {
    const value: JsonValue = {
      type: "text",
      data: "not-base64!!",
      nested: { list: ["plain", 1, null] },
    };
    expect(normalizeImageBlocks(value)).toEqual(value);
  });
});

describe("boundStringWithMedia", () => {
  it("preserves a whole data URI that exceeds the text budget", () => {
    const uri = dataUri(300);
    const bounded = boundStringWithMedia(`before ${uri} after`, 50, 1000);
    expect(bounded).toContain(uri);
    expect(bounded.startsWith("before ")).toBe(true);
    expect(bounded.endsWith(" after")).toBe(true);
    expect(bounded).not.toContain("… [truncated]");
  });

  it("replaces media over the media budget with an omission marker", () => {
    const uri = dataUri(300);
    const bounded = boundStringWithMedia(`look ${uri}`, 50, 100);
    expect(bounded).not.toContain(uri);
    expect(bounded).toContain("[media image/png ~0KB omitted]");
  });

  it("still truncates plain strings without media", () => {
    const bounded = boundStringWithMedia("x".repeat(100), 20, 1000);
    expect(bounded.length).toBeLessThanOrEqual(20);
    expect(bounded).toContain("… [truncated]");
  });

  it("degrades to plain truncation when media is disabled", () => {
    const uri = dataUri(300);
    const bounded = boundStringWithMedia(`look ${uri}`, 50, 0);
    expect(bounded).not.toContain(uri);
    expect(bounded.length).toBeLessThanOrEqual(50);
  });
});

describe("boundValuePreservingMedia", () => {
  it("keeps structured payloads that fit the budget", () => {
    const value: JsonValue = { exitCode: 0 };
    expect(boundValuePreservingMedia(value, 200, 1000)).toEqual(value);
  });

  it("keeps an oversized payload as a media-preserving string", () => {
    const uri = dataUri(300);
    const value: JsonValue = { output: uri, text: "y".repeat(200) };
    const bounded = boundValuePreservingMedia(value, 100, 1000);
    expect(typeof bounded).toBe("string");
    expect(bounded as string).toContain(uri);
    expect(bounded as string).toContain("… [truncated]");
  });

  it("truncates oversized payloads when media is disabled", () => {
    const uri = dataUri(300);
    const value: JsonValue = { output: uri };
    const bounded = boundValuePreservingMedia(value, 60, 0);
    expect(bounded as string).not.toContain(uri);
    expect((bounded as string).length).toBeLessThanOrEqual(60);
  });
});

describe("containsMedia", () => {
  it("detects data URIs nested anywhere in the payload", () => {
    const value: JsonValue = {
      a: [{ b: { c: `prefix ${dataUri(10)}` } }],
    };
    expect(containsMedia(value)).toBe(true);
    expect(containsMedia({ plain: "no media here" })).toBe(false);
  });
});
