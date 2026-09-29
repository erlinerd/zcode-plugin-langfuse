import type { JsonValue } from "./types.js";

// Kept character-for-character compatible with the Langfuse span processor's
// own media detector: only URIs this module decides to preserve can be
// uploaded and swapped for media refs. Created per call — a shared /g regex
// leaks lastIndex between calls and silently skips matches.
const DATA_URI_SOURCE = "data:[^;]+;base64,[A-Za-z0-9+/]+=*";

function newDataUriPattern(): RegExp {
  return new RegExp(DATA_URI_SOURCE, "g");
}

const TRUNCATION_MARKER = "… [truncated]";

export function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= TRUNCATION_MARKER.length) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
}

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;
const BASE64_IMAGE_KEYS = new Set(["img", "image", "image_data", "imageData"]);

function toDataUri(data: string, mimeType: string): string {
  return `data:${mimeType};base64,${data}`;
}

/**
 * ZCode delivers images either as content blocks ({type:"image", data,
 * mimeType}) or as bare base64 under img/image keys; the Langfuse processor
 * only detects `data:` URIs, so both shapes are rewritten into data-URI
 * strings before anything else touches the payload.
 */
export function normalizeImageBlocks(value: JsonValue): JsonValue {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(normalizeImageBlocks);
  if (isRecord(value)) {
    if (value.type === "image" && typeof value.data === "string") {
      if (BASE64_BODY.test(value.data)) {
        const mimeType =
          typeof value.mimeType === "string" && value.mimeType
            ? value.mimeType
            : "image/png";
        return toDataUri(value.data, mimeType);
      }
      if (value.data.startsWith("data:")) return value.data;
    }
    const result: { [key: string]: JsonValue } = {};
    for (const [key, item] of Object.entries(value)) {
      if (
        BASE64_IMAGE_KEYS.has(key.toLowerCase()) &&
        typeof item === "string" &&
        BASE64_BODY.test(item)
      ) {
        result[key] = toDataUri(item, "image/png");
      } else {
        result[key] = normalizeImageBlocks(item);
      }
    }
    return result;
  }
  return value;
}

function mimeOf(dataUri: string): string {
  const match = /^data:([^;]+);/.exec(dataUri);
  return match?.[1] ?? "unknown";
}

function kiloBytes(dataUri: string): number {
  const base64Start = dataUri.indexOf(";base64,");
  const payload = base64Start === -1 ? "" : dataUri.slice(base64Start + 8);
  return Math.floor((payload.length * 3) / 4 / 1024);
}

/**
 * Bounds one string under the capture budget while keeping whole data URIs
 * intact: preserved media is capped by maxMediaChars (its own privacy lever,
 * so images survive the much smaller maxCaptureChars that shapes text);
 * everything else truncates exactly as before. Media over budget becomes an
 * explicit omission marker instead of a corrupt half-URI.
 */
export function boundStringWithMedia(
  value: string,
  maxChars: number,
  maxMediaChars: number,
): string {
  if (maxMediaChars <= 0) return truncateText(value, maxChars);
  const matches = [...value.matchAll(newDataUriPattern())];
  if (matches.length === 0) return truncateText(value, maxChars);

  let output = "";
  let last = 0;
  let keptMediaChars = 0;
  for (const match of matches) {
    const start = match.index ?? 0;
    const uri = match[0];
    output += truncateText(value.slice(last, start), maxChars);
    if (keptMediaChars + uri.length <= maxMediaChars) {
      output += uri;
      keptMediaChars += uri.length;
    } else {
      output += `[media ${mimeOf(uri)} ~${kiloBytes(uri)}KB omitted]`;
    }
    last = start + uri.length;
  }
  output += truncateText(value.slice(last), maxChars);
  return output;
}

export function containsMedia(value: JsonValue): boolean {
  if (typeof value === "string")
    return new RegExp(DATA_URI_SOURCE).test(value);
  if (Array.isArray(value)) return value.some(containsMedia);
  if (isRecord(value)) return Object.values(value).some(containsMedia);
  return false;
}

/**
 * Media-aware replacement for the previous boundedValue: payloads that fit
 * maxCaptureChars pass through (with image blocks normalized); larger ones
 * collapse to their serialized string, which keeps whole data URIs alive
 * while the surrounding text stays bounded.
 */
export function boundValuePreservingMedia(
  value: JsonValue,
  maxChars: number,
  maxMediaChars: number,
): JsonValue {
  const normalized = normalizeImageBlocks(value);
  const serialized = JSON.stringify(normalized) ?? "null";
  if (serialized.length <= maxChars) return normalized;
  if (maxMediaChars <= 0) return truncateText(serialized, maxChars);
  return boundStringWithMedia(serialized, maxChars, maxMediaChars);
}
