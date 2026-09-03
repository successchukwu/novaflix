import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type { MediaDetails } from '../../types'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import RatingBadge from '../ui/RatingBadge'
import Skeleton from '../ui/Skeleton'
import Icon from '../ui/Icon'
import { useStore } from '../../store/useStore'
import { useToast } from '../ui/Toast'
import { checkAchievements } from '../../lib/auth'
import { useHoverVideo } from '../../hooks/useHoverVideo'
import { getStreamSource } from '../../lib/api'

interface HeroBannerProps {
  items: MediaDetails[]
  loading?: boolean
  autoPlayInterval?: number
}

export default function HeroBanner({ items, loading, autoPlayInterval = 6000 }: HeroBannerProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const { watchlist, addToWatchlist, removeFromWatchlist } = useStore()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [trailerActive, setTrailerActive] = useState(false)
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true)
  const heroVideoRef = useRef<HTMLVideoElement>(null)
  const [heroStreamUrl, setHeroStreamUrl] = useState<string | null>(null)
  const [isHoverPlaying, setIsHoverPlaying] = useState(false)
  const { onEnter: onHeroEnter, onLeave: onHeroLeave } = useHoverVideo(heroVideoRef, { delay: 500 })

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  const hasMultiple = items.length > 1
  const currentItem = items[currentIndex] || null

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index)
  }, [])

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % items.length)
  }, [items.length])

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length)
  }, [items.length])

  useEffect(() => {
    if (!hasMultiple || isPaused || loading) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(goNext, autoPlayInterval)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [hasMultiple, isPaused, loading, goNext, autoPlayInterval])

  // Fetch MP4 streamUrl for hover preview (server MP4) — fallback to TMDB trailerKey YouTube
  useEffect(() => {
    if (!currentItem || !isDesktop) { setHeroStreamUrl(null); return }
    // Reset previous video
    if (heroVideoRef.current) { heroVideoRef.current.pause(); heroVideoRef.current.currentTime = 0; setIsHoverPlaying(false) }
    setHeroStreamUrl(null)
    let cancelled = false
    getStreamSource(String(currentItem.id), currentItem.type).then(res => {
      if (cancelled) return
      if (res.success && (res.streamUrl || res.directUrl)) {
        setHeroStreamUrl(res.streamUrl || res.directUrl)
      } else {
        // No MP4 — will fallback to youtube-nocookie trailerKey
        setHeroStreamUrl(null)
      }
    }).catch(()=>{ if(!cancelled) setHeroStreamUrl(null) })
    return ()=>{ cancelled = true }
  }, [currentItem?.id, currentItem?.type, isDesktop])

  const handleHeroEnter = useCallback(() => {
    setIsPaused(true)
    if (!isDesktop) return
    setTrailerActive(true)
    onHeroEnter()
    // Tailwind playing state via flag
    setTimeout(()=> setIsHoverPlaying(true), 520)
  }, [isDesktop, onHeroEnter])

  const handleHeroLeave = useCallback(() => {
    setIsPaused(false)
    setTrailerActive(false)
    setIsHoverPlaying(false)
    onHeroLeave()
  }, [onHeroLeave])

  if (loading || items.length === 0) {
    return (
      <div className="relative w-full h-[60vh] md:h-[70vh] lg:h-[80vh]">
        <Skeleton variant="hero" className="w-full h-full rounded-none" />
        <div className="absolute bottom-0 left-0 right-0 p-8 md:p-16">
          <Skeleton variant="text" className="w-full max-w-96 h-12 mb-4" />
          <Skeleton variant="text" className="w-full max-w-64 h-4 mb-2" />
          <Skeleton variant="text" className="w-full max-w-xl h-4 mb-6" />
          <div className="flex gap-3">
            <Skeleton variant="text" className="w-32 h-10 rounded-lg" />
            <Skeleton variant="text" className="w-32 h-10 rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  const inWatchlist = currentItem ? watchlist.some((w) => w.id === currentItem.id) : false

  const handleWatchlist = () => {
    if (!currentItem) return
    if (inWatchlist) {
      removeFromWatchlist(currentItem.id)
      toast.info('Removed from watchlist')
    } else {
      addToWatchlist({
        id: currentItem.id,
        title: currentItem.title,
        poster: currentItem.poster,
        type: currentItem.type,
        year: currentItem.year,
      })
      toast.success('Added to watchlist')
      checkAchievements()
    }
  }

  const handleShare = () => {
    if (!currentItem) return
    const url = `${window.location.origin}/${currentItem.type}/${currentItem.id}`
    navigator.clipboard.writeText(url)
    toast.success('Link copied to clipboard')
  }

  const runtimeStr = currentItem.runtime
    ? `${Math.floor(currentItem.runtime / 60)}h ${currentItem.runtime % 60}m`
    : null

  return (
    <div
      className={`relative w-full h-[60vh] md:h-[70vh] lg:h-[80vh] overflow-hidden hover-video-container ${isHoverPlaying ? 'playing' : ''}`}
      onMouseEnter={handleHeroEnter}
      onMouseLeave={handleHeroLeave}
    >
      <AnimatePresence mode="wait">
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/${currentItem.type}/${currentItem.id}`)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/${currentItem.type}/${currentItem.id}`) } }}
          className="absolute inset-0 w-full h-full text-left cursor-pointer"
          aria-label={`View ${currentItem.title}`}
        >
          <motion.div
            key={currentItem.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
            className="absolute inset-0"
          >
            {currentItem.backdrop ? (
              <img
                src={currentItem.backdrop?.replace('/w1280', '/original')}
                alt={currentItem.title}
                className={`w-full h-full object-cover transition-transform duration-700 ease-out ${isHoverPlaying ? 'scale-105' : 'scale-100'}`}
                loading="eager"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary-container/20 to-surface" />
            )}
            {/* Hover video — desktop only, muted autoplay after 500ms */}
            {isDesktop && heroStreamUrl && (
              <video
                ref={heroVideoRef}
                src={heroStreamUrl}
                poster={currentItem.backdrop || undefined}
                muted
                loop
                playsInline
                preload="none"
                aria-hidden="true"
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ease-out pointer-events-none ${isHoverPlaying ? 'opacity-100' : 'opacity-0'}`}
                onPlay={() => setIsHoverPlaying(true)}
                onPause={() => setIsHoverPlaying(false)}
              />
            )}
            {/* Fallback YouTube youtube-nocookie muted embed when no MP4 available */}
            {isDesktop && !heroStreamUrl && currentItem.trailerKey && (
              <div className={`absolute inset-0 w-full h-full overflow-hidden pointer-events-none transition-opacity duration-500 ease-out ${isHoverPlaying ? 'opacity-100' : 'opacity-0'}`}>
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${currentItem.trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${currentItem.trailerKey}&modestbranding=1&rel=0&playsinline=1&enablejsapi=1&iv_load_policy=3`}
                  title={`Trailer for ${currentItem.title}`}
                  allow="autoplay; encrypted-media"
                  allowFullScreen={false}
                  frameBorder="0"
                  className="absolute inset-0 w-full h-full object-cover scale-105"
                  aria-hidden="true"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
              </div>
            )}
            <div className="absolute inset-0 hero-gradient" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent pointer-events-none" />
          </motion.div>
        </div>
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={`content-${currentItem.id}`}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="absolute bottom-0 left-0 right-0 p-6 md:p-12 lg:p-16"
        >
          <div className="max-w-3xl">
            {currentItem.type === 'movie' ? (
              <span className="inline-block px-3 py-1 bg-primary-container text-on-primary-container font-label-sm text-label-sm rounded mb-4 tracking-widest">
                NOW PLAYING
              </span>
            ) : (
              <span className="inline-block px-3 py-1 bg-primary-container text-on-primary-container font-label-sm text-label-sm rounded mb-4 tracking-widest">
                TRENDING
              </span>
            )}

            <h1 className="text-4xl md:text-display-lg font-extrabold mb-4 leading-tight">
              {currentItem.title}
            </h1>

            <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-on-surface-variant">
              <RatingBadge rating={currentItem.rating} />
              <span className="text-on-surface-variant/40">|</span>
              <span>{currentItem.year}</span>
              {runtimeStr && (
                <>
                  <span className="text-on-surface-variant/40">|</span>
                  <Icon name="schedule" size="sm" />
                  <span>{runtimeStr}</span>
                </>
              )}
            </div>

            {currentItem.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {currentItem.genres.slice(0, 4).map((genre) => (
                  <Badge key={genre} variant="outline">{genre}</Badge>
                ))}
              </div>
            )}

            <p className="text-on-surface-variant text-sm md:text-body-md line-clamp-2 md:line-clamp-3 mb-8 max-w-2xl leading-relaxed">
              {currentItem.overview}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                onClick={() => navigate(`/watch?id=${currentItem.id}&type=${currentItem.type}`)}
              >
                <Icon name="play_arrow" fill={true} size="sm" /> Watch Now
              </Button>

              <button
                onClick={handleWatchlist}
                className="p-3 rounded-lg bg-surface-variant/40 backdrop-blur-md border border-white/10 hover:bg-surface-variant/60 active:scale-95 transition-all"
                aria-label={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                <Icon name={inWatchlist ? 'check' : 'add'} className="text-on-surface" />
              </button>

              <button
                onClick={handleShare}
                className="p-3 rounded-lg bg-surface-variant/40 backdrop-blur-md border border-white/10 hover:bg-surface-variant/60 active:scale-95 transition-all"
                aria-label="Share"
              >
                <Icon name="share" className="text-on-surface" />
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {hasMultiple && (
        <>
          <button
            onClick={goPrev}
            className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-black/60 transition-all z-10"
            aria-label="Previous slide"
          >
            <Icon name="chevron_left" />
          </button>

          <button
            onClick={goNext}
            className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-black/60 transition-all z-10"
            aria-label="Next slide"
          >
            <Icon name="chevron_right" />
          </button>

          <div className="absolute bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`transition-all duration-300 rounded-full ${
                  i === currentIndex
                    ? 'w-8 h-2 bg-primary-container'
                    : 'w-2 h-2 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
