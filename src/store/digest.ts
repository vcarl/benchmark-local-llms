/**
 * Digest helpers. Every identity is a full SHA-256 as 64 lowercase hex
 * characters; JSON preimages are `stableStringify` (sorted keys, no
 * whitespace, no undefined values).
 */
import { createHash } from "node:crypto";
import { stableStringify } from "../config/hashing.js";

export const sha256Hex = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

export const digestOf = (value: unknown): string => sha256Hex(stableStringify(value));
