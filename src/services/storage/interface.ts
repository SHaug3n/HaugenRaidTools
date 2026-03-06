import { Readable } from 'node:stream';

export interface StorageBackend {
  /** Store a file from a readable stream. Returns byte count written. */
  put(key: string, data: Readable): Promise<{ size: number }>;

  /** Retrieve a file as a readable stream with optional size metadata. */
  get(key: string): Promise<{ stream: Readable; size?: number }>;

  /** Delete a file. No-op if the file doesn't exist. */
  delete(key: string): Promise<void>;

  /**
   * Generate a presigned upload URL (S3 only).
   * Returns null when the client should upload through the API instead.
   */
  generateUploadUrl(key: string, contentType: string, expiresInSec: number): Promise<string | null>;

  /**
   * Generate a presigned download URL (S3 only).
   * Returns null when the API should stream the file directly.
   */
  generateDownloadUrl(key: string, expiresInSec: number): Promise<string | null>;
}
