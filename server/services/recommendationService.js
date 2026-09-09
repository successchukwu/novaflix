import pool from '../config/database.js'
import { getArtistGraph, addGraphEdge } from '../db.js'

/**
 * Recommendation graph service using artist_graph edges.
 * Edges are built from co-acting in trending movies (seedShortsFromTrending).
 * This service surfaces collaborators and weighted recommendations.
 */

export async function getGraphRecommendations(userId, limit = 10) {
  if (!userId) return []
  // Primary: use graph edges (artist_graph)
  const edges = await getArtistGraph(userId)
  if (edges && edges.length > 0) {
    // Return collaborators sorted by weight (already ordered DESC)
    return edges.slice(0, limit).map(e => ({
      collabId: e.collab_id,
      collabName: e.collab_name,
      collabAvatar: e.collab_avatar,
      movieId: e.movie_id,
      movieTitle: e.movie_title,
      weight: e.weight,
      roleA: e.role_a,
      roleB: e.role_b,
    }))
  }
  // Fallback: genre-based shorts suggestions
  const { rows } = await pool.query(
    `SELECT s.id, s.title, s.video_url, s.thumbnail_url, s.views
     FROM shorts s WHERE s.status='active' ORDER BY s.views DESC LIMIT $1`,
    [limit]
  )
  return rows
}

export async function getRecommendationsForUser(userId) {
  return getGraphRecommendations(userId, 12)
}

export async function getTrendingWithGraph(limit = 10) {
  // Trending is augmented with graph weight: prefer creators with high collaboration weight
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.avatar, COUNT(g.id) as connections, COALESCE(SUM(g.weight),0) as total_weight
     FROM users u
     LEFT JOIN artist_graph g ON g.person_a_id = u.id OR g.person_b_id = u.id
     GROUP BY u.id
     ORDER BY total_weight DESC, connections DESC
     LIMIT $1`,
    [limit]
  )
  return rows
}

export async function addRecommendationEdge(personAId, personBId, movieId, movieTitle, roleA, roleB) {
  return addGraphEdge(personAId, personBId, movieId, movieTitle, roleA, roleB)
}

export async function getSimilarByGraph(userId, limit = 8) {
  const edges = await getArtistGraph(userId)
  if (!edges.length) return []
  // Find users who share collaborators (2nd degree)
  const collabIds = edges.map(e => e.collab_id)
  const { rows } = await pool.query(
    `SELECT DISTINCT g.person_b_id as similar_id, u.name as similar_name, u.avatar as similar_avatar, COUNT(*) as shared
     FROM artist_graph g
     JOIN users u ON u.id = g.person_b_id
     WHERE g.person_a_id = ANY($1::uuid[]) AND g.person_b_id != $2
     GROUP BY g.person_b_id, u.name, u.avatar
     ORDER BY shared DESC LIMIT $3`,
    [collabIds, userId, limit]
  )
  return rows
}

export default { getGraphRecommendations, getRecommendationsForUser, getTrendingWithGraph, addRecommendationEdge, getSimilarByGraph }
