/**
 * discoveryController.js
 * ---------------------------------------------------------------------------
 * Spotify-style search & discovery engine for NovaFlix native content.
 *
 * Endpoints implemented here:
 *   GET /api/search?q=<query>      -> hybrid fuzzy search across creators and
 *                                     movies with a prioritised "Top Result"
 *                                     object at the root of the payload.
 *   GET /api/creators/:id          -> full creator aggregate: movies grouped
 *                                     by relationship type (DIRECTED_BY vs
 *                                     ACTED_IN) + "Fans Also Like" creators.
 *
 * Fuzzy matching is powered by Postgres pg_trgm trigram similarity(). If the
 * extension is unavailable (managed-DB permission edge cases) every query has
 * an ILIKE fallback so search degrades gracefully instead of failing.
 *
 * All DB objects backing these queries live in config/schema.sql and
 * migrations/004_discovery_search.sql:
 *   - uploads.format        ('SHORT' | 'LONG')
 *   - uploads.tags          (JSONB array of genre/mood slugs)
 *   - movie_creators        (movie_id <-> creator_id junction, role enum)
 */

import pool from '../config/database.js'
import { search as legacyTmdbSearch } from './tmdbController.js'

// Similarity score above which a creator-name match is promoted to the
// "Top Result" slot at the root of the payload (0 = no match, 1 = exact).
const TOP_RESULT_SIMILARITY_THRESHOLD = 0.45

/** Cached tri-state: is pg_trgm's similarity() usable on this database? */
let trgmAvailable = null

async function detectTrgm() {
  if (trgmAvailable !== null) return trgmAvailable
  try {
    await pool.query("SELECT similarity('abc', 'abd') AS s")
    trgmAvailable = true
  } catch {
    // undefined_function (42883) => extension missing on this host.
    trgmAvailable = false
  }
  return trgmAvailable
}

