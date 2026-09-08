import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import { getStreamUrl } from '../scraper.mjs'
import { cacheClear, cacheStats } from '../providers/cache.js'
import { reportFailure, reportSuccess } from '../providers/providerHealth.js'
import { getActiveSessionCount, getUploadById, listActiveSessions, ensureDownloadDevice } from '../db.js'
import crypto from 'crypto'
import { streamFile } from '../lib/r2.js'
import { PLAN_FEATURES } from './planUtils.js'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DOWNLOADS_DIR = path.join(__dirname, '..', 'download')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

// Persistent event logger for movie/TV streaming observability (file-based 24/7)
const LOG_DIR = path.join(os.homedir(), '.novaflix', 'logs')
const LOG_FILE = path.join(LOG_DIR, 'events.jsonl')
try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true }) } catch {}
function logToFile(event) {
  try {
    event.timestamp = Date.now()
    event.hostname = os.hostname()
    event.pid = process.pid
    const line = JSON.stringify(event) + '\n'
    fs.appendFileSync(LOG_FILE, line, { flag: 'a' })
    try {
      const content = fs.readFileSync(LOG_FILE, 'utf-8')
      const lines = content.trim().split('\n')
      if (lines.length > 10000) fs.writeFileSync(LOG_FILE, lines.slice(-10000).join('\n'), 'utf-8')
    } catch {}
  } catch (e) { console.debug('log-to-file error:', e.message) }
}

// Audio probe via ffprobe — verifies first audio segment is decodable (stable movie/TV audio)
async function probeAudioSegment(streamUrl) {
  return new Promise((resolve) => {
    const args = ['-v','error','-select_streams','a:0','-show_entries','stream=codec_name,channels,sample_rate','-show_entries','format=duration','-of','json','-read_intervals','%+0.5','-i', streamUrl]
    const proc = spawn('ffprobe', args)
    let stdout='', stderr=''
    proc.stdout.on('data', (d)=>{ stdout+=d })
    proc.stderr.on('data', (d)=>{ stderr+=d })
    proc.on('close', (code)=>{
      if(code!==0) return resolve({ ok:false, error: stderr.slice(0,200) })
      try { const data=JSON.parse(stdout); const hasAudio=data.streams && data.streams.length>0; resolve({ ok:hasAudio, audioInfo: hasAudio?data.streams[0]:null }) } catch(e){ resolve({ ok:false, error:'ffprobe parse failed' }) }
    })
    setTimeout(()=>{ try{proc.kill('SIGKILL')}catch{}; resolve({ ok:false, error:'ffprobe timeout' }) },10000)
  })
}

// LRU segment cache — capped by total BYTES (segments are ~1.5MB each, so a
// naive 500-entry cap could exceed the 512MB free instance) with a TTL long
// enough to serve repeat/parallel segment fetches (mpv retries after timeouts,
// rewinds, rewatches) without holding stale data forever.
const segmentCache = new Map()
const SEGMENT_CACHE_MAX_BYTES = 150 * 1024 * 1024
const SEGMENT_CACHE_TTL = 30 * 60 * 1000
let segmentCacheBytes = 0
function cacheSegment(key, data, contentType) {
  const size = Buffer.byteLength(data)
  if (size > SEGMENT_CACHE_MAX_BYTES) return
  segmentCacheBytes += size
  segmentCache.set(key, { data, contentType, time: Date.now(), size })
  while (segmentCacheBytes > SEGMENT_CACHE_MAX_BYTES && segmentCache.size > 1) {
    const oldest = segmentCache.keys().next().value
    const entry = segmentCache.get(oldest)
    segmentCacheBytes -= entry.size
    segmentCache.delete(oldest)
  }
}
function getCachedSegment(key) {
  const entry = segmentCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.time > SEGMENT_CACHE_TTL) {
    segmentCache.delete(key)
    segmentCacheBytes -= entry.size
    return null
  }
  // Refresh recency (LRU): re-insert so the hit moves to the newest position.
  segmentCache.delete(key)
  segmentCache.set(key, entry)
  return entry
}

