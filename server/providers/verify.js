import axios from 'axios'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

const COOKIE_CDNS = ['vip.1x2.space', 'mov3.4pa.top', 'cdn.1x2.space', 'tik.1x2.space']

function needsCookie(url) {
  try {
    const host = new URL(url).hostname
    return COOKIE_CDNS.some(d => host === d || host.endsWith('.' + d))
  } catch {
    return false
  }
}

export async function verifyHlsUrl(url, referer) {
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': UA, Referer: referer || 'https://nextgencloudfabric.com/', Range: 'bytes=0-8192' },
      timeout: 5000,
      family: 4,
      validateStatus: () => true,
      responseType: 'arraybuffer',
    })
    if (res.status !== 200 && res.status !== 206) return false
    const body = res.data
    if (!body || body.byteLength < 10) return false
    const ct = (res.headers['content-type'] || '').toLowerCase()
    if (ct.includes('text/html')) return needsCookie(url)

    const text = Buffer.from(body).toString('utf8').substring(0, 200)
    if (text.includes('#EXTM3U') || text.includes('#EXTINF')) {
      return await checkFirstSegment(body, url, referer)
    }

    const head = Buffer.from(body.slice(0, Math.min(16, body.byteLength)))
    const hex = head.toString('hex').toLowerCase()
    if (hex.startsWith('1a45dfa3') || hex.startsWith('000000') || hex.startsWith('4740') || hex.startsWith('66747970')) return true

    if (ct && (ct.startsWith('video/') || ct.startsWith('audio/') || ct.includes('octet-stream') || ct.includes('mpegurl') || ct.includes('mp2t') || ct.includes('mp4'))) return true

    if (!ct.includes('text/') && !ct.startsWith('image/') && body.byteLength > 1000) return true

    return needsCookie(url)
  } catch {
    return needsCookie(url)
  }
}

async function checkFirstSegment(body, playlistUrl, referer) {
  try {
    const text = Buffer.from(body).toString('utf8')
    const lines = text.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'))
    if (lines.length === 0) return false
    const firstSeg = lines[0]
    const segUrl = firstSeg.startsWith('http') ? firstSeg : new URL(firstSeg, playlistUrl).href
    const headRes = await axios({
      url: segUrl, method: 'HEAD', timeout: 5000, family: 4,
      validateStatus: () => true,
      headers: { 'User-Agent': UA, Referer: referer || 'https://nextgencloudfabric.com/' },
    })
    const sct = (headRes.headers['content-type'] || '').toLowerCase()
    if (sct.includes('text/html')) return needsCookie(segUrl)
    return true
  } catch {
    return needsCookie(playlistUrl)
  }
}

export async function quickHead(url, referer) {
  try {
    const res = await axios({ url, method: 'HEAD', timeout: 5000, family: 4, validateStatus: () => true,
      headers: { 'User-Agent': UA, Referer: referer || '' },
    })
    return res.status === 200 || res.status === 206
  } catch {
    return needsCookie(url)
  }
}
