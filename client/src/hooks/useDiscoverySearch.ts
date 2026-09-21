/**
 * useDiscoverySearch.ts
 * ---------------------------------------------------------------------------
 * State-management bridge between ANY existing search input and the
 * Spotify-style discovery engine backend.
 *
 * The hook is intentionally dumb about the DOM: the caller owns the physical
 * <input> element and simply feeds it in:
 *   - `query`   : bound to the input's onChange value
 *   - `enabled` : true while the input is focused / dropdown should be open
 *
 * It debounces keystrokes (300ms), aborts in-flight requests on new input,
 * and returns the structured payload sections straight from
 * GET {API_BASE}/search?q=... :
 *   { topResult, creators, movies, loading }
 */
import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../lib/api'

export interface DiscoveryCreator {
  id: string
  name: string
  username?: string
  avatar: string | null
  bio: string | null
  verified?: boolean
  known_for_department?: string | null
  film_count: number
  directed_count?: number
  acted_count?: number
  followers_count?: number
  roles?: string[]
}

export interface DiscoveryMovie {
  id: string
  title: string
  format: 'SHORT' | 'LONG' | null
  duration_seconds: number | null
  genre: string | null
  tags: string[] | null
  views: number
  poster_path: string | null
  creator_name: string | null
  creator_id: string | null
}

export interface DiscoveryResponse {
  topResult: (DiscoveryCreator & { kind: 'creator' }) | null
  creators: DiscoveryCreator[]
  movies: DiscoveryMovie[]
  loading: boolean
}

/** Format seconds as a compact human runtime, e.g. "14 min" or "1 h 22". */
export function formatRuntime(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null
  if (seconds < 60) return `${Math.round(seconds)} sec`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  if (hours > 0) return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`
  return `${minutes} min`
}

export function useDiscoverySearch(query: string, enabled: boolean): DiscoveryResponse {
  const [topResult, setTopResult] = useState<DiscoveryResponse['topResult']>(null)
  const [creators, setCreators] = useState<DiscoveryCreator[]>([])
  const [movies, setMovies] = useState<DiscoveryMovie[]>([])
  const [loading, setLoading] = useState(false)

  // Latest-wins guard: only the newest request may write state. This makes a
  // stale slow response harmless even without an AbortController.
  const requestIdRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const trimmed = query.trim()
    requestIdRef.current += 1
    const requestId = requestIdRef.current

    if (!enabled || trimmed.length < 2) {
      setTopResult(null)
      setCreators([])
      setMovies([])
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem('novaflix-token') || ''
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(trimmed)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const body = await res.json()
        if (requestIdRef.current !== requestId) return // stale response
        if (body.success) {
          setTopResult(body.topResult || null)
          setCreators(body.creators || [])
          setMovies(body.movies || [])
        } else {
          setTopResult(null)
          setCreators([])
          setMovies([])
        }
      } catch {
        if (requestIdRef.current === requestId) {
          setTopResult(null)
          setCreators([])
          setMovies([])
        }
      } finally {
        if (requestIdRef.current === requestId) setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, enabled])

  return { topResult, creators, movies, loading }
}