async function parseMasterManifest(masterUrl, plan) {
  const response = await axios.get(masterUrl, {
    headers: headersForStream(masterUrl),
    timeout: 15000,
  })
  const body = response.data
  const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1)
  let variants = []
  const lines = body.split('\n')
  let currentStreamInf = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#EXT-X-STREAM-INF:')) {
      const bwMatch = trimmed.match(/BANDWIDTH=(\d+)/i)
      const resMatch = trimmed.match(/RESOLUTION=(\d+x\d+)/i)
      currentStreamInf = {
        bandwidth: bwMatch ? parseInt(bwMatch[1]) : 0,
        resolution: resMatch ? resMatch[1] : null,
      }
    } else if (currentStreamInf && trimmed && !trimmed.startsWith('#')) {
      const variantUrl = trimmed.startsWith('http') ? trimmed : new URL(trimmed, baseUrl).href
      variants.push({
        resolution: currentStreamInf.resolution,
        bandwidth: currentStreamInf.bandwidth,
        url: variantUrl,
        label: currentStreamInf.resolution ? `${currentStreamInf.resolution.split('x')[1]}p` : `${Math.round(currentStreamInf.bandwidth / 1000)}kbps`,
      })
      currentStreamInf = null
    }
  }

  variants.sort((a, b) => (parseInt(a.resolution?.split('x')[1]) || 0) - (parseInt(b.resolution?.split('x')[1]) || 0))

  // Apply plan resolution cap
  if (plan && PLAN_MAX_RES[plan] !== undefined) {
    const maxRes = PLAN_MAX_RES[plan]
    const filtered = variants.filter((v) => {
      const height = parseInt(v.resolution?.split('x')[1]) || 0
      return height <= maxRes
    })
    if (filtered.length > 0) variants = filtered
    else if (variants.length > 0) variants = [variants[0]]
  }

  return variants
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return 'Unknown'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(1)} ${units[i]}`
}

function hostOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

// Maps a CDN host to the Referer it expects. Clients attach these headers when
// playing a stream directly (bypassing the Render-hosted proxy, which these
// CDNs routinely block).
function refererForHost(host) {
  if (!host) return 'https://nextgencloudfabric.com/'
  if (host.includes('1x2.space') || host.includes('meadowlane') || host.includes('ibyteimg')) {
    return 'https://play.xpass.top/'
  }
  if (host.includes('shegu') || host.includes('febbox')) return 'https://febbox.com/'
  if (host.includes('nextgencloudfabric') || host.includes('remoteconsulting')) return 'https://nextgencloudfabric.com/'
  if (host.includes('xpass')) return 'https://play.xpass.top/'
  return 'https://nextgencloudfabric.com/'
}

function headersForStream(url) {
  const referer = refererForHost(hostOf(url))
  return {
    'User-Agent': UA,
    Referer: referer,
    Origin: referer.replace(/\/$/, ''),
  }
}

// Merge cookies captured during probing into the playback headers. Some CDNs
// authorize real (non-ad) segments only after a session cookie is set.
function headersWithCookies(url, cookies) {
  const h = headersForStream(url)
  const cs = (cookies || []).filter(Boolean)
  if (cs.length) h.Cookie = cs.join('; ')
  return h
}

const PROBE_CACHE_MAX = 200
const PROBE_CACHE_TTL = 60 * 1000
const probeCache = new Map()
function cacheProbe(url, result) {
  if (probeCache.size >= PROBE_CACHE_MAX) {
    const oldest = probeCache.keys().next().value
    probeCache.delete(oldest)
  }
  probeCache.set(url, { result, ts: Date.now() })
}
function getCachedProbe(url) {
  const entry = probeCache.get(url)
  if (!entry) return null
  if (Date.now() - entry.ts > PROBE_CACHE_TTL) {
    probeCache.delete(url)
    return null
  }
  return entry.result
}

function setCookieFrom(headers, collect) {
  try {
    const sc = headers['set-cookie']
    if (!sc) return
    const list = Array.isArray(sc) ? sc : [sc]
    for (const c of list) {
      const name = String(c).split('=')[0]
      if (name && name.trim() && !collect.some((x) => x.startsWith(name + '='))) {
        collect.push(String(c).split(';')[0].trim())
      }
    }
  } catch {}
}

// MPEG-TS packets are 188 bytes and every packet starts with the 0x47 sync
// byte. Ad-placeholder PNGs never exhibit this pattern, so it is definitive
// proof of real video without needing ffmpeg.
function looksLikeTsVideo(buf) {
  if (!buf || buf.length < 188 * 2) return false
  const max = Math.min(10, Math.floor(buf.length / 188))
  for (let i = 0; i < max; i++) {
    if (buf[i * 188] !== 0x47) return false
  }
  return true
}

function looksLikeMp4(buf) {
  return !!buf && buf.length > 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp'
}

function looksLikeImage(buf) {
  if (!buf || buf.length < 12) return false
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8) return true // JPEG
  if (buf.toString('latin1', 0, 4) === 'GIF8') return true // GIF
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return true // WEBP
  return false
}

// Fetch the first ~4KB of a URL so segment bytes can be inspected (Range is
// advisory; some CDNs return the whole body, which is fine for a probe).
async function fetchPrefix(url, headers, extra = {}) {
  try {
    const res = await axios({
      url,
      method: 'GET',
      headers: { ...headers, Range: 'bytes=0-4095', ...extra },
      timeout: 6000,
      maxRedirects: 5,
      validateStatus: () => true,
      responseType: 'arraybuffer',
    })
    return {
      status: res.status,
      ct: (res.headers['content-type'] || '').toLowerCase(),
      buf: Buffer.from(res.data || []),
      headers: res.headers,
    }
  } catch {
    return { status: 0, ct: '', buf: Buffer.alloc(0), headers: {} }
  }
}

// Byte-level verification with ffmpeg. Content-type checks are fooled by
// ad-only CDNs that serve 1x1 PNG segments under a video/* content-type.
// ffmpeg fails to find a decodable video codec in those cases. Also captures
// the real Duration so a bogus-length playlist can be rejected.
function ffmpegProbePlayable(streamUrl, headers, ffmpegPath) {
  return new Promise((resolve) => {
    const hdrStr = Object.entries(headers || {})
      .map(([k, v]) => `${k}: ${v}\r\n`)
      .join('')
    const isHls = streamUrl.includes('.m3u8')
    const args = [
      '-headers', hdrStr,
      ...(isHls ? ['-allowed_extensions', 'ALL'] : []),
      '-t', '2',
      '-i', streamUrl,
      '-f', 'null',
      '-',
    ]
    let stderr = ''
    let probe
    try {
      probe = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    } catch (e) {
      return resolve({ ok: false, reason: 'ffmpeg-spawn-error', detail: String(e.message || e).slice(0, 100) })
    }
    const killer = setTimeout(() => {
      try { probe.kill('SIGKILL') } catch {}
    }, 12000)
    probe.stderr.on('data', (d) => {
      stderr += d.toString()
      if (stderr.length > 6000) stderr = stderr.slice(-6000)
    })
    probe.on('close', (code) => {
      clearTimeout(killer)
      const hasVideo = /Stream #\d+:\d+(?:\(\d+\))?: Video: (h264|hevc|av1|vp9|mpeg2video|mpeg4|vp8|vc1)/i.test(stderr)
      const hasError = /(Invalid data found|error while decoding|unable to decode|no video stream|could not find codec|decoder not found|failed to open|https protocol not found|HTTP error|not found|Forbidden|Access Denied)/i.test(stderr)
      const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      const duration = durMatch
        ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3])
        : 0
      if (code === 0 && hasVideo) {
        resolve({ ok: true, reason: 'ok', duration, hasVideo })
      } else if (code === 0 && !hasVideo) {
        resolve({ ok: false, reason: 'ad-only', detail: 'no decodable video stream', hasVideo: false, duration })
      } else {
        resolve({
          ok: false,
          reason: /404|not found/i.test(stderr) ? 'expired' : hasError ? 'unplayable' : 'ad-only',
          detail: `${code === null ? 'timeout' : 'exit ' + code}: ${stderr.slice(-200)}`,
          duration,
        })
      }
    })
    probe.on('error', (e) => {
      clearTimeout(killer)
      resolve({ ok: false, reason: 'ffmpeg-error', detail: String(e.message || e).slice(0, 100) })
    })
  })
}

// Known placeholder/ad farms (tik/vip/dara.1x2.space fake playlists + the
// tiktokcdn PNG host). Real providers resolve to tnmr.org or similar CDNs.
const FAKE_HOST_RE = /(^|\.)(1x2\.space|tiktokcdn\.com)$/i

// Health check for an HLS/direct stream. Free-tier CDNs serve playlists whose
// "segments" are 1x1 PNG ad-images (unplayable) or return expired 404s /
// anti-bot blocks; the player then sits on a black screen showing a (fake)
// duration. This walks master -> variant -> segment, captures Set-Cookie (some
// CDNs authorize real segments only after a cookie is set), then runs a 2s
// ffmpeg decode to confirm a real video stream exists.
async function probeStreamUrl(streamUrl, ffmpegPath) {
  const cached = getCachedProbe(streamUrl)
  if (cached) return cached
  const started = Date.now()
  const result = await probeStreamUrlUncached(streamUrl, ffmpegPath)
  result.ms = Date.now() - started
  cacheProbe(streamUrl, result)
  console.log(`[probe] ${result.ok ? 'OK' : 'FAIL'} reason=${result.reason} ${streamUrl.substring(0, 90)} (${result.ms}ms)${result.duration ? ` dur=${result.duration}s` : ''}`)
  return result
}

async function probeStreamUrlUncached(streamUrl, ffmpegPath) {
  if (FAKE_HOST_RE.test(hostOf(streamUrl))) {
    return { ok: false, reason: 'ad-only', detail: 'known placeholder host', steps: [] }
  }
  const hdrs = headersForStream(streamUrl)
  const steps = []
  const cookies = []
  const fetchOpts = (timeout) => ({
    headers: hdrs,
    timeout,
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
    responseType: 'text',
  })
  const push = (s) => { steps.push(s); console.log(`[probe:step] ${s}`) }

  try {
    let master = null
    try {
      master = await axios.get(streamUrl, fetchOpts(5000))
    } catch (firstErr) {
      // CDNs are flaky; retry once before giving up.
      master = await axios.get(streamUrl, fetchOpts(6000))
    }
    setCookieFrom(master.headers, cookies)
    if (master.status !== 200) return { ok: false, reason: master.status === 404 ? 'expired' : 'blocked', status: master.status, steps }
    const body = String(master.data || '')
    const ct = (master.headers['content-type'] || '').toLowerCase()
    const isM3u8 = body.includes('#EXTM3U') || ct.includes('mpegurl') || ct.includes('m3u8')
    push(`master ${master.status} ct=${ct} bytes=${body.length} cookies=${cookies.join(',') || 'none'}`)

    if (!isM3u8) {
      if (ct.startsWith('image/')) return { ok: false, reason: 'ad-only', ct, steps }
      if (ct.startsWith('video/') || ct.includes('octet-stream') || ct.includes('mp4')) {
        const pre = await fetchPrefix(streamUrl, hdrs)
        push(`direct-prefix ${pre.status} ct=${pre.ct} bytes=${pre.buf.length}`)
        if (looksLikeTsVideo(pre.buf) || looksLikeMp4(pre.buf)) {
          return { ok: true, reason: 'ok', ct, steps }
        }
        if (looksLikeImage(pre.buf)) return { ok: false, reason: 'ad-only', ct, steps }
        const ff = await ffmpegProbePlayable(streamUrl, hdrs, ffmpegPath)
        push(`ffmpeg(mp4) ok=${ff.ok} ${ff.detail || ''}`)
        return { ok: ff.ok, reason: ff.ok ? 'ok' : ff.reason, duration: ff.duration, ct, steps, ...(ff.ok ? {} : { detail: ff.detail }) }
      }
      return { ok: false, reason: 'unknown-type', ct, steps }
    }

    const masterBase = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1)
    const variantLine = body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'))
    if (!variantLine) return { ok: false, reason: 'no-variants', steps }
    const variantUrl = variantLine.startsWith('http') ? variantLine : new URL(variantLine, masterBase).href

    const variant = await axios.get(variantUrl, fetchOpts(5000))
    setCookieFrom(variant.headers, cookies)
    if (variant.status !== 200) return { ok: false, reason: variant.status === 404 ? 'expired' : 'blocked', status: variant.status, steps }
    const vbody = String(variant.data || '')
    const vct = (variant.headers['content-type'] || '').toLowerCase()
    push(`variant ${variant.status} ct=${vct} bytes=${vbody.length}`)
    const segLine = vbody.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'))
    if (!segLine) return { ok: false, reason: 'no-segments', steps }
    const variantBase = variantUrl.substring(0, variantUrl.lastIndexOf('/') + 1)
    const segUrl = segLine.startsWith('http') ? segLine : new URL(segLine, variantBase).href

    const seg = await fetchPrefix(segUrl, hdrs)
    setCookieFrom(seg.headers, cookies)
    if (seg.status !== 200 && seg.status !== 206) return { ok: false, reason: seg.status === 404 ? 'expired' : 'blocked', status: seg.status, steps }
    const sct = seg.ct
    push(`segment ${seg.status} ct=${sct} bytes=${seg.buf.length} cookies=${cookies.join(',') || 'none'}`)
    if (sct.startsWith('image/') || looksLikeImage(seg.buf)) return { ok: false, reason: 'ad-only', ct: sct, steps }
    if (sct.startsWith('text/html')) return { ok: false, reason: 'blocked', ct: sct, steps }

    // Real MPEG-TS/MP4 segments are provable from their bytes alone; ffmpeg is
    // only needed for ambiguous payloads (some CDNs serve PNG ad-images with a
    // video/* content-type, and those never carry TS sync bytes / ftyp).
    if (looksLikeTsVideo(seg.buf) || looksLikeMp4(seg.buf)) {
      return { ok: true, reason: 'ok', ct: sct, cookies, steps }
    }

    const ff = await ffmpegProbePlayable(streamUrl, { ...hdrs, ...(cookies.length ? { Cookie: cookies.join('; ') } : {}) }, ffmpegPath)
    push(`ffmpeg ok=${ff.ok} codec=${ff.hasVideo ? 'video' : 'none'} dur=${ff.duration ? ff.duration + 's' : 'unknown'} ${ff.detail || ''}`)
    return {
      ok: ff.ok,
      reason: ff.ok ? 'ok' : ff.reason,
      duration: ff.duration,
      ct: sct,
      cookies,
      steps,
      ...(ff.ok ? {} : { detail: ff.detail }),
    }
  } catch (err) {
    const codes = err.errors ? err.errors.map((e) => e.code || e.message).filter(Boolean).slice(0, 3) : []
    return {
      ok: false,
      reason: 'unreachable',
      error: `${err.code || err.message || 'unknown'}${codes.length ? ' [' + codes.join(', ') + ']' : ''}`.slice(0, 160),
      steps,
    }
  }
}

const MOCK_HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
const MOCK_SUB = 'https://raw.githubusercontent.com/andreyvit/subtitle-tools/master/test.srt'
const MOCK_IDS = new Set(['550','860508','969681','299054','533535','603','157336','27205','550','603','27205'])

export async function source(req, res) {
  const { id, type, season, episode } = req.query
  if (!id) return res.status(400).json({ error: 'TMDB ID is required' })
  logToFile({ type: 'apiRequest', endpoint: '/api/source', id, tmdbType: type || 'movie', season: season || null, episode: episode || null, title: req.query.title || null, ip: req.ip || 'unknown', userId: req.userId || 'anonymous' })

  // === SPOOF MODE FOR TESTING (limited mock catalog when scraper unmaintained) ===
  const useMock = MOCK_IDS.has(String(id)) || String(req.query.mock) === '1'
  if (useMock) {
    const proxyUrl = `/api/proxy/${MOCK_HLS.replace('https://','')}`
    // Also allow direct mock for faster local testing without external fetch
    return res.json({
      success: true,
      streamUrl: proxyUrl,
      directUrl: MOCK_HLS,
      headers: { 'User-Agent': UA, Referer: 'https://test-streams.mux.dev/' },
      duration: 600,
      subtitles: [{ label: 'English', file: '/api/proxy/raw.githubusercontent.com/andreyvit/subtitle-tools/master/test.srt' }],
      provider: 'mock-spoof',
      providerMode: 'hls',
      backups: [{ streamUrl: MOCK_HLS, provider: 'mock-spoof-backup', directUrl: MOCK_HLS, headers: { 'User-Agent': UA }, subtitles: [] }],
      probe: [{ ok: true, reason: 'ok', provider: 'mock-spoof' }],
      debug: { steps: ['mock spoof active'] },
      fromCache: false,
      elapsed: 5,
      attempted: 1,
      totalProviders: 1,
      spoofed: true,
    })
  }

  // Creator uploads: a UUID resolves to a direct R2/S3 file. Serve it directly.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  if (isUuid || (type === 'creator')) {
    const upload = await getUploadById(id)
    if (upload && upload.filename && upload.status === 'active') {
      return res.json({
        success: true,
        streamUrl: `/api/stream/creator/${id}.mp4`,
        directUrl: `/api/stream/creator/${id}.mp4`,
        provider: 'creator',
        providerMode: 'file',
        subtitles: [],
        backups: [],
        source: 'creator',
      })
    }
  }

  // Concurrent screen enforcement (skip for anonymous/unauthed)
  if (req.userId && req.userId !== 'anonymous') {
    const plan = req.user?.plan || 'free'
    const maxScreens = PLAN_FEATURES[plan]?.concurrentScreens || 1
    try {
      const activeSessions = await getActiveSessionCount(req.userId)
      if (activeSessions >= maxScreens) {
        // Enriched payload lets clients offer "end another session" (Netflix-style)
        const active = await listActiveSessions(req.userId)
        return res.status(429).json({
          success: false,
          code: 'screen_limit_reached',
          error: `Your ${plan} plan allows ${maxScreens} concurrent screen${maxScreens > 1 ? 's' : ''}. You've reached this limit.`,
          maxScreens,
          current: activeSessions,
          activeSessions: active,
        })
      }
    } catch (e) {
      console.warn('[source] screen check failed:', e.message)
    }
  }

  try {
    let result
    try {
      result = await Promise.race([
        getStreamUrl(id, type || 'movie', season || null, episode || null),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout of 45000ms exceeded')), 45000)),
      ])
    } catch (e) {
      return res.json({ success: false, error: e.message })
    }

    const toProxy = (url) => {
      if (!url) return url
      if (url.startsWith('http://') || url.startsWith('https://')) return url.replace('https://', '/api/proxy/')
      return url
    }

    const probeResults = []
    const ffmpegPath = req.app.locals.ffmpegPath
    const primary = result.streamUrl
      ? { streamUrl: result.streamUrl, provider: result.provider, subtitles: result.subtitles || [] }
      : null
    const backupList = (result.backups || []).filter((b) => b.streamUrl)
    let chosen = primary
    let chosenProbe = null

    if (chosen) {
      logToFile({ type: 'verifyStart', streamUrl: chosen.streamUrl.substring(0,200), provider: chosen.provider, check: 'primary' })
      const primaryProbe = await probeStreamUrl(chosen.streamUrl, ffmpegPath)
      probeResults.push({ provider: chosen.provider, host: hostOf(chosen.streamUrl), streamUrl: chosen.streamUrl, ...primaryProbe })
      if (primaryProbe.ok) {
        // Audio probe — ensure first audio segment decodable (stable TV/movie audio)
        const audioProbe = await probeAudioSegment(chosen.streamUrl)
        if (!audioProbe.ok) {
          logToFile({ type: 'verifyComplete', streamUrl: chosen.streamUrl.substring(0,200), provider: chosen.provider, success: false, error: audioProbe.error })
          probeResults[probeResults.length-1].reason = 'audio-probe-failed'
          probeResults[probeResults.length-1].audioError = audioProbe.error
          if (!['blocked'].includes(primaryProbe.reason)) reportFailure(chosen.streamUrl, 'audio-probe-failed')
          chosen = null
        } else {
          logToFile({ type: 'verifyComplete', streamUrl: chosen.streamUrl.substring(0,200), provider: chosen.provider, success: true, audioCodec: audioProbe.audioInfo?.codec_name })
          reportSuccess(chosen.streamUrl)
          chosenProbe = primaryProbe
        }
      } else {
        logToFile({ type: 'verifyComplete', streamUrl: chosen.streamUrl.substring(0,200), provider: chosen.provider, success: false, reason: primaryProbe.reason })
        if (!['blocked'].includes(primaryProbe.reason)) reportFailure(chosen.streamUrl, primaryProbe.reason)
        chosen = null
      }
    }

    if (!chosen && backupList.length > 0) {
      // Verify-before-serve: probe every backup in parallel and take the first
      // stream that actually delivers real video (rejecting ad-only/expired/dead).
      const backupProbes = await Promise.allSettled(
        backupList.map(async (b) => {
          const bp = await probeStreamUrl(b.streamUrl, ffmpegPath)
          probeResults.push({ provider: b.provider, host: hostOf(b.streamUrl), streamUrl: b.streamUrl, ...bp })
          if (bp.ok) reportSuccess(b.streamUrl)
          else if (!['blocked'].includes(bp.reason)) reportFailure(b.streamUrl, bp.reason)
          return { b, bp }
        })
      )
      const verified = backupProbes
        .filter((x) => x.status === 'fulfilled' && x.value && x.value.bp.ok)
        .map((x) => x.value)
      if (verified.length > 0) {
        chosen = {
          streamUrl: verified[0].b.streamUrl,
          provider: verified[0].b.provider,
          subtitles: verified[0].b.subtitles || [],
        }
        chosenProbe = verified[0].bp
      }
    }

    const probeSteps = probeResults.flatMap((r) => (r.steps || []).map((s) => `[${r.provider}] ${s}`))

    if (!chosen || !chosen.streamUrl) {

      // Failures that are universal (the stream itself is bad) vs. failures that
      // may be server-IP-specific (CDN blocking Render's datacenter). For the
      // latter, still hand native clients the direct URL + headers so they can
      // try from their residential IP; the proxy path stays dead either way.
      const primaryReason = probeResults[0]?.reason || ''
      const softFail = ['blocked', 'unreachable'].includes(primaryReason)
      if (softFail && result.streamUrl) {
        const softHeaders = headersWithCookies(result.streamUrl, probeResults[0]?.cookies)
        console.warn(`[api/source] id=${id} type=${type || 'movie'} -> soft fail (${primaryReason}), handing direct URL to native clients`)
        return res.json({
          success: true,
          streamUrl: `/api/proxy/${result.streamUrl.replace('https://', '')}`,
          directUrl: result.streamUrl,
          headers: softHeaders,
          subtitles: (result.subtitles || []).map((s) => ({ label: s.label, file: toProxy(s.file) })),
          provider: result.provider,
          providerMode: 'direct',
          backups: [],
          probe: probeResults,
          debug: { steps: probeSteps },
          fromCache: result.fromCache || false,
          elapsed: result.elapsed || 0,
          attempted: result.attempted || 0,
          totalProviders: result.totalProviders || 0,
        })
      }

      const reasons = probeResults.length > 0 ? probeResults.map((r) => r.reason).join(', ') : 'no stream source'
      console.error(`[api/source] no playable source for id=${id} type=${type || 'movie'} season=${season || '-'} episode=${episode || '-'} reasons=${reasons}`)
      logToFile({ type: 'streamResolve', provider: result.provider || 'none', success: false, streamUrl: 'none', elapsed: 0, fromCache: result.fromCache || false, error: reasons })
      return res.json({
        success: false,
        error: reasons.includes('ad-only')
          ? 'This title is currently serving ad placeholders and cannot be played. Try again later or pick another title.'
          : reasons.includes('expired')
            ? 'The stream link for this title has expired. Try again in a moment.'
            : reasons.includes('blocked')
              ? 'The stream provider is blocking playback for this title.'
              : 'No playable stream source was found for this title.',
        probe: probeResults,
        debug: { steps: probeSteps },
        attempted: result.attempted || 0,
        totalProviders: result.totalProviders || 0,
        fromCache: result.fromCache || false,
      })
    }

    const streamProxy = `/api/proxy/${chosen.streamUrl.replace('https://', '')}`
    const subtitles = (chosen.subtitles || []).map((s) => ({
      label: s.label,
      file: toProxy(s.file),
    }))

    const backupHeaders = (url) => {
      const bp = probeResults.find((r) => r.ok && r.streamUrl === url)
      return headersWithCookies(url, bp?.cookies)
    }

    const backups = (result.backups || []).slice(0, 5).map((b) => ({
      streamUrl: b.streamUrl,
      provider: b.provider,
      directUrl: b.streamUrl || null,
      headers: b.streamUrl ? backupHeaders(b.streamUrl) : null,
      subtitles: (b.subtitles || []).map((s) => ({
        label: s.label,
        file: toProxy(s.file),
      })),
    }))

    const playHeaders = headersWithCookies(chosen.streamUrl, chosenProbe?.cookies)

    const response = {
      success: true,
      streamUrl: streamProxy,
      directUrl: chosen.streamUrl,
      headers: playHeaders,
      duration: chosenProbe?.duration || null,
      subtitles,
      provider: chosen.provider,
      providerMode: 'hls',
      backups,
      probe: probeResults,
      debug: { steps: probeSteps },
      fromCache: result.fromCache || false,
      elapsed: result.elapsed || 0,
      attempted: result.attempted || 0,
      totalProviders: result.totalProviders || 0,
    }

    console.log(`[api/source] id=${id} type=${type || 'movie'} season=${season || '-'} episode=${episode || '-'} -> provider=${response.provider} mode=hls dur=${response.duration || 'unknown'}s probe=${JSON.stringify(probeResults.map((r) => r.reason))} cookies=${(chosenProbe?.cookies || []).length}`)
    logToFile({ type: 'streamResolve', provider: response.provider, success: true, streamUrl: chosen.streamUrl.substring(0,200), elapsed: response.elapsed, fromCache: response.fromCache })
    res.json(response)
  } catch (err) {
    console.error(`[api/source] id=${id} type=${type || 'movie'} season=${season || '-'} episode=${episode || '-'}: ${err.message}`)
    logToFile({ type: 'streamResolve', provider: 'none', success: false, streamUrl: 'none', elapsed: 0, fromCache: false, error: err.message })
    let releaseDate = null
    try {
      const tmdb = req.app.locals.tmdb
      const tmdbRes = await tmdb.get(`/${type === 'tv' ? 'tv' : 'movie'}/${id}`, {
        params: { language: 'en-US' },
      })
      releaseDate = tmdbRes.data.release_date || tmdbRes.data.first_air_date || null
    } catch {}
    res.json({ success: false, error: err.message, releaseDate })
  }
}

