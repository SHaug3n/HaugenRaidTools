import { Readable } from 'node:stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageBackend } from './interface.js';

export interface S3StorageConfig {
  bucket: string;
  endpoint?: string;
  accessKey: string;
  secretKey: string;
  region?: string;
  forcePathStyle?: boolean;
}

export class S3Storage implements StorageBackend {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(cfg: S3StorageConfig) {
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      region: cfg.region ?? 'us-east-1',
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle ?? !!cfg.endpoint, // Required for MinIO
      credentials: {
        accessKeyId: cfg.accessKey,
        secretAccessKey: cfg.secretKey,
      },
    });
  }

  async put(key: string, data: Readable): Promise<{ size: number }> {
    // Collect the stream into a buffer because the S3 SDK needs content-length
    // for non-multipart uploads. For large files, consider multipart upload.
    const chunks: Buffer[] = [];
    for await (const chunk of data) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'video/mp4',
      }),
    );

    return { size: body.length };
  }

  async get(key: string): Promise<{ stream: Readable; size?: number }> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      stream: response.Body as Readable,
      size: response.ContentLength,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async generateUploadUrl(
    key: string,
    contentType: string,
    expiresInSec: number,
  ): Promise<string | null> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSec });
  }

  async generateDownloadUrl(
    key: string,
    expiresInSec: number,
  ): Promise<string | null> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSec });
  }
}
