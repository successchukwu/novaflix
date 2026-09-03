import pool from '../config/database.js'

export function search(req, res) {
  const { query, type } = req.query
  if (!query) return res.status(400).json({ error: 'Query param is required' })

  const mediaType = type === 'tv' ? 'tv' : 'movie'
  const tmdb = req.app.locals.tmdb

  tmdb.get(`/search/${mediaType}`, {
    params: { query, language: 'en-US', page: 1 },
  })
    .then(({ data }) => {
      const results = data.results.map((m) => ({
        id: m.id,
        title: m.title || m.name,
        year: (m.release_date || m.first_air_date || '').split('-')[0] || 'N/A',
        poster: m.poster_path
          ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
          : null,
        backdrop: m.backdrop_path
          ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}`
          : null,
        overview: m.overview || '',
        type: mediaType,
        premium: (m.vote_average || 0) >= 8,
      }))
      res.json({ success: true, data: results })
    })
    .catch((err) => {
      // Include code/status — some TMDB transport failures have empty messages.
      console.error(`[tmdb] search failed: ${err.code || ''} ${err.response?.status || ''} ${err.message}`)
      res.json({ success: false, error: 'Failed to resolve metadata from TMDB' })
    })
}

export function details(req, res) {
  const { id, type } = req.query
  if (!id) return res.status(400).json({ error: 'TMDB ID is required' })

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  if (isUuid || type === 'creator') {
    pool.query(
      `SELECT * FROM uploads WHERE id::text = $1`,
      [id]
    )
      .then(({ rows }) => {
        const upload = rows[0]
        if (!upload) {
          return res.json({ success: false, error: 'Content not found' })
        }
        const base = {
          id: upload.id,
          title: upload.title,
          year: upload.created_at ? new Date(upload.created_at).getFullYear().toString() : '',
          releaseDate: upload.created_at || null,
          poster: upload.thumbnail_url ? `/api/stream/creator/${upload.id}-thumb.jpg` : null,
          backdrop: upload.thumbnail_url ? `/api/stream/creator/${upload.id}-thumb.jpg` : null,
          overview: upload.description || '',
          rating: 0,
          genres: upload.genre ? [upload.genre] : [],
          trailerKey: null,
          type: 'movie',
          premium: false,
          runtime: upload.duration_seconds || null,
          source: 'creator',
          creatorViewCount: upload.views || 0,
        }
        res.json({ success: true, data: base })
      })
      .catch((err) => {
        console.error(err.message)
        res.json({ success: false, error: 'Failed to fetch details' })
      })
    return
  }

  const mediaType = type === 'tv' ? 'tv' : 'movie'
  const tmdb = req.app.locals.tmdb

  Promise.all([
    tmdb.get(`/${mediaType}/${id}`, { params: { language: 'en-US' } }),
    tmdb.get(`/${mediaType}/${id}/videos`, { params: { language: 'en-US' } }),
  ])
    .then(([detailRes, videosRes]) => {
      const media = detailRes.data
      const trailer = videosRes.data.results.find(
        (v) => v.type === 'Trailer' && v.site === 'YouTube'
      )

      const base = {
        id: media.id,
        title: media.title || media.name,
        year: (media.release_date || media.first_air_date || '').split('-')[0] || 'N/A',
        releaseDate: media.release_date || media.first_air_date || null,
        poster: media.poster_path
          ? `https://image.tmdb.org/t/p/w500${media.poster_path}`
          : null,
        backdrop: media.backdrop_path
          ? `https://image.tmdb.org/t/p/w1280${media.backdrop_path}`
          : null,
        overview: media.overview || '',
        rating: media.vote_average || 0,
        genres: (media.genres || []).map((g) => g.name),
        trailerKey: trailer ? trailer.key : null,
        type: mediaType,
        premium: (media.vote_average || 0) >= 8,
      }

      if (mediaType === 'tv') {
        base.seasons = (media.seasons || [])
          .filter((s) => s.season_number > 0)
          .map((s) => ({
            season: s.season_number,
            episodes: s.episode_count,
            name: s.name,
          }))
        base.runtime = media.episode_run_time?.[0] || null
        base.totalSeasons = media.number_of_seasons
      } else {
        base.runtime = media.runtime
      }

      res.json({ success: true, data: base })
    })
    .catch((err) => {
      console.error(err.message)
      res.json({ success: false, error: 'Failed to fetch details' })
    })
}

const MIN_YEAR = new Date().getFullYear() - 2

export function getTrending(req, res) {
  const tmdb = req.app.locals.tmdb

  Promise.all([
    tmdb.get('/trending/movie/week', { params: { language: 'en-US' } }),
    tmdb.get('/trending/tv/week', { params: { language: 'en-US' } }),
  ])
    .then(([movieRes, tvRes]) => {
      const movies = (movieRes.data.results || [])
        .map((m) => ({
          id: m.id,
          title: m.title || m.name,
          year: (m.release_date || m.first_air_date || '').split('-')[0] || 'N/A',
          poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
          backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : null,
          overview: m.overview || '',
          type: 'movie',
          premium: (m.vote_average || 0) >= 8,
        }))
        .filter((m) => {
          const y = parseInt(m.year)
          return !isNaN(y) && y >= MIN_YEAR
        })
      const tv = (tvRes.data.results || [])
        .map((t) => ({
          id: t.id,
          title: t.name || t.title,
          year: (t.first_air_date || t.release_date || '').split('-')[0] || 'N/A',
          poster: t.poster_path ? `https://image.tmdb.org/t/p/w500${t.poster_path}` : null,
          backdrop: t.backdrop_path ? `https://image.tmdb.org/t/p/w1280${t.backdrop_path}` : null,
          overview: t.overview || '',
          type: 'tv',
          premium: (t.vote_average || 0) >= 8,
        }))
        .filter((t) => {
          const y = parseInt(t.year)
          return !isNaN(y) && y >= MIN_YEAR
        })
      res.json({ success: true, data: { movies, tv } })
    })
    .catch((err) => {
      console.error(err.message)
      res.json({ success: false, error: 'Failed to fetch trending' })
    })
}

export function getNowPlaying(req, res) {
  const tmdb = req.app.locals.tmdb

  tmdb.get('/movie/now_playing', { params: { language: 'en-US', page: 1 } })
    .then(({ data }) => {
      const results = (data.results || [])
        .map((m) => ({
          id: m.id,
          title: m.title || m.name,
          year: (m.release_date || '').split('-')[0] || 'N/A',
          poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
          backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : null,
          overview: m.overview || '',
          type: 'movie',
          premium: (m.vote_average || 0) >= 8,
        }))
        .filter((m) => {
          const y = parseInt(m.year)
          return !isNaN(y) && y >= MIN_YEAR
        })
      res.json({ success: true, data: results })
    })
    .catch((err) => {
      console.error(err.message)
      res.json({ success: false, error: 'Failed to fetch now playing' })
    })
}

export function getGenres(req, res) {
  const tmdb = req.app.locals.tmdb
  const type = req.query.type === 'tv' ? 'tv' : 'movie'

  tmdb.get(`/genre/${type}/list`, { params: { language: 'en-US' } })
    .then(({ data }) => {
      res.json({ success: true, data: data.genres || [] })
    })
    .catch((err) => {
      console.error(err.message)
      res.json({ success: false, error: 'Failed to fetch genres' })
    })
}

export async function searchCategories(req, res) {
  try {
    const { q } = req.query
    if (!q || q.trim().length < 2) {
      return res.json({ success: true, categories: [] })
    }
    const query = `%${q.trim()}%`
    
    const tmdb = req.app.locals.tmdb
    const [{ data: movieGenres }, { data: tvGenres }] = await Promise.all([
      tmdb.get('/genre/movie/list', { params: { language: 'en-US' } }),
      tmdb.get('/genre/tv/list', { params: { language: 'en-US' } }),
    ])
    
    const allGenres = [
      ...(movieGenres.genres || []).map(g => ({ ...g, type: 'movie' })),
      ...(tvGenres.genres || []).map(g => ({ ...g, type: 'tv' })),
    ]
    
    const matched = allGenres.filter(g => g.name.toLowerCase().includes(q.trim().toLowerCase()))
    
    // Also search creator upload genres from database
    const pool = (await import('../config/database.js')).default
    const { rows: creatorGenres } = await pool.query(
      `SELECT DISTINCT genre FROM uploads WHERE genre ILIKE $1 LIMIT 20`,
      [query]
    )
    
    const categories = [
      ...matched.map(g => ({ id: g.id, name: g.name, type: g.type, source: 'tmdb' })),
      ...creatorGenres.map(g => ({ id: g.genre.toLowerCase().replace(/\s+/g, '-'), name: g.genre, type: 'creator', source: 'creator' })),
    ]
    
    res.json({ success: true, categories: categories.slice(0, 20) })
  } catch (err) {
    console.error(err.message)
    res.status(500).json({ error: err.message })
  }
}

export function getCategoryMovies(req, res) {
  const tmdb = req.app.locals.tmdb
  const { id, type, page } = req.query
  if (!id) return res.status(400).json({ error: 'Genre ID is required' })

  const mediaType = type === 'tv' ? 'tv' : 'movie'
  const pageNum = Math.min(Math.max(parseInt(page, 10) || 1, 1), 500)

  tmdb.get(`/discover/${mediaType}`, {
    params: { with_genres: id, language: 'en-US', sort_by: 'popularity.desc', page: pageNum },
  })
    .then(({ data }) => {
      const results = (data.results || []).map((m) => ({
        id: m.id,
        title: m.title || m.name,
        year: (m.release_date || m.first_air_date || '').split('-')[0] || 'N/A',
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
        backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : null,
        overview: m.overview || '',
        type: mediaType,
        premium: (m.vote_average || 0) >= 8,
      }))

      res.json({ success: true, data: results, total_pages: data.total_pages || 1, page: pageNum })
    })
    .catch((err) => res.status(500).json({ error: err.message }))
}

export function getDiscover(req, res) {
  const tmdb = req.app.locals.tmdb
  const { genre_id, type, sort_by, page, min_votes, with_keywords, with_companies, with_original_language, with_origin_country, region, watch_region, primary_release_date_gte, primary_release_date_lte } = req.query
  const mediaType = type === 'tv' ? 'tv' : 'movie'
  const pageNum = Math.min(Math.max(parseInt(page, 10) || 1, 1), 500)
  const params = {
    language: 'en-US',
    sort_by: sort_by || 'popularity.desc',
    page: pageNum,
  }
  if (genre_id) params.with_genres = genre_id
  if (min_votes) params['vote_count.gte'] = parseInt(min_votes, 10)
  if (with_keywords) params.with_keywords = with_keywords
  if (with_companies) params.with_companies = with_companies
  if (with_original_language) params.with_original_language = with_original_language
  if (with_origin_country) params.with_origin_country = with_origin_country
  if (region) params.region = region
  if (watch_region) params.watch_region = watch_region
  if (primary_release_date_gte) params['primary_release_date.gte'] = primary_release_date_gte
  if (primary_release_date_lte) params['primary_release_date.lte'] = primary_release_date_lte

  tmdb.get(`/discover/${mediaType}`, { params })
    .then(({ data }) => {
      const results = (data.results || []).map((m) => ({
        id: m.id,
        title: m.title || m.name,
        year: (m.release_date || m.first_air_date || '').split('-')[0] || 'N/A',
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
        backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : null,
        overview: m.overview || '',
        type: mediaType,
        premium: (m.vote_average || 0) >= 8,
      }))
      res.json({ success: true, data: results, total_pages: data.total_pages || 1, page: pageNum })
    })
    .catch((err) => res.status(500).json({ error: err.message }))
}

export async function seedActors(req, res) {
  const tmdb = req.app.locals.tmdb
  const { upsertActor } = await import('../db.js')

  const pages = Math.min(parseInt(req.query.pages, 10) || 3, 3)
  let count = 0

  try {
    for (let page = 1; page <= pages; page++) {
      const { data } = await tmdb.get('/person/popular', {
        params: { language: 'en-US', page },
      })
      for (const person of data.results || []) {
        await upsertActor({
          tmdbId: person.id,
          name: person.name,
          avatar: person.profile_path
            ? `https://image.tmdb.org/t/p/w500${person.profile_path}`
            : null,
          biography: person.biography || '',
          knownForDepartment: person.known_for_department || '',
          popularity: person.popularity || 0,
        })
        count++
      }
    }
    res.json({ success: true, data: { seeded: count } })
  } catch (err) {
    console.error(err.message)
    res.status(500).json({ success: false, error: 'Failed to seed actors' })
  }
}

export function tvSeason(req, res) {
  const { id, season } = req.query
  if (!id || !season) return res.status(400).json({ error: 'ID and season required' })

  const tmdb = req.app.locals.tmdb

  tmdb.get(`/tv/${id}/season/${season}`, {
    params: { language: 'en-US' },
  })
    .then(({ data }) => {
      res.json({
        success: true,
        episodes: (data.episodes || []).map((e) => ({
          episode: e.episode_number,
          name: e.name,
        })),
      })
    })
    .catch((err) => {
      console.error(err.message)
      res.json({ success: false, error: 'Failed to fetch season data' })
    })
}

function normalizeResult(m, type) {
  return {
    id: m.id,
    title: m.title || m.name || 'Untitled',
    year: (m.release_date || m.first_air_date || '').split('-')[0] || '',
    poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : m.poster || null,
    type,
    rating: m.vote_average || 0,
    overview: m.overview || '',
    source: 'tmdb',
  }
}

export async function searchAll(req, res) {
  try {
    const { q } = req.query
    if (!q) return res.status(400).json({ error: 'Query param required' })

    const tmdb = req.app.locals.tmdb
    const results = []

    // 1. TMDB movies
    try {
      const { data } = await tmdb.get('/search/movie', { params: { query: q, language: 'en-US' } })
      for (const m of (data.results || []).slice(0, 10)) {
        results.push(normalizeResult(m, 'movie'))
      }
    } catch {}

    // 2. TMDB TV
    try {
      const { data } = await tmdb.get('/search/tv', { params: { query: q, language: 'en-US' } })
      for (const m of (data.results || []).slice(0, 10)) {
        results.push(normalizeResult(m, 'tv'))
      }
    } catch {}

    // 3. Creator uploads
    try {
      const { rows } = await pool.query(
        `SELECT id, title, description, genre, filename, thumbnail_url, views, created_at
         FROM uploads WHERE status = 'active' AND title ILIKE $1
         ORDER BY views DESC LIMIT 10`,
        [`%${q}%`]
      )
      for (const r of rows) {
        results.push({
          id: r.id,
          title: r.title,
          year: r.created_at ? new Date(r.created_at).getFullYear().toString() : '',
          poster: r.thumbnail_url ? `/api/stream/creator/${r.id}-thumb.jpg` : null,
          type: 'movie',
          rating: 0,
          overview: r.description || '',
          source: 'creator',
          url: `/api/stream/creator/${r.id}.mp4`,
        })
      }
    } catch {}

    // 4. Archive items
    try {
      const { rows } = await pool.query(
        `SELECT id, title, description, image_url, created_at
         FROM archive_items WHERE title ILIKE $1
         ORDER BY created_at DESC LIMIT 5`,
        [`%${q}%`]
      )
      for (const r of rows) {
        results.push({
          id: r.id,
          title: r.title,
          year: r.created_at ? new Date(r.created_at).getFullYear().toString() : '',
          poster: r.image_url || null,
          type: 'movie',
          rating: 0,
          overview: r.description || '',
          source: 'archive',
        })
      }
    } catch {}

    res.json({ success: true, data: results })
    console.log(`[search] q="${q}" -> ${results.length} results`)
  } catch (err) {
    console.error(`[search] error q="${req.query.q || ''}":`, err?.message)
    res.status(500).json({ error: err.message })
  }
}

export function credits(req, res) {
  const { id, type } = req.query
  if (!id) return res.status(400).json({ error: 'TMDB ID is required' })

  const mediaType = type === 'tv' ? 'tv' : 'movie'
  const tmdb = req.app.locals.tmdb

  tmdb.get(`/${mediaType}/${id}/credits`, { params: { language: 'en-US' } })
    .then(({ data }) => {
      const cast = (data.cast || [])
        .filter((c) => c.name)
        .map((c) => ({
          id: c.id,
          name: c.name,
          character: c.character || '',
          profile_path: c.profile_path || null,
          order: c.order ?? 999,
        }))
        .sort((a, b) => a.order - b.order)
        .slice(0, 24)

      const crew = (data.crew || [])
        .filter((c) => c.name)
        .map((c) => ({
          id: c.id,
          name: c.name,
          job: c.job || c.department || '',
          profile_path: c.profile_path || null,
        }))
        .filter((c) => ['Director', 'Producer', 'Writer', 'Executive Producer', 'Screenplay', 'Cinematography', 'Editor', 'Original Music Composer', 'Music'].includes(c.job))
        .slice(0, 12)

      res.json({ success: true, id, type: mediaType, cast, crew })
    })
    .catch((err) => {
      console.error(err.message)
      res.status(500).json({ success: false, error: 'Failed to fetch credits' })
    })
}

export function getPersonCredits(req, res) {
  const { id } = req.params
  if (!id) return res.status(400).json({ error: 'Person ID is required' })

  const tmdb = req.app.locals.tmdb

  tmdb.get(`/person/${id}/combined_credits`, { params: { language: 'en-US' } })
    .then(({ data }) => {
      const sortByPopularity = (arr) => arr
        .filter((c) => c.media_type === 'movie' || c.media_type === 'tv')
        .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
        .slice(0, 20)
        .map((c) => ({
          id: c.id,
          title: c.title || c.name || '',
          poster: c.poster_path
            ? `https://image.tmdb.org/t/p/w500${c.poster_path}`
            : null,
          backdrop: c.backdrop_path
            ? `https://image.tmdb.org/t/p/w1280${c.backdrop_path}`
            : null,
          type: c.media_type === 'tv' ? 'tv' : 'movie',
          year: (c.release_date || c.first_air_date || '').split('-')[0] || 'N/A',
          overview: c.overview || '',
          character: c.character || '',
          premium: (c.vote_average || 0) >= 8,
        }))

      const cast = sortByPopularity(data.cast || [])
      const crew = sortByPopularity(data.crew || [])

      res.json({
        success: true,
        id,
        name: data.name || '',
        profile_path: data.profile_path
          ? `https://image.tmdb.org/t/p/w500${data.profile_path}`
          : null,
        cast,
        crew,
      })
    })
    .catch((err) => {
      console.error(err.message)
      res.status(500).json({ success: false, error: 'Failed to fetch person credits' })
    })
}

// Batch check for creator profiles by TMDB person IDs
export async function batchCheckCreators(req, res) {
  try {
    const { tmdbIds } = req.query
    if (!tmdbIds) return res.status(400).json({ error: 'tmdbIds required' })
    
    const ids = tmdbIds.split(',').map(Number).filter(n => !isNaN(n))
    const { rows } = await pool.query(
      `SELECT tmdb_person_id FROM creator_profiles WHERE tmdb_person_id = ANY($1)`,
      [ids]
    )
    
    res.json({ 
      success: true, 
      linked: rows.map(r => r.tmdb_person_id) 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export function searchPerson(req, res) {
  const { query } = req.query
  if (!query) return res.status(400).json({ error: 'Query param is required' })

  const tmdb = req.app.locals.tmdb

  tmdb.get('/search/person', { params: { query, language: 'en-US', page: 1 } })
    .then(({ data }) => {
      const results = (data.results || []).map((p) => ({
        id: p.id,
        name: p.name || '',
        profile_path: p.profile_path
          ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
          : null,
        known_for_department: p.known_for_department || '',
        known_for: (p.known_for || []).map((m) => ({
          id: m.id,
          title: m.title || m.name || '',
          poster: m.poster_path
            ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
            : null,
          type: m.media_type === 'tv' ? 'tv' : 'movie',
          year: (m.release_date || m.first_air_date || '').split('-')[0] || 'N/A',
        })),
      }))
      res.json({ success: true, data: results })
    })
    .catch((err) => {
      console.error(err.message)
      res.json({ success: false, error: 'Failed to search people' })
    })
}