// Dedicated stable wrappers for movie/TV — map path-param style to unified source
export async function movieSource(req, res) {
  req.query.id = req.params.id || req.query.id
  req.query.type = 'movie'
  if (req.query.title) req.query.title = req.query.title
  if (req.query.year) req.query.year = req.query.year
  return source(req, res)
}
export async function tvSource(req, res) {
  req.query.id = req.params.id || req.query.id
  req.query.type = 'tv'
  req.query.season = req.params.season || req.query.season
  req.query.episode = req.params.episode || req.query.episode
  return source(req, res)
}

const PLAN_MAX_RES = { free: 480, student: 720, basic: 720, standard: 1080, premium: 2160 }

// Download size enforcement — 100 MB per file at lowest quality, 300 MB total for 1 movie + 2 TV episodes
const MAX_DOWNLOAD_BYTES_PER_FILE = 100 * 1024 * 1024 // 100 MB
const MAX_DOWNLOAD_TOTAL_BYTES = 300 * 1024 * 1024 // 300 MB (3 files)
const LOWEST_QUALITY_HEIGHTS = [144, 240, 360, 480] // ordered low→high, HLS variants will be filtered to smallest

export async function manifestInfo(req, res) {
  const { url, id, type, season, episode, plan } = req.query
  if (!url) return res.status(400).json({ error: 'URL is required' })

  try {
    const cdnUrl = url.startsWith('/api/proxy/')
      ? 'https://' + url.replace('/api/proxy/', '')
      : url

    const variants = await parseMasterManifest(cdnUrl, plan)
    let duration = 0

    if (id && type) {
      try {
        let runtime = 0
        const tmdb = req.app.locals.tmdb
        if (type === 'tv' && season && episode) {
          const ep = await tmdb.get(`/tv/${id}/season/${season}/episode/${episode}`, { params: { language: 'en-US' } })
          runtime = ep.data.runtime || 0
        }
        if (!runtime) {
          const tm = await tmdb.get(`/${type}/${id}`, { params: { language: 'en-US' } })
          runtime = tm.data.runtime || tm.data.episode_run_time?.[0] || 0
        }
        duration = runtime * 60
      } catch {}
    }

    const compressedRatio = (h) => {
      // Aggressive for low qualities to keep 100 MB limit (184p→0.30 = 75 MB instead of 112 MB)
      if (h >= 1080) return 0.28
      if (h >= 720) return 0.32
      if (h >= 480) return 0.35
      return 0.30
    }

    const variantsWithSize = variants.map((v) => {
      const height = parseInt(v.resolution?.split('x')[1]) || 0
      const origBytes = duration > 0 ? Math.round(v.bandwidth / 8 * duration) : 0
      const compBytes = duration > 0 ? Math.round(origBytes * compressedRatio(height)) : 0
      return {
        ...v,
        sizeBytes: origBytes,
        sizeLabel: duration > 0 ? formatSize(origBytes) : 'Unknown',
        compressedBytes: compBytes,
        compressedLabel: duration > 0 ? `~${formatSize(compBytes)}` : 'Unknown',
      }
    })

    res.json({ success: true, duration, variants: variantsWithSize })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
}

const DOWNLOAD_PLANS = { student: true, basic: true, standard: true, premium: true }

export async function download(req, res) {
  const ffmpegPath = req.app.locals.ffmpegPath
  const { url, title, variant, compress, save } = req.query
  if (!url) return res.status(400).json({ error: 'URL is required' })

  if (!DOWNLOAD_PLANS[req.user?.plan]) {
    return res.status(403).json({ error: 'Downloads require a paid plan (Student or higher)' })
  }

  // Web clients are never allowed to download — they are routed to /download-app.
  // Downloads exist only in the NovaFlix mobile apps (per-platform policy).
  if (String(req.query.platform || '').toLowerCase() === 'web') {
    return res.status(403).json({
      success: false,
      code: 'web_download_blocked',
      error: 'Downloads are available in the NovaFlix mobile apps only.',
      redirectUrl: '/download-app',
    })
  }

  // Per-plan download-device cap (student/basic 1, standard 2, premium 6).
  // Clients without a deviceId fall back to a UA hash so legacy apps are still counted.
  try {
    const plan = req.user?.plan || 'free'
    const maxDevices = PLAN_FEATURES[plan]?.downloads ?? 0
    const deviceId = (req.query.deviceId || crypto.createHash('sha256').update(req.headers['user-agent'] || 'unknown-device').digest('hex')).slice(0, 64)
    const deviceName = String(req.query.deviceName || req.headers['user-agent'] || 'Unknown Device').slice(0, 200)
    const platform = String(req.query.platform || 'web').slice(0, 50)
    const deviceResult = await ensureDownloadDevice(req.userId, deviceId, deviceName, platform, maxDevices)
    if (!deviceResult.ok) {
      return res.status(409).json({
        success: false,
        code: 'download_limit_reached',
        error: `Your ${plan} plan allows ${maxDevices} download device${maxDevices === 1 ? '' : 's'}. Remove a device in Settings to continue.`,
        limit: maxDevices,
        devices: deviceResult.devices,
      })
    }
  } catch (e) {
    console.warn('[download] device check failed:', e.message)
  }

  const safeTitle = title
    ? title.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    : 'video'

  // --- Download size pre-check: enforce 100 MB per file at lowest quality ---
  // For HLS masters we parse variants and pick the smallest; for direct MP4 we HEAD-check.
  let selectedVariantUrl = variant || null
  let enforceLowestQuality = false
  if (!variant) {
    // No explicit variant — caller wants lowest quality (per spec: 1 movie + 2 TV @ lowest = 300 MB total)
    enforceLowestQuality = true
  }

  try {
    let cdnUrl = url.startsWith('/api/proxy/')
      ? 'https://' + url.replace('/api/proxy/', '')
      : url

    if (selectedVariantUrl) {
      cdnUrl = selectedVariantUrl
    } else if (enforceLowestQuality) {
      // Try to resolve HLS lowest variant and verify it fits 100 MB
      try {
        const probeVariants = await parseMasterManifest(cdnUrl, req.user?.plan)
        if (probeVariants.length > 0) {
          // probeVariants sorted low→high; lowest is [0]
          const lowest = probeVariants[0]
          selectedVariantUrl = lowest.url
          cdnUrl = lowest.url
          // Optional: estimate size if id/type provided
          if (req.query.id && req.query.type) {
            try {
              const tmdb = req.app.locals.tmdb
              let runtime = 0
              if (req.query.type === 'tv' && req.query.season && req.query.episode) {
                const ep = await tmdb.get(`/tv/${req.query.id}/season/${req.query.season}/episode/${req.query.episode}`, { params: { language: 'en-US' } })
                runtime = ep.data.runtime || 0
              }
              if (!runtime) {
                const tm = await tmdb.get(`/${req.query.type}/${req.query.id}`, { params: { language: 'en-US' } })
                runtime = tm.data.runtime || tm.data.episode_run_time?.[0] || 0
              }
              const duration = runtime * 60
              const height = parseInt(lowest.resolution?.split('x')[1]) || 360
              // Use aggressive ratio to keep under 100 MB at lowest quality (184p→0.30 ensures 250MB→75MB)
              const ratio = height >= 1080 ? 0.28 : height >= 720 ? 0.32 : height >= 480 ? 0.35 : 0.30
              const estBytes = Math.round(((lowest.bandwidth || 400000) / 8) * duration * ratio)
              if (estBytes > MAX_DOWNLOAD_BYTES_PER_FILE) {
                console.warn(`[download] lowest variant still ${formatSize(estBytes)} > 100MB for ${req.query.type} ${req.query.id} — will enforce extra compression`)
                // Force compress=true to ensure transcode path
                req.query.compress = 'true'
              }
              // Attach estimate to response via header after success (optional)
            } catch {}
          }
        }
      } catch (e) {
        console.warn(`[download] lowest-quality probe failed: ${e.message} — falling back to original url`)
      }
    }

    // For direct MP4/files, HEAD-check Content-Length against 100 MB
    if (!cdnUrl.includes('.m3u8')) {
      try {
        const head = await axios.head(cdnUrl, { headers: headersForStream(cdnUrl), timeout: 5000, validateStatus: () => true, family: 4 })
        const clen = parseInt(head.headers['content-length'] || '0', 10)
        if (clen > MAX_DOWNLOAD_BYTES_PER_FILE) {
          // If compress requested, estimate compressed size; else reject and suggest compress
          const isCompress = String(req.query.compress).toLowerCase() === 'true'
          if (!isCompress) {
            return res.status(413).json({
              success: false,
              code: 'file_too_large',
              error: `File is ${formatSize(clen)} — exceeds 100 MB limit at lowest quality. Enable compression or choose a shorter title.`,
              sizeBytes: clen,
              sizeLabel: formatSize(clen),
              limitBytes: MAX_DOWNLOAD_BYTES_PER_FILE,
              limitLabel: '100 MB',
              suggestion: 'Add &compress=true to transcode to ~45% size',
            })
          }
          const estCompressed = Math.round(clen * 0.45)
          if (estCompressed > MAX_DOWNLOAD_BYTES_PER_FILE) {
            console.warn(`[download] compressed estimate ${formatSize(estCompressed)} still >100MB — proceeding anyway`)
          }
        }
      } catch {}
    }

    const cdnHost = new URL(cdnUrl).hostname
    const dlReferer = cdnHost.includes('remoteconsultinggroup') ? 'https://nextgencloudfabric.com/' : cdnHost.includes('tik.1x2') || cdnHost.includes('tiktokcdn') ? 'https://tik.1x2.space/' : 'https://nextgencloudfabric.com/'
    const dlHeaders = `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\nReferer: ${dlReferer}\r\nOrigin: ${dlReferer.replace(/\/$/, '')}\r\n`

    const isHlsProbe = cdnUrl.includes('.m3u8')
    const probeArgs = [
      '-headers', dlHeaders,
      ...(isHlsProbe ? ['-allowed_extensions', 'ALL'] : []),
      '-t', '1',
      '-i', cdnUrl,
      '-f', 'null',
      '-',
    ]
    const probe = spawn(ffmpegPath, probeArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
    const probeResult = await new Promise((resolve) => {
      let stderr = ''
      probe.stderr.on('data', (d) => { stderr += d.toString() })
      probe.on('close', (code) => resolve({ code, stderr }))
    })
    if (probeResult.code !== 0) {
      console.error('[dl probe] stream not accessible:', probeResult.stderr.slice(0, 300))
      return res.status(400).json({ error: 'Stream not accessible' })
    }

    const outputFilename = `${safeTitle}.mp4`

    if (save === 'true') {
      if (!fs.existsSync(DOWNLOADS_DIR)) {
        fs.mkdirSync(DOWNLOADS_DIR, { recursive: true })
      }
      const outputPath = path.join(DOWNLOADS_DIR, outputFilename)

      // Build ffmpeg args correctly — insert codec options before muxer flags
      // Only use allowed_extensions for HLS (m3u8), not for direct MP4
      const isHls = cdnUrl.includes('.m3u8')
      const baseArgs = [
        '-headers', dlHeaders,
        ...(isHls ? ['-allowed_extensions', 'ALL'] : []),
        '-i', cdnUrl,
      ]
      const codecArgs = compress === 'true'
        ? ['-c:v', 'libx264', '-crf', '23', '-preset', 'fast', '-c:a', 'aac', '-b:a', '128k']
        : ['-c', 'copy', '-bsf:a', 'aac_adtstoasc']
      const ffArgs = [
        ...baseArgs,
        ...codecArgs,
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov',
        '-loglevel', 'error',
        '-y',
        outputPath,
      ]

      const ffmpeg = spawn(ffmpegPath, ffArgs, { stdio: ['pipe', 'pipe', 'pipe'] })

      let stderrData = ''
      ffmpeg.stderr.on('data', (chunk) => { stderrData += chunk.toString() })
      ffmpeg.stderr.on('end', () => {
        if (stderrData.trim()) console.error('ffmpeg stderr:', stderrData)
      })

      ffmpeg.on('error', (err) => {
        console.error('ffmpeg error:', err.message)
        if (!res.headersSent) res.status(500).json({ error: 'ffmpeg not found', detail: err.message })
      })

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          const stat = fs.statSync(outputPath)
          res.json({ success: true, file: { name: outputFilename, size: stat.size, path: outputPath } })
        } else if (!res.headersSent) {
          console.error('ffmpeg exited with code', code, stderrData)
          res.status(500).json({ error: 'Download failed', code, detail: stderrData.slice(0, 500) })
        }
      })

      req.on('close', () => {
        ffmpeg.kill('SIGTERM')
      })
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`)
      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Transfer-Encoding', 'chunked')

      const baseArgs2 = [
        '-headers', dlHeaders,
        ...(isHls ? ['-allowed_extensions', 'ALL'] : []),
        '-i', cdnUrl,
      ]
      const codecArgs2 = compress === 'true'
        ? ['-c:v', 'libx264', '-crf', '23', '-preset', 'fast', '-c:a', 'aac', '-b:a', '128k']
        : ['-c', 'copy', '-bsf:a', 'aac_adtstoasc']
      const ffArgs = [
        ...baseArgs2,
        ...codecArgs2,
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov',
        '-loglevel', 'error',
        '-y',
        'pipe:1',
      ]

      const ffmpeg = spawn(ffmpegPath, ffArgs, { stdio: ['pipe', 'pipe', 'pipe'] })

      let stderrData = ''
      ffmpeg.stderr.on('data', (chunk) => { stderrData += chunk.toString() })
      ffmpeg.stderr.on('end', () => {
        if (stderrData.trim()) console.error('ffmpeg stderr:', stderrData)
      })

      ffmpeg.stdout.pipe(res)

      ffmpeg.on('error', (err) => {
        console.error('ffmpeg error:', err.message)
        if (!res.headersSent) res.status(500).json({ error: 'ffmpeg not found', detail: err.message })
      })

      ffmpeg.on('close', (code) => {
        if (code !== 0 && !res.headersSent) {
          console.error('ffmpeg exited with code', code, stderrData)
          res.status(500).json({ error: 'Download failed', code, detail: stderrData.slice(0, 500) })
        }
      })

      req.on('close', () => {
        ffmpeg.kill('SIGTERM')
      })
    }
  } catch (err) {
    console.error(err.message)
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' })
  }
}

export async function serveDownloadedFile(req, res) {
  const filename = req.params.filename
  const filePath = path.join(DOWNLOADS_DIR, filename)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' })
  }
  const stat = fs.statSync(filePath)
  res.setHeader('Content-Type', 'video/mp4')
  res.setHeader('Content-Length', stat.size)
  const stream = fs.createReadStream(filePath)
  stream.pipe(res)
}

function isValidVideoContentType(ct) {
  if (!ct) return false
  const t = ct.toLowerCase()
  return t.startsWith('video/') || t.startsWith('audio/') ||
    t.includes('octet-stream') || t.includes('binary') ||
    t.includes('mpegurl') || t.includes('mp4') ||
    t.includes('m2ts') || t.includes('m3u8')
}

function isSegmentUrl(url) {
  const path = url.split('?')[0]
  return !path.endsWith('.m3u8') && !path.endsWith('.m3u')
}

async function tryFfmpegFetch(url, ffmpegPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-i', url, '-c', 'copy', '-f', 'mpegts', '-loglevel', 'error', 'pipe:1'
    ], { windowsHide: true, timeout: 30000 })
    const chunks = []
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; proc.kill(); reject(new Error('ffmpeg timeout')) }, 25000)
    proc.stdout.on('data', (c) => { if (!timedOut) chunks.push(c) })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) return
      if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks))
      else reject(new Error('ffmpeg failed'))
    })
    proc.on('error', reject)
  })
}

export async function streamCreatorUpload(req, res) {
  const isThumb = /-thumb\.(jpg|jpeg|png|webp)$/i.test(req.params.file || '')
  const id = (req.params.file || '').replace(/\.(mp4|webm|mov|m4v)$/i, '').replace(/-thumb\.(jpg|jpeg|png|webp)$/i, '')
  try {
    const upload = await getUploadById(id)
    const rawUrl = isThumb ? upload?.thumbnail_url : upload?.filename
    if (!upload || !rawUrl || upload.status !== 'active') {
      return res.status(404).json({ error: 'Upload not found' })
    }
    const parsed = new URL(rawUrl)
    const key = parsed.pathname.replace(/^\//, '').split('/').slice(1).join('/')
    const range = req.headers.range
    const result = await streamFile(key, range)
    if (!result.success) return res.status(500).json({ error: result.error })
    if (range) res.status(206)
    res.set({
      'Content-Type': result.contentType || (isThumb ? 'image/jpeg' : 'video/mp4'),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000',
    })
    if (result.contentLength) res.set('Content-Length', range ? undefined : String(result.contentLength))
    if (result.contentRange) res.set('Content-Range', result.contentRange)
    result.stream.pipe(res)
  } catch (err) {
    console.error('[stream-creator] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
}

export async function proxy(req, res) {
  // Rebuild the full upstream URL from the original request so query strings
  // (e.g. tnmr.org's required ?t=&s=&e= token) survive. req.params only holds
  // the path portion; the query is parsed into req.query and would be lost.
  const PROXY_PREFIX = '/api/proxy/'
  const marker = req.originalUrl.indexOf(PROXY_PREFIX)
  const rawPath = marker >= 0
    ? req.originalUrl.slice(marker + PROXY_PREFIX.length)
    : req.params[0]

  const url = 'https://' + rawPath
  let hostname = ''
  try { hostname = new URL(url).hostname } catch { return res.status(502).send('Invalid URL') }

  // Check segment cache for non-m3u8 URLs
  const isM3u8 = url.split('?')[0].endsWith('.m3u8') || url.split('?')[0].endsWith('.m3u')
  if (!isM3u8) {
    const cached = getCachedSegment(url)
    if (cached) {
      res.setHeader('Content-Type', cached.contentType)
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', '*')
      return res.send(cached.data)
    }
  }

  const referers = [
    'https://nextgencloudfabric.com/',
    'https://play.xpass.top/',
    'https://tik.1x2.space/',
    'https://p16-sg.tiktokcdn.com/',
  ]

  // Race all fetch strategies concurrently instead of trying them one-by-one.
  // The upstream CDNs are header-sensitive and slow, so the old sequential
  // loop (5s bare + up to 4×10s referer attempts, repeated) could take ~35s
  // per segment — which is what caused mpv's repeated `tls: Connection timed
  // out` errors and audio underruns during playback.
  const timeoutMs = isM3u8 ? 15000 : 20000
  const validateResp = (resp) => {
    const ct = (resp.headers['content-type'] || '').toLowerCase()
    return resp.status === 200 && (
      isValidVideoContentType(ct) ||
      ct.includes('text/plain') ||
      (isSegmentUrl(url) && !ct.includes('text/html'))
    )
  }

  let response = null
  let usedReferer = ''

  // Run one concurrent race over all strategies; abort the losers as soon as a
  // winner is found so slow/duplicate connections don't linger (mpv opens many
  // parallel segment fetches against the proxy).
  const runRace = () => new Promise((resolve) => {
    const attemptCtrls = []
    const attemptLabels = ['bare']
    const make = (config) => {
      const ctrl = new AbortController()
      attemptCtrls.push(ctrl)
      return axios({ ...config, signal: ctrl.signal })
    }
    const attempts = [make({ url, method: 'GET', responseType: 'stream', timeout: timeoutMs })]
    for (const ref of referers) {
      attempts.push(make({
        url, method: 'GET', responseType: 'stream', timeout: timeoutMs,
        headers: { 'User-Agent': UA, Referer: ref, Origin: ref.replace(/\/$/, '') },
      }))
      attemptLabels.push(ref)
    }
    let pending = attempts.length
    let won = false
    const finish = (winnerCtrl) => {
      if (won) return
      won = true
      // Abort the LOSERS only — aborting the winner would kill its stream
      // before the body is read and hang the client with a header-only 200.
      attemptCtrls.forEach((c) => {
        if (c !== winnerCtrl) { try { c.abort() } catch (_) {} }
      })
      resolve()
    }
    attempts.forEach((a, i) => {
      a.then((r) => {
        if (validateResp(r)) {
          response = r
          usedReferer = attemptLabels[i]
          finish(attemptCtrls[i])
        } else {
          if (r.data) r.data.destroy()
          if (--pending === 0) finish(null)
        }
      }).catch(() => {
        if (--pending === 0) finish(null)
      })
    })
  })

  // Retry once on a full miss (the upstream is flaky on first touch) while
  // keeping typical latency low — the winning attempt usually returns in ~1s.
  for (let attempt = 1; attempt <= 2 && !response; attempt++) {
    if (attempt > 1) {
      console.log(`[proxy] retry ${attempt} for ${hostname}`)
      await new Promise((r) => setTimeout(r, 1000))
    }
    await runRace()
  }

  if (!response) {
    console.log('[proxy] trying ffmpeg fallback for', hostname)
    try {
      const ffmpegData = await tryFfmpegFetch(url, req.app.locals.ffmpegPath)
      res.setHeader('Content-Type', 'video/mp2t')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', '*')
      return res.send(ffmpegData)
    } catch (ffErr) {
      console.error('[proxy] ffmpeg fallback also failed for', hostname)
    }
  }

  if (!response) {
    console.error(`[proxy] All proxy strategies failed for ${hostname} url=${url.substring(0,100)}`)
    return res.status(502).send('Proxy failed')
  }

  console.log(`[proxy] HIT host=${hostname} kind=${isM3u8 ? 'manifest' : 'segment'} ref=${usedReferer || 'none'}`)

  try {
    const contentType = response.headers['content-type'] || ''
    res.setHeader('Content-Type', contentType)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', '*')

    if (contentType.includes('m3u8') || contentType.includes('application/vnd.apple.mpegurl')) {
      let body = ''
      response.data.on('data', (chunk) => { body += chunk.toString() })
      response.data.on('end', () => {
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1)
        const rewritten = body.split('\n').map((line) => {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) return line
          if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            return line.replace('https://', '/api/proxy/')
          }
          const resolved = new URL(trimmed, baseUrl).href
          return resolved.replace('https://', '/api/proxy/')
        }).join('\n')
        res.send(rewritten)
      })
      response.data.on('error', (err) => {
        console.error('[proxy] manifest stream error:', err.message)
        if (!res.headersSent) res.status(502).send('Manifest fetch failed')
      })
    } else {
      // Buffer the segment then send it. Streaming would hang the client if
      // the upstream returns a truncated response that never emits 'end'
      // (some of these CDNs do), and with the concurrent race the winning
      // fetch returns in ~1-2s, so buffering adds no meaningful latency while
      // always completing the response. Also tee into the LRU cache.
      const chunks = []
      response.data.on('data', (c) => chunks.push(c))
      response.data.on('end', () => {
        const buf = Buffer.concat(chunks)
        try { cacheSegment(url, buf, contentType) } catch (_) {}
        res.send(buf)
      })
      response.data.on('error', (err) => {
        console.error('[proxy] segment stream error:', err.message)
        if (!res.headersSent) res.status(502).send('Segment fetch failed')
      })
    }
  } catch (err) {
    console.error('[proxy] stream error:', err.message)
    if (!res.headersSent) res.status(500).send('Proxy stream failed')
  }
}
