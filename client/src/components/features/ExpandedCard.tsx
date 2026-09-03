import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { toggleLike, checkLike } from '../../lib/auth'
import { subscribeContent } from '../../lib/live'
import { useAuth } from '../../lib/AuthContext'
import Icon from '../ui/Icon'
import type { MediaDetails } from '../../types'
import { useHoverVideo } from '../../hooks/useHoverVideo'
import { getStreamSource } from '../../lib/api'

interface ExpandedCardProps {
  details: MediaDetails
  cardRect: { top: number; left: number; width: number; height: number; bottom: number }
  onClose: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

const POPUP_WIDTH = 340
const POPUP_WIDTH_MOBILE = 280
const MARGIN = 16
const CONTENT_HEIGHT = 130

function ActionBtn({ icon, label, onClick, fill }: { icon: string; label: string; onClick?: () => void; fill?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors active:scale-90"
      aria-label={label}
    >
      <Icon name={icon} className="text-white text-lg" fill={fill} />
    </button>
  )
}

export default function ExpandedCard({ details, cardRect, onClose, onMouseEnter, onMouseLeave }: ExpandedCardProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const portalRoot = document.getElementById('preview-portal-root')
  const [visible, setVisible] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const { onEnter, onLeave } = useHoverVideo(videoRef, { delay: 500 })

  useEffect(() => {
    if (user) {
      checkLike(String(details.id), details.type).then((r) => {
        if (r.success) {
          setLiked(r.liked)
          setLikeCount(r.count || 0)
        }
      })
    }
  }, [details.id, details.type, user])

  useEffect(() => {
    return subscribeContent(details.type, String(details.id), (msg) => {
      if (msg.type === 'like' && typeof msg.count === 'number') {
        setLikeCount(msg.count)
      }
    })
  }, [details.id, details.type])

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  // Fetch MP4 stream for hover preview (desktop) — fallback to YouTube trailerKey
  useEffect(() => {
    let cancelled = false
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      getStreamSource(String(details.id), details.type).then(res => {
        if (cancelled) return
        if (res.success && (res.streamUrl || res.directUrl)) setStreamUrl(res.streamUrl || res.directUrl)
        else setStreamUrl(null)
      }).catch(()=>{ if(!cancelled) setStreamUrl(null) })
    }
    return ()=>{ cancelled = true }
  }, [details.id, details.type])

  // Auto-play after mount if desktop + stream/trailer ready
  useEffect(() => {
    if (!visible) return
    if (!window.matchMedia('(min-width: 1024px)').matches) return
    if (!streamUrl && !details.trailerKey) return
    const t = setTimeout(() => { onEnter(); setIsVideoPlaying(true) }, 400)
    return () => clearTimeout(t)
  }, [visible, streamUrl, details.trailerKey, onEnter])

  const handleEnter = () => {
    onMouseEnter?.()
    onEnter()
    setIsVideoPlaying(true)
  }
  const handleLeave = () => {
    onMouseLeave?.()
    onLeave()
    setIsVideoPlaying(false)
  }

  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  if (!portalRoot) return null

  const isMobile = window.innerWidth < 768
  const width = isMobile ? POPUP_WIDTH_MOBILE : POPUP_WIDTH

