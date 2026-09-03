import pool from '../config/database.js'
import { getShortsFeed } from '../db.js'

const CACHE_TTL = 60 * 1000
let feedCache = null
let feedCacheTime = 0
let promotedCache = null
let promotedCacheTime = 0
let campaignAdsCache = null
let campaignAdsCacheTime = 0

export async function getFeed(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1)
    const limit = 10
    const tmdb = req.app.locals.tmdb
    if (!tmdb) return res.status(500).json({ error: 'TMDB not configured' })

    const now = Date.now()
    let allItems = []

    if (feedCache && now - feedCacheTime < CACHE_TTL) {
      allItems = feedCache
    } else {
      const [movieTrending, tvTrending] = await Promise.all([
        tmdb.get('/trending/movie/week', { params: { language: 'en-US' } }).then(r => r.data.results || []).catch(() => []),
        tmdb.get('/trending/tv/week', { params: { language: 'en-US' } }).then(r => r.data.results || []).catch(() => []),
      ])

      const candidates = [
        ...movieTrending.slice(0, 10).map(m => ({ ...m, mediaType: 'movie' })),
        ...tvTrending.slice(0, 10).map(t => ({ ...t, mediaType: 'tv' })),
      ]

      const videoResults = await Promise.allSettled(
        candidates.map(item =>
          tmdb.get(`/${item.mediaType}/${item.id}/videos`, { params: { language: 'en-US' } })
            .then(r => ({ item, videos: r.data.results || [] }))
            .catch(() => ({ item, videos: [] }))
        )
      )

      for (const result of videoResults) {
        if (result.status !== 'fulfilled') continue
        const { item, videos } = result.value
        const trailer = videos.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
        if (!trailer) continue

        allItems.push({
          id: `hook-${item.mediaType}-${item.id}`,
          videoUrl: `https://www.youtube.com/embed/${trailer.key}?enablejsapi=1&autoplay=0&mute=1`,
          poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
          title: item.title || item.name,
          year: (item.release_date || item.first_air_date || '').split('-')[0] || 'N/A',
          type: 'trailer',
          promoted: false,
          mediaId: item.id,
          mediaType: item.mediaType,
        })
      }

      feedCache = allItems
      feedCacheTime = now
    }

    // Merge user-uploaded R2 shorts into the rotation
    try {
      const shorts = await getShortsFeed(40, 0, req.userId || null)
      const shortItems = shorts.map((s) => ({
        id: `short-${s.id}`,
        videoUrl: s.video_url,
        poster: s.thumbnail_url || null,
        title: s.title,
        year: '',
        type: 'short',
        promoted: false,
        shortId: s.id,
        creatorId: s.user_id,
        creatorName: s.creator_name,
        creatorAvatar: s.creator_avatar,
        views: s.views,
        likes: s.likes,
        description: s.description,
        likesCount: s.likes,
        bookmarksCount: s.bookmarks || 0,
        commentsCount: s.comments || 0,
        shares: s.shares || 0,
        liked: !!s.liked,
        bookmarked: !!s.bookmarked,
        following: !!s.isFollowingCreator,
      }))
      const merged = []
      let si = 0
      for (let i = 0; i < allItems.length; i++) {
        if (i > 0 && i % 4 === 0 && si < shortItems.length) merged.push(shortItems[si++])
        merged.push(allItems[i])
      }
      while (si < shortItems.length) merged.push(shortItems[si++])
      allItems = merged
    } catch (e) {}

    // Inject live creator streams at the top of the rotation (time-sensitive)
    try {
      const { rows: liveStreams } = await pool.query(
        `SELECT s.id, s.creator_id, s.title, s.started_at, s.viewer_count,
                u.name as creator_name, u.avatar as creator_avatar
         FROM creator_streams s
         JOIN users u ON u.id = s.creator_id
         WHERE s.status = 'live'
         ORDER BY s.started_at ASC LIMIT 5`
      )
      const liveItems = liveStreams.map((s) => ({
        id: `live-${s.id}`,
        videoUrl: `/creator/stream/${s.id}`,
        poster: s.creator_avatar,
        title: s.title,
        year: '',
        type: 'live',
        live: true,
        promoted: false,
        streamId: s.id,
        creatorId: s.creator_id,
        creatorName: s.creator_name,
        viewerCount: s.viewer_count,
        startedAt: s.started_at,
      }))
      if (liveItems.length) allItems = [...liveItems, ...allItems]
    } catch (e) {}

    // Fetch promoted content from active hooks campaigns
    const nowTime = Date.now()
    if (!promotedCache || nowTime - promotedCacheTime > CACHE_TTL) {
      const { rows: promoted } = await pool.query(
        `SELECT ac.*, u.name as creator_name FROM ad_campaigns ac
         LEFT JOIN users u ON u.id = ac.creator_id
         WHERE ac.active = true AND ac.approved = true
         AND ac.promotion_type = 'hooks'
         AND (ac.start_date IS NULL OR ac.start_date <= NOW())
         AND (ac.end_date IS NULL OR ac.end_date >= NOW())
         AND (ac.max_impressions = 0 OR ac.current_impressions < ac.max_impressions)
         ORDER BY ac.created_at DESC LIMIT 5`
      )
      promotedCache = promoted.map(p => ({
        id: `promo-${p.id}`,
        videoUrl: p.creative_type === 'video' ? p.creative_url : null,
        poster: p.creative_type === 'image' ? p.creative_url : null,
        title: p.advertiser_name,
        year: '',
        type: 'trailer',
        promoted: true,
        sponsorName: p.advertiser_name,
        creatorName: p.creator_name || null,
      }))
      promotedCacheTime = nowTime
    }

    // Fetch campaign ad creatives for full ad slots
    if (!campaignAdsCache || nowTime - campaignAdsCacheTime > CACHE_TTL) {
      const { rows: ads } = await pool.query(
        `SELECT ac.*, ap.position_type, ap.duration_seconds, ap.skip_after_seconds
         FROM ad_campaigns ac
         JOIN ad_placements ap ON ap.campaign_id = ac.id
         WHERE ac.active = true AND ac.approved = true
         AND ac.promotion_type IN ('grid', 'hooks', 'banner')
         AND (ac.max_impressions = 0 OR ac.current_impressions < ac.max_impressions)
         AND (ac.start_date IS NULL OR ac.start_date <= NOW())
         AND (ac.end_date IS NULL OR ac.end_date >= NOW())
         ORDER BY ac.created_at DESC LIMIT 20`
      )
      campaignAdsCache = ads.map(a => ({
        id: `campaign-ad-${a.id}`,
        videoUrl: a.creative_type === 'video' ? a.creative_url : null,
        poster: a.creative_type === 'image' ? a.creative_url : null,
        title: a.advertiser_name,
        year: '',
        type: 'ad',
        promoted: false,
        sponsorName: a.advertiser_name,
        campaignId: a.id,
        creativeType: a.creative_type,
        creativeUrl: a.creative_url,
      }))
      campaignAdsCacheTime = nowTime
    }

    // Interleave: promoted at pos 1, campaign ads at interval, organic feed otherwise
    const userPlan = req.user?.plan || 'free'
    const adInterval = userPlan === 'premium' || userPlan === 'standard' ? 10 : 5
    const startIdx = (page - 1) * limit
    const paged = []
    let feedIdx = startIdx
    let promoIdx = 0
    let adIdx = 0

    for (let i = 0; i < limit; i++) {
      if (i === 1 && promoIdx < promotedCache.length) {
        paged.push(promotedCache[promoIdx++])
        continue
      }
      if (feedIdx < allItems.length) {
        if (i > 0 && i % adInterval === 0 && adIdx < campaignAdsCache.length) {
          const campaignAd = campaignAdsCache[adIdx++]
          paged.push(campaignAd)
          // Increment impression count asynchronously
          pool.query(
            'UPDATE ad_campaigns SET current_impressions = current_impressions + 1 WHERE id = $1',
            [campaignAd.campaignId]
          ).catch(() => {})
        }
        paged.push(allItems[feedIdx])
        feedIdx++
      }
    }

    res.json({ success: true, data: paged, nextPage: feedIdx < allItems.length ? page + 1 : undefined })
  } catch (err) {
    console.error('[hooks]', err.message)
    res.status(500).json({ error: err.message })
  }
}
