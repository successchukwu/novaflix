import { useState, useRef, useCallback, useEffect } from 'react'
import type { MediaItem } from '../../types'
import { getDetails } from '../../lib/api'
import MovieCard from './MovieCard'
import ExpandedCard from './ExpandedCard'

interface HoverCardProps {
  item: MediaItem
  index?: number
  progress?: number
  duration?: number
  className?: string
  watchUrl?: string
}

const detailsCache = new Map<string, { details: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000
const HOVER_DELAY = 500
const CLOSE_GRACE = 200

export default function HoverCard({ item, index, progress, duration, className, watchUrl }: HoverCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [details, setDetails] = useState<any>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const cardRectRef = useRef<DOMRect | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>()
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const isHoveredRef = useRef(false)
  const isOnPopupRef = useRef(false)
  const isTouchDevice = useRef(
    typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches
  )

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  const clearTimers = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  const close = useCallback(() => {
    setExpanded(false)
    setDetails(null)
    cardRectRef.current = null
  }, [])

  const startCloseTimer = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      if (!isHoveredRef.current && !isOnPopupRef.current) {
        close()
      }
    }, CLOSE_GRACE)
  }, [close])

  const handleMouseEnter = useCallback(() => {
    isHoveredRef.current = true
    clearTimers()

    const cacheKey = `${item.id}-${item.type}`
    const cached = detailsCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      cardRectRef.current = cardRef.current?.getBoundingClientRect() || null
      setDetails(cached.details)
      setExpanded(true)
      return
    }

    hoverTimer.current = setTimeout(async () => {
      if (!isHoveredRef.current) return
      const el = cardRef.current
      if (!el) return
      cardRectRef.current = el.getBoundingClientRect()
      const res = await getDetails(String(item.id), item.type)
      if (res.success && res.data) {
        detailsCache.set(cacheKey, { details: res.data, timestamp: Date.now() })
        if (isHoveredRef.current) {
          setDetails(res.data)
          setExpanded(true)
        }
      }
    }, HOVER_DELAY)
  }, [item.id, item.type, clearTimers])

  const handleMouseLeave = useCallback(() => {
    isHoveredRef.current = false
    clearTimers()
    startCloseTimer()
  }, [clearTimers, startCloseTimer])

  const handlePopupEnter = useCallback(() => {
    isOnPopupRef.current = true
    clearTimers()
  }, [clearTimers])

  const handlePopupLeave = useCallback(() => {
    isOnPopupRef.current = false
    startCloseTimer()
  }, [startCloseTimer])

  if (isTouchDevice.current) {
    return <MovieCard item={item} index={index} progress={progress} duration={duration} className={className} watchUrl={watchUrl} />
  }

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative ${className ?? ''}`}
    >
      <MovieCard item={item} index={index} progress={progress} duration={duration} className={className} watchUrl={watchUrl} />
      {expanded && details && cardRectRef.current && (
        <ExpandedCard
          details={details}
          cardRect={{
            top: cardRectRef.current.top,
            left: cardRectRef.current.left,
            width: cardRectRef.current.width,
            height: cardRectRef.current.height,
            bottom: cardRectRef.current.bottom,
          }}
          onClose={close}
          onMouseEnter={handlePopupEnter}
          onMouseLeave={handlePopupLeave}
        />
      )}
    </div>
  )
}
