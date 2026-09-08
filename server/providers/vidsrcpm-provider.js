import axios from 'axios'
import { verifyHlsUrl } from './verify.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

export default {
  name: 'vidsrc-pm',
  priority: 5,

  async resolve(tmdbId, type, season, episode) {
    const url = `https://vidsrc.pm/embed/source-api.php?tmdb=${tmdbId}`
    const res = await axios.get(url, {
      headers: { 'User-Agent': UA, Referer: 'https://vidsrc.pm/' },
      timeout: 5000,
      family: 4,
      validateStatus: () => true,
    })
    if (res.status === 404) throw new Error('vidsrc-pm: API 404 — provider deprecated')
    if (res.status !== 200) throw new Error(`vidsrc-pm: HTTP ${res.status}`)
    const data = res.data
    if (data.status_code === '200' && data.data?.stream_urls?.length) {
      for (const streamUrl of data.data.stream_urls) {
        if (streamUrl?.startsWith('http')) {
          const ok = await verifyHlsUrl(streamUrl, 'https://vidsrc.pm/')
          if (ok) {
            return {
              streamUrl,
              subtitles: (data.data.default_subs || []).map(s => ({ label: s.label || 'Unknown', file: s.file })),
            }
          }
        }
      }
    }
    throw new Error('vidsrc-pm: no stream')
  },
}
