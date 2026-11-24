import { Data } from "effect";

/** Which verification a bundle failed (see src/store/bundle.ts `readBundle`). */
export type BundleCheck =
  | "json"
  | "schema"
  | "canonical"
  | "name"
  | "configDigest"
  | "hardwareId"
  | "executions"
  | "duplicate";

/** A bundle file failed one of the verifying reader's re-derivations. */
export class BundleInvalid extends Data.TaggedError("BundleInvalid")<{
  readonly path: string;
  readonly check: BundleCheck;
  readonly detail: string;
}> {
  override get message(): string {
    return `${this.path}: ${this.check}: ${this.detail}`;
  }
}

/** Sealing found a different file already stored under the bundle's digest. */
export class BundleConflict extends Data.TaggedError("BundleConflict")<{
  readonly path: string;
}> {
  override get message(): string {
    return `${this.path} exists with different bytes`;
  }
}

/** A release directory failed a re-derivation: an undecodable file or a blob whose bytes do not hash to its name. */
export class ReleaseInvalid extends Data.TaggedError("ReleaseInvalid")<{
  readonly path: string;
  readonly detail: string;
}> {
  override get message(): string {
    return `${this.path}: ${this.detail}`;
  }
}

/** A snapshot build failed: a file under the snapshot's digest with other bytes, a malformed index, or evidence the dataset cannot use. */
export class SnapshotInvalid extends Data.TaggedError("SnapshotInvalid")<{
  readonly path: string;
  readonly detail: string;
}> {
  override get message(): string {
    return `${this.path}: ${this.detail}`;
  }
}
