/**
 * SearchDiscoveryPanel.tsx
 * ---------------------------------------------------------------------------
 * Floating contextual dropdown PORTAL that renders beneath an EXISTING search
 * input while the user types — mimicking Spotify's web instant-search layout.
 *
 * This component never renders an <input>. It is a pure overlay driven by the
 * host input's state:
 *   - anchorRef : ref of the physical input (used to compute position)
 *   - query     : the input's onChange value
 *   - open      : the input's active/focused state
 *   - onClose   : called before navigating so hosts can hide themselves
 *
 * Layout sections (exactly like Spotify):
 *   1. Top Result   — prominent block with circular creator avatar, name,
 *                     verified badge and primary roles.
 *   2. Profiles     — remaining matching creators as circular-avatar rows.
 *   3. Movies       — matching films with pill badges "Short Film" /
 *                     "Feature Length" (+ precise runtime badge on shorts).
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon'
import { useDiscoverySearch, formatRuntime, type DiscoveryCreator, type DiscoveryMovie } from '../../hooks/useDiscoverySearch'
import { API_BASE } from '../../lib/api'

interface SearchDiscoveryPanelProps {
  anchorRef: React.RefObject<HTMLInputElement | null>
  query: string
  open: boolean
  onClose: () => void
}

/** Circular avatar with graceful fallback initials. */
function CreatorAvatar({ src, name, size = 'w-12 h-12' }: { src?: string | null; name: string; size?: string }) {
  return (
    <span className={`${size} rounded-full overflow-hidden bg-surface-container-highest shrink-0 flex items-center justify-center`}>
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        <Icon name="person" size="sm" className="text-on-surface-variant/50" />
      )}
    </span>
  )
}

/** Verified checkmark badge shown next to platform creator names. */
function VerifiedBadge() {
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-container text-on-primary-container shrink-0"
      title="Verified creator"
      aria-label="Verified creator"
    >
      <Icon name="check" className="w-2.5 h-2.5" />
    </span>
  )
}