/** Normalise free text into a comparable slug-ish token string. */
function normalize(text) {
  return String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Rank creators whose name/display_name fuzzily matches `q`.
 * Score = max(similarity(name), similarity(display_name)), boosted slightly
 * when the query is a prefix of the name (Spotify-style instant hits).
 */
async function searchCreators({ q, limit = 8 }) {
  const term = q.trim()
  const like = `%${term}%`

  const selectFields = `
    u.id,
    COALESCE(cp.display_name, u.name) AS name,
    u.name                            AS username,
    u.avatar,
    u.bio,
    u.verified,
    cp.known_for_department,
    cp.tmdb_person_id,
    (SELECT COUNT(*) FROM uploads WHERE user_id = u.id AND status = 'active')                  AS film_count,
    (SELECT COUNT(*) FROM movie_creators WHERE creator_id = u.id AND role = 'DIRECTED_BY') AS directed_count,
    (SELECT COUNT(*) FROM movie_creators WHERE creator_id = u.id AND role = 'ACTED_IN')    AS acted_count,
    (SELECT COUNT(*) FROM followers WHERE following_id = u.id)                 AS followers_count,
    (SELECT COALESCE(SUM(views), 0) FROM uploads WHERE user_id = u.id AND status = 'active') AS total_views`

  if (await detectTrgm()) {
    const { rows } = await pool.query(
      `SELECT ${selectFields},
              GREATEST(
                similarity(LOWER(u.name), LOWER($1)),
                similarity(LOWER(COALESCE(cp.display_name, '')), LOWER($1))
              )
              + CASE WHEN LOWER(COALESCE(cp.display_name, u.name)) LIKE LOWER($2) THEN 0.25 ELSE 0 END
              AS score
       FROM users u
       JOIN creator_profiles cp ON cp.user_id = u.id
       WHERE u.role = 'creator'
         AND (u.name % $1
              OR cp.display_name % $1
              OR similarity(LOWER(u.name), LOWER($1)) > 0.25
              OR similarity(LOWER(COALESCE(cp.display_name, '')), LOWER($1)) > 0.25
              OR u.name ILIKE $3
              OR cp.display_name ILIKE $3)
       ORDER BY score DESC, followers_count DESC
       LIMIT $4`,
      [term, `${term.toLowerCase()}%`, like, limit]
    )
    return rows
  }

  // pg_trgm unavailable: plain prefix/substring matching, popularity ranked.
  const { rows } = await pool.query(
    `SELECT ${selectFields}, 0 AS score
     FROM users u
     JOIN creator_profiles cp ON cp.user_id = u.id
     WHERE u.role = 'creator'
       AND (u.name ILIKE $2 OR cp.display_name ILIKE $2 OR u.bio ILIKE $2)
     ORDER BY followers_count DESC
     LIMIT $1`,
    [limit, like]
  )
  return rows
}

/**
 * Rank native movies (uploads) by title similarity, boosting exact/prefix
 * matches and tag hits so mood queries like "psychological-thriller" work.
 * The director attribution comes straight from the movie_creators junction
 * (role = DIRECTED_BY), never from uploads.user_id alone.
 */
async function searchMovies({ q, limit = 12 }) {
  const term = q.trim()
  const like = `%${term}%`
  const slugTerm = normalize(term).replace(/\s+/g, '-')

  const selectFields = `
    u.id,
    u.title,
    u.description,
    u.format,
    u.duration_seconds,
    u.genre,
    u.tags,
    u.views,
    u.created_at,
    -- Poster served through the stream route; client prepends its API base.
    CASE WHEN COALESCE(u.thumbnail_url, '') <> ''
         THEN '/stream/creator/' || u.id::text || '-thumb.jpg'
         ELSE NULL END AS poster_path,
    director.name AS creator_name,
    director.id   AS creator_id`

  if (await detectTrgm()) {
    const { rows } = await pool.query(
      `SELECT ${selectFields},
              GREATEST(
                similarity(LOWER(u.title), LOWER($1)),
                0.15 * CASE WHEN u.tags::text ILIKE $2 THEN 1 ELSE 0 END
              )
              + CASE WHEN LOWER(u.title) LIKE LOWER($3) THEN 0.3 ELSE 0 END
              AS score
       FROM uploads u
       LEFT JOIN LATERAL (
         SELECT usr.id, usr.name
         FROM movie_creators mc
         JOIN users usr ON usr.id = mc.creator_id
         WHERE mc.movie_id = u.id AND mc.role = 'DIRECTED_BY'
         LIMIT 1
       ) director ON TRUE
       WHERE u.status = 'active'
         AND (similarity(LOWER(u.title), LOWER($1)) > 0.2
              OR u.title ILIKE $4
              OR ($2 <> '' AND u.tags::text ILIKE '%' || $2 || '%'))
       ORDER BY score DESC, u.views DESC
       LIMIT $5`,
      [term, slugTerm, `${term.toLowerCase()}%`, like, limit]
    )
    return rows
  }

  const { rows } = await pool.query(
    `SELECT ${selectFields}, 0 AS score
     FROM uploads u
     LEFT JOIN LATERAL (
       SELECT usr.id, usr.name
       FROM movie_creators mc
       JOIN users usr ON usr.id = mc.creator_id
       WHERE mc.movie_id = u.id AND mc.role = 'DIRECTED_BY'
       LIMIT 1
     ) director ON TRUE
     WHERE u.status = 'active'
       AND (u.title ILIKE $2 OR u.genre ILIKE $2 OR u.description ILIKE $2)
     ORDER BY u.views DESC
     LIMIT $1`,
    [limit, like]
  )
  return rows
}

/** Attach the union of display roles ("Director", "Actor") to creator rows. */
async function attachRoles(creatorRows) {
  if (creatorRows.length === 0) return creatorRows
  const ids = creatorRows.map((c) => c.id)
  const { rows } = await pool.query(
    `SELECT creator_id, ARRAY_AGG(DISTINCT role) AS roles
     FROM movie_creators
     WHERE creator_id = ANY($1::uuid[])
     GROUP BY creator_id`,
    [ids]
  )
  const rolesById = new Map(rows.map((r) => [r.creator_id, r.roles]))
  for (const c of creatorRows) {
    const roles = rolesById.get(c.id) || []
    c.roles = [
      ...(roles.includes('DIRECTED_BY') ? ['Director'] : []),
      ...(roles.includes('ACTED_IN') ? ['Actor'] : []),
    ]
  }
  return creatorRows
}

/**
 * GET /api/search?q=<query>
 *
 * Hybrid search endpoint. Payload shape:
 * {
 *   success:   true,
 *   query:     "...",
 *   topResult: { kind:'creator', id, name, avatar, bio, roles, ... } | null,
 *   creators:  Creator[],   // remaining matching profiles
 *   movies:    Movie[]      // matching native films with format metadata
 * }
 *
 * When called with the legacy `query` (+ optional `type`) params instead of
 * `q`, this transparently delegates to the original TMDB search handler so
 * existing clients keep working unchanged.
 */
export async function hybridSearch(req, res) {
  const { q } = req.query

  // Legacy contract: /search?query=&type= -> TMDB metadata search.
  if (!q && req.query.query) {
    return legacyTmdbSearch(req, res)
  }
  if (!q || String(q).trim().length < 2) {
    return res.json({ success: true, query: q || '', topResult: null, creators: [], movies: [] })
  }

  try {
    const term = String(q).trim()
    const [creatorRows, movieRows] = await Promise.all([
      searchCreators({ q: term }),
      searchMovies({ q: term }),
    ])
    const creators = await attachRoles(creatorRows)

    // ---- Top Result selection --------------------------------------------
    // If the query closely matches a creator's name, promote that creator to
    // the root "topResult" object and drop them from the plain list.
    let topResult = null
    const bestCreator = creators[0]
    const bestMovie = movieRows[0]

    if (bestCreator && Number(bestCreator.score) >= TOP_RESULT_SIMILARITY_THRESHOLD) {
      // A creator wins unless a movie matches dramatically better.
      const movieBeats =
        bestMovie &&
        Number(bestMovie.score) >= 0.95 &&
        Number(bestMovie.score) > Number(bestCreator.score) + 0.3
      if (!movieBeats) {
        topResult = { kind: 'creator', ...bestCreator }
        creators.shift()
      }
    }

    res.json({
      success: true,
      query: term,
      topResult,
      creators,
      movies: movieRows,
    })
  } catch (err) {
    console.error('[discovery] hybridSearch failed:', err.message)
    res.status(500).json({ success: false, error: 'Discovery search failed' })
  }
}

/**
 * GET /api/creators/:id
 *
 * Aggregated creator profile powering the immersive profile view:
 * {
 *   success: true,
 *   creator:  {...profile fields incl. followers/film/view stats},
 *   counts:   { directed, acted },
 *   directed: Movie[],   // strictly DIRECTED_BY credits
 *   acted:    Movie[],   // strictly ACTED_IN credits (incl. character_name)
 *   similarCreators: Creator[]  // "Fans Also Like" discovery shelf
 * }
 */
export async function getCreatorProfile(req, res) {
  const { id } = req.params
  if (!id) return res.status(400).json({ success: false, error: 'Creator id required' })

  try {
    // UUID guard so malformed ids fail fast instead of erroring in Postgres.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.json({ success: false, error: 'Creator not found' })
    }

    const creatorRes = await pool.query(
      `SELECT u.id,
              COALESCE(cp.display_name, u.name) AS name,
              u.avatar,
              u.bio,
              u.verified,
              cp.known_for_department,
              cp.tmdb_person_id,
              (SELECT COUNT(*) FROM followers WHERE following_id = u.id) AS followers_count,
              (SELECT COUNT(*)::int FROM uploads WHERE user_id = u.id AND status = 'active')        AS film_count,
              (SELECT COALESCE(SUM(views), 0)::bigint FROM uploads WHERE user_id = u.id AND status = 'active') AS total_views,
              (SELECT COUNT(*)::int FROM likes WHERE creator_id = u.id)       AS total_likes
       FROM users u
       LEFT JOIN creator_profiles cp ON cp.user_id = u.id
       WHERE u.id = $1 AND u.role = 'creator'`,
      [id]
    )

    if (creatorRes.rows.length === 0) {
      return res.json({ success: false, error: 'Creator not found' })
    }
    const creator = creatorRes.rows[0]

    // Movies grouped STRICTLY by relationship type. The same movie can appear
    // in both lists when the creator directed AND acted in it — that is the
    // explicit DIRECTED_BY vs ACTED_IN contract of the junction table.
    const movieSelect = `
      u.id, u.title, u.description, u.genre, u.format, u.duration_seconds,
      u.tags, u.views, u.created_at,
      CASE WHEN COALESCE(u.thumbnail_url, '') <> ''
           THEN '/stream/creator/' || u.id::text || '-thumb.jpg'
           ELSE NULL END AS poster_path`

    const [directedRes, actedRes] = await Promise.all([
      pool.query(
        `SELECT ${movieSelect}, NULL::text AS character_name
         FROM movie_creators mc
         JOIN uploads u ON u.id = mc.movie_id
         WHERE mc.creator_id = $1 AND mc.role = 'DIRECTED_BY' AND u.status = 'active'
         ORDER BY u.created_at DESC`,
        [id]
      ),
      pool.query(
        `SELECT ${movieSelect}, mc.character_name
         FROM movie_creators mc
         JOIN uploads u ON u.id = mc.movie_id
         WHERE mc.creator_id = $1 AND mc.role = 'ACTED_IN' AND u.status = 'active'
         ORDER BY u.created_at DESC`,
        [id]
      ),
    ])

    const directed = directedRes.rows
    const acted = actedRes.rows

// ---- Fans Also Like ----------------------------------------------------
    // Build every creator's tag vocabulary from their films' structural tags,
    // then rank the others by overlap with this creator's tags. Computed in
    // JS: the catalogue is modest and this keeps the ranking logic readable.
    const vocabRes = await pool.query(
      `SELECT mc.creator_id,
               COALESCE(cp.display_name, usr.name) AS name,
               usr.avatar, usr.bio, usr.verified,
               COUNT(mc.movie_id) AS film_count,
               jsonb_agg(DISTINCT je.value) AS tag_pool
        FROM movie_creators mc
        JOIN users usr ON usr.id = mc.creator_id
        LEFT JOIN creator_profiles cp ON cp.user_id = mc.creator_id
        LEFT JOIN uploads u ON u.id = mc.movie_id AND u.status = 'active'
        LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(u.tags, '[]'::jsonb)) je ON TRUE
        WHERE usr.role = 'creator'
        GROUP BY mc.creator_id, cp.display_name, usr.name, usr.avatar, usr.bio, usr.verified`
    )

    const myTags = new Set(
      [...directed, ...acted].flatMap((m) =>
        Array.isArray(m.tags) ? m.tags.map((t) => String(t).toLowerCase()) : []
      )
    )

    const similarCreators = vocabRes.rows
      .filter((row) => row.creator_id !== id)
      .map((row) => {
        const theirTags = (row.tag_pool || [])
          .filter(Boolean)
          .map((t) => String(t).toLowerCase())
        const shared = theirTags.filter((t) => myTags.has(t))
        return {
          id: row.creator_id,
          name: row.name,
          avatar: row.avatar,
          bio: row.bio,
          verified: !!row.verified,
          film_count: Number(row.film_count),
          tags: [...new Set(theirTags)].slice(0, 5),
          shared_tags: [...new Set(shared)],
          score: shared.length,
        }
      })
      // Require at least one shared tag when this creator HAS tags; otherwise
      // fall back to pure popularity so the shelf never renders empty.
      .filter((row) => (myTags.size === 0 ? true : row.score > 0))
      .sort((a, b) => b.score - a.score || b.film_count - a.film_count)
      .slice(0, 8)

    res.json({
      success: true,
      creator,
      counts: {
        directed: directed.length,
        acted: acted.length,
      },
      directed,
      acted,
      similarCreators,
    })
  } catch (err) {
    console.error('[discovery] getCreatorProfile failed:', err.message)
    res.status(500).json({ success: false, error: 'Failed to load creator profile' })
  }
}
