import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const execFileAsync = promisify(execFile)

// Prefer bundled binary fallback bin/yt-dlp, otherwise system yt-dlp
const YT_DLP =
  (fs.existsSync(path.join(__dirname, '..', 'bin', 'yt-dlp')) && path.join(__dirname, '..', 'bin', 'yt-dlp')) ||
  process.env.YT_DLP_PATH ||
  'yt-dlp'

// MAX 100MB per file as required
const MAX_FILESIZE = '100M'
const MAX_BYTES = 100 * 1024 * 1024

// medium quality (height<=720)
const HEIGHT = 720
const FORMAT = `bv*[height<=${HEIGHT}]+ba/b[height<=${HEIGHT}]/b`

export function getYtDlpBinary() {
  return YT_DLP
}

export function getMaxFileSize() {
  return MAX_FILESIZE
}

/**
 * Probe YouTube URL metadata without downloading.
 * Uses execFile with yt-dlp --dump-json
 */
export async function probe(url) {
  const args = ['--skip-download', '--no-playlist', '--no-warnings', '--dump-json', url]
  try {
    const { stdout } = await execFileAsync(YT_DLP, args, { maxBuffer: 10 * 1024 * 1024 })
    const json = JSON.parse(stdout.toString().trim())
    return {
      id: json.id || null,
      title: json.title || '',
      thumbnail: json.thumbnail || '',
      duration: json.duration || 0,
      height: json.height || null,
      formats: json.formats || [],
    }
  } catch (err) {
    throw new Error(`yt-dlp probe failed: ${err.message?.slice(0, 400)}`)
  }
}

/**
 * Download YouTube video at medium quality with MAX 100MB limit.
 * Uses execFile, --max-filesize 100M, --merge-output-format mp4, height<=720
 */
export async function download(url, outputPath, opts = {}) {
  const height = opts.height || HEIGHT
  const format = opts.format || `bv*[height<=${height}]+ba/b[height<=${height}]/b`
  const tmpDir = path.dirname(outputPath)
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

  const args = [
    '-f', format,
    '--max-filesize', MAX_FILESIZE,
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--no-warnings',
    '--retries', '3',
    '--fragment-retries', '5',
    '-o', outputPath,
    url,
  ]

  try {
    const { stdout, stderr } = await execFileAsync(YT_DLP, args, { maxBuffer: 20 * 1024 * 1024, timeout: 120000 })
    // Verify file exists and size constraint
    if (!fs.existsSync(outputPath)) {
      throw new Error(`yt-dlp download failed: output not found ${stderr?.slice(-200)}`)
    }
    const stat = fs.statSync(outputPath)
    if (stat.size > MAX_BYTES) {
      fs.unlinkSync(outputPath)
      throw new Error(`File exceeds MAX 100MB limit (${(stat.size / 1024 / 1024).toFixed(1)}MB)`)
    }
    return { success: true, path: outputPath, size: stat.size, stdout: stdout?.slice(-500) }
  } catch (err) {
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath) } catch {}
    }
    throw new Error(`yt-dlp download failed: ${err.message?.slice(0, 600)}`)
  }
}

/**
 * Download trailer for a YouTube ID at medium quality.
 * Convenience wrapper for seeding.
 */
export async function downloadTrailer(youtubeIdOrUrl, destDir = os.tmpdir()) {
  const url = youtubeIdOrUrl.startsWith('http') ? youtubeIdOrUrl : `https://www.youtube.com/watch?v=${youtubeIdOrUrl}`
  const out = path.join(destDir, `yt-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`)
  return download(url, out, { height: HEIGHT, format: FORMAT })
}

export default { probe, download, downloadTrailer, getYtDlpBinary, getMaxFileSize, MAX_FILESIZE: MAX_FILESIZE, HEIGHT }