/** Distinct visual pill designating the film format. */
function FormatPill({ format }: { format: 'SHORT' | 'LONG' | null | undefined }) {
  if (!format) return null
  const isShort = format === 'SHORT'
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
        isShort
          ? 'bg-secondary/15 text-secondary border-secondary/40'
          : 'bg-primary-container/15 text-primary border-primary/40'
      }`}
    >
      {isShort ? 'Short Film' : 'Feature Length'}
    </span>
  )
}

function MovieRow({ movie, onSelect }: { movie: DiscoveryMovie; onSelect: () => void }) {
  const runtime = formatRuntime(movie.duration_seconds)
  const posterUrl = movie.poster_path ? `${API_BASE}${movie.poster_path}` : null
  return (
    <button
      onClick={onSelect}
      onMouseDown={(e) => e.preventDefault()} // keep input focused during click
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
    >
      {posterUrl ? (
        <img src={posterUrl} alt="" className="w-9 h-12 rounded-md object-cover shrink-0 bg-surface-container" />
      ) : (
        <div className="w-9 h-12 rounded-md bg-surface-container flex items-center justify-center shrink-0">
          <Icon name="movie" size="xs" className="text-on-surface-variant/40" />
        </div>
      )}
      <span className="flex-1 min-w-0">
        <span className="block font-label-md text-label-md text-on-surface truncate">{movie.title}</span>
        <span className="block text-xs text-on-surface-variant/60 truncate">
          {movie.creator_name ? `by ${movie.creator_name}` : 'NovaFlix Original'}
        </span>
      </span>
      {/* Precise runtime badge on short films, format pill for everything. */}
      <span className="flex items-center gap-1.5 shrink-0">
        {movie.format === 'SHORT' && runtime && (
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-semibold text-on-surface-variant whitespace-nowrap">
            {runtime}
          </span>
        )}
        <FormatPill format={movie.format} />
      </span>
    </button>
  )
}

function CreatorRow({ creator, onSelect }: { creator: DiscoveryCreator; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      onMouseDown={(e) => e.preventDefault()}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
    >
      <CreatorAvatar src={creator.avatar} name={creator.name} />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="font-label-md text-label-md text-on-surface truncate">{creator.name}</span>
          {creator.verified && <VerifiedBadge />}
        </span>
        <span className="block text-xs text-on-surface-variant/60 truncate">
          {creator.roles && creator.roles.length > 0
            ? creator.roles.join(' • ')
            : creator.film_count > 0
              ? `${creator.film_count} film${creator.film_count !== 1 ? 's' : ''}`
              : 'Creator'}
        </span>
      </span>
      <Icon name="chevron_right" size="sm" className="text-on-surface-variant/20 shrink-0" />
    </button>
  )
}

export default function SearchDiscoveryPanel({ anchorRef, query, open, onClose }: SearchDiscoveryPanelProps) {
  const navigate = useNavigate()
  const { topResult, creators, movies, loading } = useDiscoverySearch(query, open)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  // Track the anchor input's rect so the portal stays glued beneath it.
  useEffect(() => {
    if (!open) return setPos(null)
    const update = () => {
      const el = anchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPos({ top: rect.bottom + 8, left: rect.left, width: rect.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, anchorRef])

  // Dismiss on outside pointerdown / Escape.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const el = anchorRef.current
      // Clicks inside the panel are handled by buttons; outside closes.
      const target = e.target as HTMLElement
      if (el?.contains(target)) return
      if (target.closest('[data-discovery-panel]')) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, anchorRef, onClose])

  if (!open || !pos) return null

  const trimmed = query.trim()

  const goCreator = (id: string) => {
    onClose()
    navigate(`/creators/${id}`)
  }
  const goMovie = (id: string) => {
    onClose()
    navigate(`/movie/${id}`)
  }

  const hasResults = !!(topResult || creators.length > 0 || movies.length > 0)

  return createPortal(
    <div
      data-discovery-panel
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 70 }}
      className="bg-surface-container-high border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-[70vh] overflow-y-auto"
    >
      {/* ---- Section 1: Top Result ------------------------------------- */}
      {topResult && (
        <>
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Top result</p>
          <button
            onClick={() => goCreator(topResult.id)}
            onMouseDown={(e) => e.preventDefault()}
            className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 transition-colors"
          >
            <CreatorAvatar src={topResult.avatar} name={topResult.name} size="w-16 h-16" />
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-headline-sm font-extrabold text-on-surface truncate">{topResult.name}</span>
                {topResult.verified && <VerifiedBadge />}
              </span>
              <span className="block text-xs text-on-surface-variant/70 truncate mt-0.5">
                {topResult.roles && topResult.roles.length > 0 ? topResult.roles.join(' • ') : 'Creator'}
                {typeof topResult.followers_count === 'number' && topResult.followers_count > 0
                  ? ` • ${topResult.followers_count.toLocaleString()} followers`
                  : ''}
              </span>
            </span>
            <span className="shrink-0 w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <Icon name="play_arrow" fill={true} size="sm" className="text-on-surface" />
            </span>
          </button>
        </>
      )}

      {/* ---- Section 2: Profiles --------------------------------------- */}
      {creators.length > 0 && (
        <>
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Profiles</p>
          <div className="divide-y divide-white/5">
            {creators.map((c) => (
              <CreatorRow key={c.id} creator={c} onSelect={() => goCreator(c.id)} />
            ))}
          </div>
        </>
      )}

      {/* ---- Section 3: Movies ----------------------------------------- */}
      {movies.length > 0 && (
        <>
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Movies</p>
          <div className="divide-y divide-white/5">
            {movies.map((m) => (
              <MovieRow key={m.id} movie={m} onSelect={() => goMovie(m.id)} />
            ))}
          </div>
        </>
      )}

      {/* Empty / loading states */}
      {!loading && trimmed.length >= 2 && !hasResults && (
        <div className="px-6 py-8 text-center">
          <Icon name="search_off" className="text-on-surface-variant/20 mx-auto mb-2" />
          <p className="text-sm text-on-surface-variant/50">No results for “{trimmed}”</p>
          <p className="text-xs text-on-surface-variant/30 mt-1">Press Enter for a full catalog search</p>
        </div>
      )}
      {loading && hasResults && (
        <p className="px-4 py-2 text-xs text-on-surface-variant/40 animate-pulse">Refining results…</p>
      )}
    </div>,
    document.body
  )
}
