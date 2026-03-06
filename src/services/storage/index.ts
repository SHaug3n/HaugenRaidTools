import { config } from '../../config.js';
import type { StorageBackend } from './interface.js';
import { LocalDiskStorage } from './local.js';
import { S3Storage } from './s3.js';

let instance: StorageBackend | null = null;

export async function getStorage(): Promise<StorageBackend> {
  if (instance) return instance;

  if (config.storageBackend === 's3') {
    if (!config.s3AccessKey || !config.s3SecretKey) {
      throw new Error('S3_ACCESS_KEY and S3_SECRET_KEY are required when STORAGE_BACKEND=s3');
    }
    instance = new S3Storage({
      bucket: config.s3Bucket,
      endpoint: config.s3Endpoint,
      accessKey: config.s3AccessKey,
      secretKey: config.s3SecretKey,
      region: config.s3Region,
    });
  } else {
    const local = new LocalDiskStorage(config.storageLocalPath);
    await local.init();
    instance = local;
  }

  return instance;
}

export type { StorageBackend } from './interface.js';
