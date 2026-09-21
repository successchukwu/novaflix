import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'

const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET = process.env.R2_BUCKET || 'novaflix'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

let _client = null

const BASE_TIMEOUT_MS = Number(process.env.UPLOAD_BASE_TIMEOUT_MS) || 30_000
const MS_PER_MB = Number(process.env.UPLOAD_MS_PER_MB) || 2_000
const IO_TIMEOUT_MS = 15 * 1000
const MULTIPART_THRESHOLD = (Number(process.env.R2_MULTIPART_THRESHOLD_MB) || 100) * 1024 * 1024
const MULTIPART_PART_SIZE = (Number(process.env.R2_MULTIPART_PART_SIZE_MB) || 8) * 1024 * 1024

function withTimeout(ms) {
  return { abortSignal: AbortSignal.timeout(ms) }
}

function timeoutForBytes(bytes) {
  if (!bytes || bytes <= 0) return BASE_TIMEOUT_MS + 60_000
  const mb = bytes / (1024 * 1024)
  return BASE_TIMEOUT_MS + Math.ceil(mb * MS_PER_MB)
}

function getClient() {
  if (_client) return _client
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null
  _client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
  return _client
}

export async function uploadFile({ buffer, key, contentType }) {
  const client = getClient()
  if (!client) {
    return { success: false, error: 'Storage not configured' }
  }
  const bytes = buffer?.length || buffer?.byteLength || 0
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
        ...withTimeout(timeoutForBytes(bytes)),
      })
    )
    const url = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : `${R2_ENDPOINT}/${R2_BUCKET}/${key}`
    return { success: true, url }
  } catch (err) {
    console.error('[r2] Upload error:', err.message)
    return { success: false, error: err.message }
  }
}

export async function uploadStream({ filePath, key, contentType, fileSize }) {
  const client = getClient()
  if (!client) return { success: false, error: 'Storage not configured' }
  let size = fileSize
  if (!size && filePath) {
    try { size = (await stat(filePath)).size } catch {}
  }
  // Use multipart for large files
  if (size && size > MULTIPART_THRESHOLD) {
    return uploadMultipart({ filePath, key, contentType, fileSize: size })
  }
  try {
    const stream = createReadStream(filePath)
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: stream,
        ContentType: contentType || 'application/octet-stream',
        ...withTimeout(timeoutForBytes(size)),
      })
    )
    const url = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : `${R2_ENDPOINT}/${R2_BUCKET}/${key}`
    return { success: true, url }
  } catch (err) {
    console.error('[r2] Stream upload error:', err.message)
    return { success: false, error: err.message }
  }
}

export async function uploadMultipart({ filePath, key, contentType, fileSize }) {
  const client = getClient()
  if (!client) return { success: false, error: 'Storage not configured' }
  try {
    const stream = createReadStream(filePath)
    const upload = new Upload({
      client,
      params: {
        Bucket: R2_BUCKET,
        Key: key,
        Body: stream,
        ContentType: contentType || 'application/octet-stream',
      },
      partSize: MULTIPART_PART_SIZE,
      queueSize: 4,
      leavePartsOnError: false,
    })
    // Extend abort timeout for large uploads
    const timeoutMs = timeoutForBytes(fileSize)
    const timer = setTimeout(() => {
      try { upload.abort() } catch {}
    }, timeoutMs)
    await upload.done()
    clearTimeout(timer)
    const url = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : `${R2_ENDPOINT}/${R2_BUCKET}/${key}`
    return { success: true, url }
  } catch (err) {
    console.error('[r2] Multipart upload error:', err.message)
    return { success: false, error: err.message }
  }
}

export async function deleteFile(key) {
  const client = getClient()
  if (!client) return { success: false, error: 'Storage not configured' }
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ...withTimeout(IO_TIMEOUT_MS),
      })
    )
    return { success: true }
  } catch (err) {
    console.error('[r2] Delete error:', err.message)
    return { success: false, error: err.message }
  }
}

// Stream an object supporting HTTP Range requests (for video seeking).
export async function streamFile(key, rangeHeader) {
  const client = getClient()
  if (!client) return { success: false, error: 'Storage not configured' }
  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Range: rangeHeader,
      ...withTimeout(IO_TIMEOUT_MS),
    })
    const { Body, ContentLength, ContentType, ContentRange } = await client.send(command)
    return {
      success: true,
      stream: Body,
      contentLength: ContentLength,
      contentType: ContentType,
      contentRange: ContentRange,
    }
  } catch (err) {
    console.error('[r2] Read error:', err.message)
    return { success: false, error: err.message }
  }
}

export function isConfigured() {
  return !!getClient()
}
