// anidb-provider — port of ani-cli v5.x (scrapes anidb.app) for TV/anime.
// Flow: TMDB title -> anidb.app search -> anime id -> episodes -> language
// embed_url -> HLS master (`file: '...'`) extraction.
import axios from 'axios'

const BASE = 'https://anidb.app'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const tmdbApi = () => axios.create({
  baseURL: 'https://api.themoviedb.org/3',
  headers: process.env.TMDB_ACCESS_TOKEN
    ? { Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}` }
    : {},
  timeout: 10000,
  family: 4,
})

async function tmdbTitle(tmdbId) {
  try {
    const { data } = await tmdbApi().get(`/tv/${tmdbId}`, { params: { language: 'en-US' } })
    return data.name || null
  } catch {
    return null
  }
}

function decodeEntities(str = '') {
  return str
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

async function searchId(title) {
  try {
    const { data } = await axios.get(`${BASE}/browse`, {
      params: { q: title },
      headers: { 'User-Agent': UA },
      timeout: 15000,
      family: 4,
    })
    const html = String(data)
    const matches = [...html.matchAll(/\/anime\/([A-Za-z0-9-]+-[0-9]+)[^>]*alt="([^"]+)"/g)]
    if (matches.length === 0) return { id: null, name: null }
    const [id, name] = matches[0].slice(1)
    return { id, name: decodeEntities(name) }
  } catch (e) {
    console.log(`[anidb] search failed: ${e.message?.slice(0, 80)}`)
    return { id: null, name: null }
  }
}

async function episodes(id) {
  try {
    const { data } = await axios.get(`${BASE}/api/frontend/anime/${id}/episodes`, {
      headers: { 'User-Agent': UA },
      timeout: 15000,
      family: 4,
    })
    if (!Array.isArray(data)) return []
    return data.map(e => ({ id: e.id, number: e.number }))
  } catch (e) {
    console.log(`[anidb] episodes failed: ${e.message?.slice(0, 80)}`)
    return []
  }
}

async function languageEmbedUrl(episodeId) {
  try {
    const { data } = await axios.get(`${BASE}/api/frontend/episode/${episodeId}/languages`, {
      headers: { 'User-Agent': UA },
      timeout: 15000,
      family: 4,
    })
    if (!Array.isArray(data)) return null
    // ani-cli seeks "jpn" (sub) first, then "eng" (dub).
    for (const lang of ['jpn', 'eng']) {
      const item = data.find(l => (l.language === lang) || (l[lang]))
      const embedUrl = item?.embed_url || item?.[lang]?.embed_url
      if (embedUrl) return embedUrl
    }
    return data?.[0]?.embed_url || null
  } catch (e) {
    console.log(`[anidb] languages failed: ${e.message?.slice(0, 80)}`)
    return null
  }
}

async function extractMaster(embedUrl) {
  try {
    const { data } = await axios.get(embedUrl, {
      headers: { 'User-Agent': UA, Referer: `${BASE}/` },
      timeout: 20000,
      family: 4,
      maxRedirects: 5,
    })
    const html = String(data)
    // ani-cli: s|.*file: '([^']*)'.*| -> HLS master url
    let m = html.match(/file\s*:\s*['"]([^'"]+\.(?:m3u8|m3u)[^'"]*)['"]/)
    if (!m) m = html.match(/https?:\/\/[^'"\s]+\.(?:m3u8|m3u)[^'"\s]*/)
    return m ? m[1].replace(/\\\//g, '/') : null
  } catch (e) {
    console.log(`[anidb] extract failed: ${e.message?.slice(0, 80)}`)
    return null
  }
}

export default {
  name: 'anidb',
  priority: 5,
  mediaTypes: ['tv'],

  async resolve(tmdbId, type, season, episode, rid) {
    if (type !== 'tv' || !tmdbId || !episode) return null

    const title = await tmdbTitle(tmdbId)
    if (!title) return null

    const seasonStr = season > 1 ? ` season ${season}` : ''
    const { id, name } = await searchId(`${title}${seasonStr}`)
    if (!id) return null

    const eps = await episodes(id)
    if (eps.length === 0) return null

    const ep = eps.find(e => Number(e.number) === Number(episode))
    if (!ep) return null  // let other providers handle it instead of silently returning ep1's stream
    const embedUrl = await languageEmbedUrl(ep.id)
    if (!embedUrl) return null

    const master = await extractMaster(embedUrl)
    if (!master) return null

    console.log(`[${rid}] [anidb] ${name} e${ep.number} -> ${master.slice(0, 60)}...`)
    return { streamUrl: master, subtitles: [] }
  },
}