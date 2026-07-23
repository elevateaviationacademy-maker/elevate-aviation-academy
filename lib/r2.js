import { S3Client } from "@aws-sdk/client-s3";

// Cloudflare R2 speaks the S3 API. Storage is free up to 10GB, and unlike
// AWS S3 / most providers, R2 does NOT charge for bandwidth (egress) at all,
// which is what makes it usable for serving video/PDF to students for free.
export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  // Required for R2: without this, the AWS SDK defaults to virtual-hosted-style
  // URLs (bucket name prefixed onto the hostname, e.g. bucket.account.r2...),
  // which R2's TLS certificate doesn't cover — the browser then fails the
  // handshake with ERR_SSL_VERSION_OR_CIPHER_MISMATCH on the actual upload.
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export const BUCKET = process.env.R2_BUCKET_NAME;
