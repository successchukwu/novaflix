import { getWatchHistory, getArtistGraph } from '../db.js'
import pool from '../config/database.js'
import * as recommendationService from '../services/recommendationService.js'

const TMDB_BASE = 'https://api.themoviedb.org/3'

function getTmdbClient(req) {
  return req.app.locals.tmdb
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Genres of creator uploads the user has watched.
async function getWatchedCreatorUploads(history) {
  const uploadIds = history
    .map((e) => e.content_id)
    .filter((id) => id && UUID_RE.test(id))
    .slice(0, 20)
  if (uploadIds.length === 0) return []
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT genre FROM uploads WHERE id::text = ANY($1) AND genre IS NOT NULL AND genre != ''`,
      [uploadIds]
    )
    return rows.map((r) => r.genre)
  } catch {
    return []
  }
}

// Active creator uploads whose genre matches the user's interest genres.
async function getCreatorUploadsForGenres(genres, excludedIds) {
  try {
    if (!genres || genres.length === 0) return []
    const genreStrings = genres.map((g) => g.toLowerCase())
    const excl = excludedIds.length > 0 ? excludedIds : ['00000000-0000-0000-0000-000000000000']
    const { rows } = await pool.query(
      `SELECT id, title, description, genre, thumbnail_url, views, created_at
       FROM uploads
       WHERE status = 'active'
         AND genre IS NOT NULL AND genre != ''
         AND LOWER(genre) = ANY($1)
         AND NOT (id::text = ANY($2))
       ORDER BY views DESC
       LIMIT 8`,
      [genreStrings, excl]
    )
    return rows
  } catch {
    return []
  }
}

function normalizeMovie(m, type) {
  return {
    id: m.id,
    title: m.title || m.name,
    year: (m.release_date || m.first_air_date || '').split('-')[0] || 'N/A',
    poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    overview: m.overview || '',
    type,
    rating: m.vote_average || 0,
  }
}

function normalizeUpload(u) {
  return {
    id: u.id,
    title: u.title,
    year: u.created_at ? new Date(u.created_at).getFullYear().toString() : '',
    poster: u.thumbnail_url ? `/api/stream/creator/${u.id}-thumb.jpg` : null,
    overview: u.description || '',
    type: 'movie',
    rating: 0,
    source: 'creator',
  }
}

export async function getRecommendations(req, res) {
  try {
    // Use graph edges for recommendations (artist_graph via recommendationService)
    try {
      const graphRecs = await recommendationService.getGraphRecommendations(req.userId, 6)
      if (graphRecs && graphRecs.length > 0) {
        // Merge graph-based collaborators as recommendations when available
        // Fall through to also add TMDB genre results
      }
    } catch {}
    const history = await getWatchHistory(req.userId)
    const tmdb = getTmdbClient(req)

    const watchedGenres = new Set()
    const watchedIds = new Set()

    for (const entry of history) {
      watchedIds.add(entry.content_id)
    }

    const results = []

    if (watchedIds.size > 0) {
      const ids = [...watchedIds].slice(0, 5)
      for (const id of ids) {
        try {
          const { data } = await tmdb.get(`/movie/${id}`, { params: { language: 'en-US' } })
          if (data.genres) {
            data.genres.forEach(g => watchedGenres.add(g.id))
          }
        } catch {}
      }

      if (watchedGenres.size > 0) {
        const genreIds = [...watchedGenres].slice(0, 3).join(',')
        const { data } = await tmdb.get('/discover/movie', {
          params: { with_genres: genreIds, language: 'en-US', sort_by: 'vote_average.desc', 'vote_count.gte': 50 },
        })
        for (const item of data.results || []) {
          if (!watchedIds.has(item.id)) {
            results.push(normalizeMovie(item, 'movie'))
            if (results.length >= 10) break
          }
        }
      }
    }

    // Creator uploads based on the genres the user has watched.
    const interestGenres = await getWatchedUploadGenres(history)
    if (interestGenres.length > 0) {
      const uploads = await getCreatorUploadsForGenres(interestGenres, [...watchedIds])
      let added = 0
      for (const u of uploads) {
        if (!watchedIds.has(u.id)) {
          results.splice(3 + added, 0, normalizeUpload(u))
          added++
          if (results.length >= 10) break
        }
      }
    }

    // Augment with graph edges (artist_graph) — collaborators from trending trailers
    try {
      const graphEdges = await getArtistGraph(req.userId)
      if (graphEdges && graphEdges.length > 0) {
        for (const edge of graphEdges.slice(0, 3)) {
          // Find shorts / uploads by collaborator to recommend
          const { rows: collabShorts } = await pool.query(
            `SELECT id, title, thumbnail_url, views FROM shorts WHERE user_id = $1 AND status='active' ORDER BY views DESC LIMIT 1`,
            [edge.collab_id]
          )
          if (collabShorts[0] && !results.find(r => String(r.id) === String(collabShorts[0].id))) {
            results.push({
              id: collabShorts[0].id,
              title: collabShorts[0].title,
              year: '',
              poster: collabShorts[0].thumbnail_url,
              overview: `Because you watched ${edge.movie_title || 'a trending film'}`,
              type: 'movie',
              rating: 0,
              source: 'graph',
              collabName: edge.collab_name,
            })
          }
        }
      }
    } catch {}

    if (results.length < 6) {
      const { data } = await tmdb.get('/trending/movie/week', { params: { language: 'en-US' } })
      for (const item of data.results || []) {
        if (!watchedIds.has(item.id) && !results.find(r => r.id === item.id)) {
          results.push(normalizeMovie(item, 'movie'))
          if (results.length >= 12) break
        }
      }
    }

    res.json({ success: true, data: results })
  } catch (err) {
    console.error('[recommendations] Error:', err.message)
    res.json({ success: false, data: [], error: err.message })
  }
}

// Genres of creator uploads the user has watched (interest signal).
async function getWatchedUploadGenres(history) {
  const uploadIds = history
    .map((e) => e.content_id)
    .filter((id) => id && UUID_RE.test(id))
    .slice(0, 20)
  if (uploadIds.length === 0) return []
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT genre FROM uploads WHERE id::text = ANY($1) AND genre IS NOT NULL AND genre != ''`,
      [uploadIds]
    )
    return rows.map((r) => r.genre)
  } catch {
    return []
  }
}

export async function getTrending(req, res) {
  try {
    const tmdb = getTmdbClient(req)
    const [movieRes, tvRes] = await Promise.all([
      tmdb.get('/trending/movie/week', { params: { language: 'en-US' } }),
      tmdb.get('/trending/tv/week', { params: { language: 'en-US' } }),
    ])
    const movies = (movieRes.data.results || []).map(m => normalizeMovie(m, 'movie'))
    const tv = (tvRes.data.results || []).map(t => normalizeMovie(t, 'tv'))
    res.json({ success: true, data: { movies, tv } })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
}

export async function getSimilar(req, res) {
  try {
    const { id } = req.params
    const type = req.query.type || 'movie'
    const tmdb = getTmdbClient(req)
    const { data } = await tmdb.get(`/${type}/${id}/similar`, { params: { language: 'en-US' } })
    const results = (data.results || []).map(m => normalizeMovie(m, type))
    res.json({ success: true, data: results.slice(0, 10) })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
}