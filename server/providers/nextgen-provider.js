import axios from 'axios'
import { verifyHlsUrl } from './verify.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

export default {
  name: 'nextgencloudfabric',
  priority: 1,

  async resolve(tmdbId, type, season, episode) {
    const url = `https://nextgencloudfabric.com/embed/source-api.php?tmdb=${tmdbId}`
    const res = await axios.get(url, {
      headers: { 'User-Agent': UA, Referer: 'https://nextgencloudfabric.com/' },
      timeout: 6000,
      family: 4,
      validateStatus: () => true,
    })
    if (res.status === 404) throw new Error('nextgen: API 404 — provider may be deprecated')
    if (res.status !== 200) throw new Error(`nextgen: HTTP ${res.status}`)

    const data = res.data
    if (data.status_code !== '200' || !data.data?.stream_urls?.length) {
      throw new Error('no streams from nextgen')
    }

    for (const streamUrl of data.data.stream_urls) {
      if (!streamUrl?.startsWith('http')) continue
      if (streamUrl.includes('/video/error') || streamUrl.includes('/error')) continue
      const ok = await verifyHlsUrl(streamUrl, 'https://nextgencloudfabric.com/')
      if (ok) {
        return {
          streamUrl,
          subtitles: (data.data.default_subs || []).map(s => ({
            label: s.label || 'Unknown',
            file: s.file,
          })),
        }
      }
    }
    throw new Error('nextgen: no verified stream')
  },
}
