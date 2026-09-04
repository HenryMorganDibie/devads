import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage client written against the plain S3 API (works against
 * MinIO locally via S3_ENDPOINT + S3_FORCE_PATH_STYLE, and against real
 * AWS S3 in production by pointing S3_ENDPOINT at nothing / unsetting it --
 * swapping providers is a config change, not a code change).
 */
export const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "devads",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "devads123",
  },
});

export const BUCKET = process.env.S3_BUCKET ?? "devads-creatives";

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const ALLOWED_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25MB

export interface UploadValidationError {
  error: string;
}

export function validateCreativeUpload(
  mimeType: string,
  sizeBytes: number,
  kind: "IMAGE" | "VIDEO"
): UploadValidationError | null {
  const allowed = kind === "IMAGE" ? ALLOWED_IMAGE_MIME_TYPES : ALLOWED_VIDEO_MIME_TYPES;
  const maxBytes = kind === "IMAGE" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;

  if (!allowed.has(mimeType)) {
    return { error: `unsupported_mime_type: ${mimeType} is not an allowed ${kind.toLowerCase()} type` };
  }
  if (sizeBytes > maxBytes) {
    return { error: `file_too_large: max ${maxBytes} bytes for ${kind.toLowerCase()}` };
  }
  return null;
}

function extensionForMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return map[mimeType] ?? "bin";
}

/** Uploads a validated creative file buffer and returns its storage key. */
export async function uploadCreativeFile(
  campaignId: string,
  mimeType: string,
  body: Buffer
): Promise<string> {
  const key = `creatives/${campaignId}/${randomUUID()}.${extensionForMimeType(mimeType)}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: mimeType,
    })
  );
  return key;
}

/** Signed, time-limited URL for a stored creative -- never exposes the bucket publicly. */
export async function getCreativeUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

export async function ensureBucketExists(): Promise<void> {
  const { CreateBucketCommand, HeadBucketCommand } = await import("@aws-sdk/client-s3");
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
}
