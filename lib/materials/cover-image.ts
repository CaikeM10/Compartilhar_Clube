// Cover image rules shared by the admin panel (early feedback) and the server (authoritative check).
// Client-safe: no server-only imports. The server never trusts the browser's file type or name.

export const COVER_MAX_BYTES = 3 * 1024 * 1024;
export const COVER_MIN_SIDE = 200;
export const COVER_MAX_SIDE = 8000;
export const COVER_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
export type CoverContentType = keyof typeof COVER_TYPES;

/** Public path prefix of uploaded covers (stored in Material.coverImage). */
export const COVER_ROUTE = "/api/materials/covers/";
/** Content-addressed name: sha256 of the bytes plus the extension of the detected format. Nothing else is servable. */
const COVER_FILE = /^[a-f0-9]{64}\.(?:png|jpg|webp)$/;

export const isCoverContentType = (value: string): value is CoverContentType => Object.hasOwn(COVER_TYPES, value);

/** File name of an uploaded cover, or null when the value is not exactly an uploaded-cover path/name. */
export function uploadedCoverFile(value: string) {
  const file = value.startsWith(COVER_ROUTE) ? value.slice(COVER_ROUTE.length) : value;
  return COVER_FILE.test(file) ? file : null;
}
export const coverStorageKey = (file: string) => `covers/${file}`;
export function coverTypeOfFile(file: string): CoverContentType {
  return file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
}

export type CoverInfo = { contentType: CoverContentType; width: number; height: number };

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const le32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 0x1000000;

function png(b: Uint8Array): CoverInfo | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 57 || signature.some((value, i) => b[i] !== value)) return null;
  if (be32(b, 8) !== 13 || ascii(b, 12, 4) !== "IHDR") return null;
  // Complete file: ends with the IEND chunk (length 0, "IEND", fixed CRC).
  const end = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
  if (end.some((value, i) => b[b.length - 12 + i] !== value)) return null;
  return { contentType: "image/png", width: be32(b, 16), height: be32(b, 20) };
}

function jpeg(b: Uint8Array): CoverInfo | null {
  if (b.length < 128 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let last = b.length;
  while (last > 2 && b[last - 1] === 0) last--; // tolerate zero padding after the end marker
  if (b[last - 2] !== 0xff || b[last - 1] !== 0xd9) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    while (b[i] === 0xff && i < b.length) i++;
    const marker = b[i++];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) return null; // image data or end before any frame header
    const length = be16(b, i);
    if (length < 2 || i + length > b.length) return null;
    const frame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (frame) return length >= 7 ? { contentType: "image/jpeg", width: be16(b, i + 5), height: be16(b, i + 3) } : null;
    i += length;
  }
  return null;
}

function webp(b: Uint8Array): CoverInfo | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  // The RIFF size must describe exactly this file (truncated or padded uploads are refused).
  if (le32(b, 4) + 8 !== b.length) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { contentType: "image/webp", width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const width = 1 + (((b[22] & 0x3f) << 8) | b[21]);
    const height = 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6));
    return { contentType: "image/webp", width, height };
  }
  if (chunk === "VP8X") return { contentType: "image/webp", width: 1 + le24(b, 24), height: 1 + le24(b, 27) };
  return null;
}

/**
 * Identifies the image by its bytes (never by name or declared type) and checks size and dimensions.
 * Anything else (SVG, GIF, HTML, PDF, truncated or polyglot-looking files) returns null.
 */
export function inspectCoverImage(bytes: Uint8Array): CoverInfo | null {
  if (bytes.byteLength === 0 || bytes.byteLength > COVER_MAX_BYTES) return null;
  const info = png(bytes) ?? jpeg(bytes) ?? webp(bytes);
  if (!info) return null;
  const ok = [info.width, info.height].every(side => Number.isInteger(side) && side >= COVER_MIN_SIDE && side <= COVER_MAX_SIDE);
  return ok ? info : null;
}