  let left = cardRect.left + cardRect.width / 2 - width / 2
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN))

  const videoHeight = Math.round(width * 9 / 16)
  const popupHeight = videoHeight + CONTENT_HEIGHT
  const spaceBelow = window.innerHeight - cardRect.bottom
  const fitsBelow = spaceBelow >= popupHeight + MARGIN
  const fitsAbove = cardRect.top >= popupHeight + MARGIN

  let top: number
  let transformOrigin: string

  if (fitsBelow || !fitsAbove) {
    top = cardRect.bottom
    transformOrigin = 'top center'
  } else {
    top = Math.max(MARGIN, cardRect.top - popupHeight)
    transformOrigin = 'bottom center'
  }

  const runtimeStr = details.type === 'tv' && details.totalSeasons
    ? `${details.totalSeasons} Season${details.totalSeasons > 1 ? 's' : ''}`
    : details.type === 'movie' && details.runtime
      ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`
      : null

  const handlePlay = () => {
    navigate(`/watch?id=${details.id}&type=${details.type}`)
    onClose()
  }

  const handleLike = async () => {
    if (!user) return
    const res = await toggleLike(String(details.id), details.type)
    if (res.success) {
      setLiked(res.liked)
      setLikeCount(res.count || 0)
    }
  }

  const handleMoreInfo = () => {
    navigate(`/${details.type}/${details.id}`)
    onClose()
  }

  const handleWatchParty = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    navigate(`/watch-party?room=${code}&id=${details.id}&type=${details.type}`)
    onClose()
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top,
        left,
        width,
        zIndex: 50,
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.85)',
        transformOrigin,
        transition: 'opacity 200ms ease, transform 200ms ease',
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className="rounded-lg overflow-hidden shadow-2xl pointer-events-auto hover-video-container"
    >
      <div className="relative bg-black overflow-hidden" style={{ paddingBottom: '56.25%' }}>
        {/* Static thumbnail — scales slightly on hover */}
        <img
          src={details.trailerKey ? `https://img.youtube.com/vi/${details.trailerKey}/maxresdefault.jpg` : (details.backdrop || details.poster || '')}
          alt={details.title}
          className={`absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out ${isVideoPlaying ? 'scale-105' : 'scale-100'}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
        {/* Desktop hover video — muted autoplay after 500ms, hidden on <1024 via hook */}
        {streamUrl && (
          <video
            ref={videoRef}
            src={streamUrl}
            poster={details.backdrop || details.poster || undefined}
            muted
            loop
            playsInline
            preload="none"
            aria-hidden="true"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ease-out pointer-events-none ${isVideoPlaying ? 'opacity-100' : 'opacity-0'}`}
            onPlay={() => setIsVideoPlaying(true)}
            onPause={() => setIsVideoPlaying(false)}
          />
        )}
        {!streamUrl && details.trailerKey && (
          <div className={`absolute inset-0 w-full h-full overflow-hidden pointer-events-none transition-opacity duration-500 ease-out ${isVideoPlaying ? 'opacity-100' : 'opacity-0'}`}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${details.trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${details.trailerKey}&modestbranding=1&rel=0&playsinline=1&enablejsapi=1&iv_load_policy=3`}
              title={`Trailer for ${details.title}`}
              allow="autoplay; encrypted-media"
              frameBorder="0"
              className="absolute inset-0 w-full h-full object-cover scale-105"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      <div className="bg-[#181818] px-4 pt-3 pb-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ActionBtn icon="play_arrow" label={`Play ${details.title}`} onClick={handlePlay} />
            <ActionBtn icon="add" label="Add to My List" />
            <ActionBtn icon="thumb_up" label={liked ? 'Unlike' : 'Like'} onClick={handleLike} fill={liked} />
            {likeCount > 0 && <span className="text-white text-xs font-medium">{likeCount}</span>}
            <ActionBtn icon="diversity_3" label="Watch Party" onClick={handleWatchParty} />
          </div>
          <ActionBtn icon="expand_more" label="More info" onClick={handleMoreInfo} />
        </div>

        <div className="flex items-center gap-2 text-xs">
          {details.ageRating && (
            <span className="inline-flex items-center justify-center h-5 px-1.5 border border-white/30 text-white/80 font-semibold text-[10px] leading-none">
              {details.ageRating}
            </span>
          )}
          {runtimeStr && (
            <span className="text-white/70">{runtimeStr}</span>
          )}
          <span className="inline-flex items-center justify-center h-5 px-1.5 border border-white/30 text-white/80 font-semibold text-[10px] leading-none">
            HD
          </span>
        </div>

        {details.genres.length > 0 && (
          <p className="text-xs text-white/60 leading-relaxed">
            {details.genres.join(' • ')}
          </p>
        )}
      </div>
    </div>,
    portalRoot
  )
}
