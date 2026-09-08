import axios from 'axios'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const XPLAY_HOST = 'https://play.xpass.top'

const WORKER_RE = /workers\.dev/i
const RACE_MS = 9000
const VERIFIED_TTL = 6 * 60 * 60 * 1000

// Known placeholder/ad farms. tik/vip/dara.1x2.space serve fake playlists
// (1x1 PNG segments or garbage MPEG-TS); tiktokcdn hosts those placeholder
// PNGs. Real content on xpass comes from workers.dev URLs that redirect to
// tnmr.org (or similar CDNs).
const FAKE_HOST_RE = /(^|\.)(1x2\.space|tiktokcdn\.com)$/i

function isFakeHost(url) {
  try {
    return FAKE_HOST_RE.test(new URL(url).hostname)
  } catch {
    return true
  }
}

// Verified stream URLs (e.g. tnmr.org) carry ~8h tokens, so re-use them across
// requests instead of re-scraping the flaky embed/worker chain every time.
const verifiedCache = new Map()

export default {
  name: 'xpass',
  priority: 2,

  async resolve(tmdbId, type, season, episode) {
    const cacheKey = `${tmdbId}|${type}|${season || ''}|${episode || ''}`
    const cached = verifiedCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < VERIFIED_TTL) {
      return {
        streamUrl: cached.url,
        subtitles: cached.subtitles || [],
        headers: { 'User-Agent': UA, Referer: `${XPLAY_HOST}/`, Origin: XPLAY_HOST },
      }
    }

    const pageUrl = season
      ? `${XPLAY_HOST}/e/tv/${tmdbId}/${season}/${episode}?autostart=true`
      : `${XPLAY_HOST}/e/movie/${tmdbId}?autostart=true`

    // Retry the whole scrape once — the embed/worker chain is flaky.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await scrape(pageUrl)
        if (result.streamUrl) {
          verifiedCache.set(cacheKey, { url: result.streamUrl, subtitles: result.subtitles, ts: Date.now() })
          return result
        }
      } catch {}
    }

    throw new Error('xpass: no verified stream')
  },
}

async function scrape(pageUrl) {
  let html = ''
  let cookie = ''
  try {
    const res = await axios.get(pageUrl, {
      headers: { 'User-Agent': UA, Referer: 'https://www.2embed.skin/' },
      timeout: 8000,
      family: 4,
    })
    html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    const setCookies = res.headers['set-cookie']
    if (Array.isArray(setCookies)) {
      cookie = setCookies.map((c) => c.split(';')[0]).join('; ')
    }
  } catch (e) {
    console.log(`[xpass] page fetch failed: ${e.code||e.message?.slice(0,60)}`)
    return { streamUrl: null, subtitles: [] }
  }

  const suburl = extractSuburl(html)
  const paths = extractPlaylistPaths(html)
  const dataUrl = extractDataUrl(html)

  const sessionHeaders = {
    'User-Agent': UA,
    Referer: `${XPLAY_HOST}/`,
    Origin: XPLAY_HOST,
    ...(cookie ? { Cookie: cookie } : {}),
  }

  // New xpass uses encrypted /data/movie|tv endpoint; collect those sources first
  let encryptedSources = []
  if (dataUrl) {
    encryptedSources = await collectEncryptedSources(dataUrl, sessionHeaders)
    if (encryptedSources.length) console.log(`[xpass] encrypted sources: ${encryptedSources.length}`)
  }

  const sources = [...encryptedSources, ...(await collectSources(paths, sessionHeaders))]
  if (sources.length === 0) {
    return { streamUrl: null, subtitles: [] }
  }

  // Workers.dev URLs are the real-content proxies (they redirect to tnmr.org
  // or similar CDNs). Prefer them; the tik/vip playlists are ad placeholders.
  // Try workers in parallel and race for the first verified real stream.
  const workers = sources.filter((u) => WORKER_RE.test(u)).slice(0, 4)
  const others = sources.filter((u) => !WORKER_RE.test(u)).slice(0, 4)

  const verified = await firstVerified([...workers, ...others], sessionHeaders)
  if (verified) {
    const subtitles = await fetchSubtitles(suburl, html, paths, sessionHeaders)
    return { streamUrl: verified, subtitles, headers: sessionHeaders }
  }

  return { streamUrl: null, subtitles: [] }
}

