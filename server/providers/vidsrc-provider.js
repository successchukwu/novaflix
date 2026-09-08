import axios from 'axios'
import { verifyHlsUrl } from './verify.js'
import { isBlocked, reportFailure, reportSuccess } from './providerHealth.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

const DOMAINS = [
  // Prioritize domains that actually resolve (tested 2026-09-03):
  // vidsrc.me works, vidsrc.su works, others are dead (EAI_AGAIN/404)
  'vidsrc.me',
  'vidsrc.su',
  'vidsrc.to',
  'vidsrc.fyi',
  'vidsrc.cc',
  'vidsrc.sbs',
  'vidsrc.xyz',
  'vidsrc.dev',
  'vidsrc.rip',
  'vidsrc.vc',
  'vidsrc.ink',
]

export default {
  name: 'vidsrc-multi',
  priority: 3,

  async resolve(tmdbId, type, season, episode) {
    const candidates = DOMAINS.filter(d => !isBlocked(`https://${d}/`))
    if (candidates.length === 0) throw new Error('vidsrc-multi: all domains blacklisted')

    const attempts = await Promise.allSettled(
      candidates.map(domain => tryDomain(domain, tmdbId, type, season, episode))
    )

    const errors = []
    for (let i = 0; i < candidates.length; i++) {
      const a = attempts[i]
      const domain = candidates[i]
      if (a.status === 'fulfilled' && a.value) {
        reportSuccess(`https://${domain}/`)
        return a.value
      }
      const reason = a.status === 'rejected' ? String(a.reason?.message || a.reason) : 'no stream found'
      errors.push(`${domain}: ${reason.slice(0, 60)}`)
      if (!reason.includes('no stream found')) {
        reportFailure(`https://${domain}/`, reason.slice(0, 40))
      }
    }
    throw new Error('vidsrc-multi: ' + errors.join('; '))
  },
}

async function tryDomain(domain, tmdbId, type, season, episode) {
  const embedUrl = season
    ? `https://${domain}/embed/tv/${tmdbId}/${season}/${episode}`
    : `https://${domain}/embed/movie/${tmdbId}`

  const res = await axios.get(embedUrl, {
    headers: { 'User-Agent': UA, Referer: `https://${domain}/` },
    timeout: 6000,
    family: 4,
    validateStatus: () => true,
  })
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
  const html = res.data

  if (html.includes('cf-browser-verification') || html.includes('__cf_chl')) {
    throw new Error('cloudflare')
  }

  const iframes = [...html.matchAll(/<iframe[^>]*src="([^"]+)/gi)].map(m => m[1])
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)/gi)].map(m => m[1])

  for (const src of [...iframes, ...scripts]) {
    const fullUrl = src.startsWith('http') ? src : new URL(src, embedUrl).href
    try {
      const fr = await axios.get(fullUrl, {
        headers: { 'User-Agent': UA, Referer: embedUrl },
        timeout: 5000,
        family: 4,
        validateStatus: () => true,
      })
      const fhtml = fr.data

      const m3u8s = extractM3U8(typeof fhtml === 'string' ? fhtml : JSON.stringify(fhtml))
      for (const m3u8 of m3u8s) {
        const ok = await verifyHlsUrl(m3u8, embedUrl)
        if (ok) return { streamUrl: m3u8, subtitles: [] }
      }
    } catch {}
  }

  const m3u8s = extractM3U8(html)
  for (const m3u8 of m3u8s) {
    const ok = await verifyHlsUrl(m3u8, embedUrl)
    if (ok) return { streamUrl: m3u8, subtitles: [] }
  }

  throw new Error('no stream found')
}

function extractM3U8(text) {
  if (!text || typeof text !== 'string') return []
  const results = new Set()

  const patterns = [
    /https?:\/\/[^"'<\s]+\.m3u8[^"'<\s]*/gi,
    /<source[^>]*src="([^"]+\.m3u8[^"]*)/gi,
    /"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/gi,
    /'file'\s*:\s*'([^']+\.m3u8[^']*)'/gi,
    /data-hls\s*=\s*"([^"]+)"/gi,
    /"hls"\s*:\s*"([^"]+)"/gi,
    /"url"\s*:\s*"([^"]+\.m3u8[^"]*)"/gi,
    /"playUrl"\s*:\s*"([^"]+)"/gi,
    /"stream"\s*:\s*"([^"]+)"/gi,
    /"playlist_url"\s*:\s*"([^"]+)"/gi,
  ]

  for (const p of patterns) {
    for (const m of text.matchAll(p)) {
      const url = m[1] || m[0]
      if (url.startsWith('http') && !url.includes('favicon')) results.add(decodeURIComponent(url))
    }
  }

  return [...results]
}
