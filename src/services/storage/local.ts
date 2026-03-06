import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { StorageBackend } from './interface.js';

export class LocalDiskStorage implements StorageBackend {
  constructor(private readonly basePath: string) {}

  async init(): Promise<void> {
    await fsp.mkdir(this.basePath, { recursive: true });
  }

  private fullPath(key: string): string {
    // Prevent path traversal
    const normalized = path.normalize(key).replace(/^(\.\.[/\\])+/, '');
    return path.join(this.basePath, normalized);
  }

  async put(key: string, data: Readable): Promise<{ size: number }> {
    const dest = this.fullPath(key);
    await fsp.mkdir(path.dirname(dest), { recursive: true });

    const writeStream = fs.createWriteStream(dest);
    await pipeline(data, writeStream);

    const stat = await fsp.stat(dest);
    return { size: stat.size };
  }

  async get(key: string): Promise<{ stream: Readable; size?: number }> {
    const filePath = this.fullPath(key);
    const stat = await fsp.stat(filePath);
    const stream = fs.createReadStream(filePath);
    return { stream, size: stat.size };
  }

  async delete(key: string): Promise<void> {
    const filePath = this.fullPath(key);
    try {
      await fsp.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async generateUploadUrl(): Promise<string | null> {
    return null; // Local storage uses the API upload endpoint
  }

  async generateDownloadUrl(): Promise<string | null> {
    return null; // Local storage streams through the API
  }
}