// Race: resolve as soon as any candidate verifies as real video, or when all
// fail, or when the budget expires.
async function firstVerified(candidates, headers) {
  let resolveResult
  const winnerPromise = new Promise((r) => { resolveResult = r })
  const tasks = candidates.map(async (u) => {
    try {
      const r = await resolveAndVerify(u, headers)
      if (r) resolveResult(r)
    } catch {}
  })
  const allDone = Promise.allSettled(tasks).then(() => null)
  const deadline = new Promise((r) => setTimeout(() => r(null), RACE_MS))
  return Promise.race([winnerPromise, allDone, deadline])
}

function extractDataUrl(html) {
  const m = html.match(/dataUrl\s*=\s*"([^"]+)"|\/data\/(movie|tv)\/[^\s"']+/)
  if (m) return m[1] || m[0]
  const m2 = html.match(/dataUrl="([^"]+)"/)
  return m2 ? m2[1] : null
}

async function collectEncryptedSources(dataUrl, headers) {
  const found = new Set()
  try {
    const full = dataUrl.startsWith('http') ? dataUrl : `${XPLAY_HOST}${dataUrl}`
    const res = await axios.get(full, { headers, timeout: 6000, family: 4, validateStatus: () => true, responseType: 'text' })
    if (res.status !== 200) {
      console.log(`[xpass] encrypted fetch ${res.status}`)
      return []
    }
    const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    // The payload is base64url-encoded; try to decode and extract m3u8/ mp4 URLs even without full decryption
    // Directly search for any http urls inside decoded payload
    try {
      const decoded = Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
      const urls = [...decoded.matchAll(/https?:\/\/[^'"\\\s]+\.(?:m3u8|mp4)[^'"\\\s]*/gi)].map(m => m[0])
      for (const u of urls) if (!isFakeHost(u)) found.add(u)
      if (urls.length) console.log(`[xpass] decoded ${urls.length} urls from encrypted payload`)
    } catch {}
    // Fallback: raw body may contain urls even encrypted
    const rawUrls = [...body.matchAll(/https?:\/\/[^'"\s]+\.(?:m3u8|mp4)[^'"\s]*/gi)].map(m => m[0])
    for (const u of rawUrls) if (!isFakeHost(u)) found.add(u)
    // Also try JSON parse if server ever returns JSON
    try {
      const json = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
      const srcs = json?.playlist?.[0]?.sources || json?.sources || []
      for (const s of srcs) if (s?.file && s.file.startsWith('http') && !isFakeHost(s.file)) found.add(s.file)
    } catch {}
  } catch (e) {
    console.log(`[xpass] encrypted collect failed: ${e.message?.slice(0,60)}`)
  }
  return [...found]
}

async function collectSources(paths, headers) {
  const found = new Set()
  await Promise.allSettled(
    paths.map(async (p) => {
      try {
        const res = await axios.get(`${XPLAY_HOST}${p}`, {
          headers,
          timeout: 3500,
          family: 4,
          validateStatus: () => true,
        })
        if (res.status !== 200) return
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
        const sources = data?.playlist?.[0]?.sources || []
        for (const s of sources) {
          if (s && s.file && s.file.startsWith('http') && !isFakeHost(s.file)) found.add(s.file)
        }
      } catch {}
    })
  )
  return [...found]
}

// Follow redirects (workers.dev -> real CDN), then confirm the resolved URL
// actually serves movie video (not ad placeholder PNGs / /video/error / 403).
async function resolveAndVerify(url, headers) {
  try {
    const res = await axios.get(url, {
      headers,
      timeout: 6000,
      family: 4,
      maxRedirects: 6,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    })
    if (res.status !== 200 && res.status !== 206) return null
    const ct = (res.headers['content-type'] || '').toLowerCase()
    const finalUrl = res.request?.res?.responseUrl || res.request?.responseURL || url
    const body = Buffer.from(res.data || [])

    if (body.length > 0 && (body[0] === 0x47 || body.subarray(4, 8).toString('latin1') === 'ftyp')) {
      return finalUrl
    }

    if (ct.includes('image/')) return null
    if (ct.startsWith('video/') || ct.includes('mp2t') || ct.includes('octet-stream')) {
      return finalUrl
    }

    const isManifest = ct.includes('mpegurl') || ct.includes('m3u8') || body.subarray(0, 20).toString('latin1').includes('#EXTM3U')
    if (isManifest) {
      return await verifyHls(finalUrl, body, headers)
    }

    return null
  } catch {
    return null
  }
}

async function verifyHls(masterUrl, masterBody, headers) {
  const mText = Buffer.from(masterBody || []).toString('utf8')
  if (!mText.includes('#EXTM3U')) return null

  const variantUrl = firstUrlLine(mText, masterUrl)
  if (!variantUrl) return null

  const variant = await axios.get(variantUrl, {
    headers,
    timeout: 5000,
    family: 4,
    responseType: 'arraybuffer',
    validateStatus: () => true,
  })
  if (variant.status !== 200) return null
  const vText = Buffer.from(variant.data || []).toString('utf8')
  if (!vText.includes('#EXTM3U')) return null

  const segUrl = firstUrlLine(vText, variantUrl)
  if (!segUrl) return null

  if (await segmentIsVideo(segUrl, headers)) return masterUrl
  return null
}

async function segmentIsVideo(segUrl, headers) {
  try {
    const res = await axios({
      url: segUrl,
      method: 'GET',
      headers: { ...headers, Range: 'bytes=0-255' },
      timeout: 5000,
      family: 4,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    })
    if (res.status !== 200 && res.status !== 206) return false
    const ct = (res.headers['content-type'] || '').toLowerCase()
    if (ct.includes('image/') || ct.includes('text/html')) return false
    if (ct.startsWith('video/') || ct.includes('mp2t') || ct.includes('octet-stream') || ct.includes('mpegurl')) return true
    const buf = Buffer.from(res.data || [])
    if (buf.length >= 4 && (buf[0] === 0x47 || buf.subarray(4, 8).toString('latin1') === 'ftyp')) return true
    return false
  } catch {
    return false
  }
}

function firstUrlLine(text, base) {
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    return resolveUrl(t, base)
  }
  return null
}

function resolveUrl(u, base) {
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  try {
    return new URL(u, base).href
  } catch {
    return null
  }
}

async function fetchSubtitles(suburl, html, paths, headers) {
  // Prefer subtitle tracks embedded in any playlist.json.
  for (const p of paths) {
    try {
      const res = await axios.get(`${XPLAY_HOST}${p}`, {
        headers,
        timeout: 4000,
        family: 4,
        validateStatus: () => true,
      })
      const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
      const tracks = data?.playlist?.[0]?.tracks || []
      const subs = tracks
        .filter((t) => t.kind === 'captions' || t.kind === 'subtitles')
        .map((t) => ({ label: t.label || 'Unknown', file: resolveUrl(t.file, XPLAY_HOST) }))
      if (subs.length) return subs
    } catch {}
  }

  if (suburl) {
    const apiSubs = await fetchSubtitleApi(suburl)
    if (apiSubs) return apiSubs
  }
  return []
}

function extractPlaylistPaths(html) {
  const paths = []
  const target = 'playlist.json'
  let idx = 0
  while (idx < html.length) {
    const endIdx = html.indexOf(target, idx)
    if (endIdx === -1) break
    const quoteIdx = html.lastIndexOf('"', endIdx)
    if (quoteIdx !== -1) {
      const path = html.substring(quoteIdx + 1, endIdx + target.length)
      if (path.startsWith('/') && !paths.includes(path)) paths.push(path)
    }
    idx = endIdx + 1
  }
  return paths
}

function extractSuburl(html) {
  const match = html.match(/suburl\s*=\s*"([^"]+)"/)
  return match ? match[1] : null
}

async function fetchSubtitleApi(suburl) {
  try {
    const res = await axios.get(suburl, {
      headers: { 'User-Agent': UA, Referer: 'https://play.xpass.top/' },
      timeout: 10000,
      family: 4,
    })
    if (Array.isArray(res.data)) {
      return res.data.map((s) => ({ label: s.label || s.language || 'Unknown', file: resolveUrl(s.url || s.file, XPLAY_HOST) }))
    }
  } catch {}
  return null
}
