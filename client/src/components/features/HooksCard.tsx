import { useRef, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { HookItem } from '../../types'
import Icon from '../ui/Icon'
import { likeShort, bookmarkShort, shareShort, recordShortView, checkLike, toggleLike, toggleFollow } from '../../lib/auth'

interface HooksCardProps {
  item: HookItem
  active: boolean
  near?: boolean
  creatorAvatar?: string | null
  audioTrackName?: string
  commentsCount?: number
  onOpenComments?: () => void
  onShare?: (item: HookItem) => void
}

interface BurstHeart {
  id: number
  x: number
  y: number
}

const formatCount = (v?: number | string | null): string => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}

const extractYouTubeKey = (url?: string | null): string | null => {
  if (!url) return null
  const m = url.match(/embed\/([\w-]+)/) || url.match(/[?&]v=([\w-]+)/) || url.match(/youtu\.be\/([\w-]+)/)
  return m ? m[1] : null
}

export default function HooksCard({
  item,
  active,
  near = false,
  creatorAvatar,
  audioTrackName,
  commentsCount = 0,
  onOpenComments,
  onShare,
}: HooksCardProps) {
  const navigate = useNavigate()
  const isShort = item.type === 'short'
  const isLive = item.type === 'live'
  const isTrailer = item.type !== 'short' && item.type !== 'ad' && item.type !== 'live'
  const ytKey = isTrailer ? extractYouTubeKey(item.videoUrl) : null
  const hasPlayableTrailer = isTrailer && !!ytKey

  const videoRef = useRef<HTMLVideoElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const burstLayerRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef(0)
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const likeInFlight = useRef(false)

  const [posterHidden, setPosterHidden] = useState(false)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)
  const [bursts, setBursts] = useState<BurstHeart[]>([])
  const [popLike, setPopLike] = useState(false)

  const [liked, setLiked] = useState(item.liked ?? false)
  const [likeCount, setLikeCount] = useState(item.likesCount ?? item.likes ?? 0)
  const [isLiking, setIsLiking] = useState(false)
  const [following, setFollowing] = useState(item.following ?? false)
  const [followSending, setFollowSending] = useState(false)
  const [bookmarked, setBookmarked] = useState(item.bookmarked ?? false)
  const [bookmarkCount, setBookmarkCount] = useState(item.bookmarksCount ?? 0)
  const [bookmarkSending, setBookmarkSending] = useState(false)
  const [sharesCount, setSharesCount] = useState(item.shares ?? 0)
  const [commentCount, setCommentCount] = useState(item.commentsCount ?? commentsCount)

  // Realtime sync: keep local counts/follow state in step with the feed item (WS pushes)
  useEffect(() => {
    const nextLikes = Number(item.likesCount ?? item.likes)
    if (!Number.isNaN(nextLikes)) setLikeCount(nextLikes)
    const nextShares = Number(item.shares)
    if (!Number.isNaN(nextShares)) setSharesCount(nextShares)
    const nextBookmarks = Number(item.bookmarksCount)
    if (!Number.isNaN(nextBookmarks)) setBookmarkCount(nextBookmarks)
    const nextComments = Number(item.commentsCount ?? commentsCount)
    if (!Number.isNaN(nextComments)) setCommentCount(nextComments)
  }, [item.id, item.likesCount, item.likes, item.shares, item.bookmarksCount, item.commentsCount, commentsCount])

  useEffect(() => {
    setLiked(item.liked ?? liked)
    setBookmarked(item.bookmarked ?? bookmarked)
    setFollowing(item.following ?? following)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  // Trailers don't carry like state in the feed payload — hydrate once on first activation
  useEffect(() => {
    if (!isTrailer || !item.mediaId || !active) return
    let cancelled = false
    checkLike(String(item.mediaId), item.mediaType === 'tv' ? 'tv' : 'movie').then((res) => {
      if (cancelled || !res?.success) return
      setLiked(!!res.liked)
      setLikeCount(Number(res.count) || 0)
    }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.mediaId, item.mediaType])

  // Shorts playback control driven by active state
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isShort) return
    if (active) {
      video.play().catch(() => {})
      setPaused(false)
      setPosterHidden(true)
    } else {
      video.pause()
      video.currentTime = 0
      setPaused(false)
    }
  }, [active, isShort])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !isShort || !active) return
    video.muted = muted
  }, [muted, active, isShort])

  useEffect(() => {
    if (!isShort || !active || !item.shortId) return
    if (viewedShortIds.has(item.shortId)) return
    viewedShortIds.add(item.shortId)
    recordShortView(item.shortId).catch(() => {})
  }, [active, isShort, item.shortId])

  const ytCommand = useCallback((func: string) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: '' }),
      '*'
    )
  }, [])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    if (isShort && videoRef.current) {
      videoRef.current.muted = next
    } else if (hasPlayableTrailer) {
      ytCommand(next ? 'mute' : 'unMute')
    }
  }

  const spawnBurst = (clientX: number, clientY: number) => {
    const rect = (burstLayerRef.current as HTMLElement | null)?.getBoundingClientRect()
    if (!rect) return
    const id = Date.now() + Math.random()
    const heart: BurstHeart = { id, x: clientX - rect.left, y: clientY - rect.top }
    setBursts((prev) => [...prev.slice(-4), heart])
    setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), 950)
  }

  const doLike = async (forceLike: boolean) => {
    if (likeInFlight.current) return
    likeInFlight.current = true
    setIsLiking(true)

    if (isShort && item.shortId) {
      const wasLiked = liked
      const wasCount = Number(likeCount) || 0
      if (!(forceLike && wasLiked)) {
        setLiked(!wasLiked)
        setLikeCount(wasLiked ? Math.max(wasCount - 1, 0) : wasCount + 1)
        setPopLike(true)
        setTimeout(() => setPopLike(false), 380)
        const res = await likeShort(item.shortId)
        if (res.success) {
          setLiked(res.liked)
          setLikeCount(Number(res.likes) || 0)
        } else {
          setLiked(wasLiked)
          setLikeCount(wasCount)
        }
      }
    } else if (isTrailer && item.mediaId) {
      const contentType = item.mediaType === 'tv' ? 'tv' : 'movie'
      const wasLiked = liked
      const wasCount = Number(likeCount) || 0
      const target = forceLike ? true : !wasLiked
      if (target !== wasLiked) {
        setLiked(target)
        setLikeCount(target ? Math.max(wasCount, 0) + 1 : Math.max(wasCount - 1, 0))
        setPopLike(true)
        setTimeout(() => setPopLike(false), 380)
        const res = await toggleLike(String(item.mediaId), contentType)
        if (res.success) {
          setLiked(res.liked)
          setLikeCount(Number(res.count) || 0)
        } else {
          setLiked(wasLiked)
          setLikeCount(wasCount)
        }
      }
    }
    setIsLiking(false)
    likeInFlight.current = false
  }

  const handleMediaTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hasPlayableTrailer && !isShort) return
    const now = Date.now()
    const { clientX, clientY } = e
    if (now - lastTapRef.current < 320) {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current)
      lastTapRef.current = 0
      spawnBurst(clientX, clientY)
      doLike(true)
    } else {
      lastTapRef.current = now
      singleTapTimer.current = setTimeout(() => {
        if (isShort && videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play().catch(() => {})
            setPaused(false)
          } else {
            videoRef.current.pause()
            setPaused(true)
          }
        } else if (hasPlayableTrailer && active) {
          if (paused) {
            ytCommand('playVideo')
            setPaused(false)
          } else {
            ytCommand('pauseVideo')
            setPaused(true)
          }
        }
      }, 320)
    }
  }

  const handleBookmark = async () => {
    if (!item.shortId || bookmarkSending) return
    const prevBookmarked = bookmarked
    const prevCount = Number(bookmarkCount) || 0
    setBookmarkSending(true)
    setBookmarked(!prevBookmarked)
    setBookmarkCount(prevBookmarked ? Math.max(prevCount - 1, 0) : prevCount + 1)
    const res = await bookmarkShort(item.shortId)
    if (res.success) {
      setBookmarked(res.bookmarked)
      setBookmarkCount(Number(res.bookmarks) || 0)
    } else {
      setBookmarked(prevBookmarked)
      setBookmarkCount(prevCount)
    }
    setBookmarkSending(false)
  }

  const handleFollow = async () => {
    if (!item.creatorId || followSending) return
    const prev = following
    setFollowSending(true)
    setFollowing(true)
    const res = await toggleFollow(item.creatorId)
    if (res.success) {
      setFollowing(res.following)
    } else {
      setFollowing(prev)
    }
    setFollowSending(false)
  }

  const handleShare = () => {
    onShare?.(item)
    if (!item.shortId) return
    shareShort(item.shortId).then(r => {
      if (r.success) setSharesCount(Number(r.shares) || 0)
    })
  }

  if (item.type === 'ad') {
    return (
      <div className="h-full w-full flex-shrink-0 snap-start bg-surface-container flex items-center justify-center">
        <div className="text-center px-6">
          <div className="w-16 h-16 rounded-full bg-accent/20 border border-premium/30 flex items-center justify-center mx-auto mb-4">
            <Icon name="workspace_premium" className="w-8 h-8 text-primary-container" />
          </div>
          <p className="text-on-surface-variant text-sm">Sponsored Content</p>
          <p className="text-on-surface-variant/60 text-xs mt-1">Upgrade to Premium for fewer ads</p>
        </div>
      </div>
    )
  }

  const trackName = isShort ? (audioTrackName || `Original Audio · ${item.creatorName || 'Novaflix'}`) : undefined

  return (
    <div className="h-full w-full flex-shrink-0 snap-start relative bg-black">
      {/* Video / Poster */}
      <div className="absolute inset-0 flex items-center justify-center">
        {hasPlayableTrailer && near ? (
          <iframe
            ref={iframeRef}
            key={`${item.id}-${muted ? 'm' : 'u'}`}
            src={`https://www.youtube.com/embed/${ytKey}?enablejsapi=1&autoplay=${active ? 1 : 0}&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${ytKey}&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3`}
            title={item.title}
            className="w-full h-full object-cover pointer-events-none"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            frameBorder="0"
          />
        ) : (
          <>
            {item.poster && !posterHidden && (
              <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
            )}
            {isShort && (
              <video
                ref={videoRef}
                src={item.videoUrl || undefined}
                poster={item.poster || undefined}
                className="w-full h-full object-cover"
                playsInline
                loop
                preload="metadata"
                muted={muted}
                onCanPlay={() => { if (active) videoRef.current?.play().catch(() => {}) }}
              />
            )}
          </>
        )}

        {/* Tap catcher — double-tap to like, single-tap to pause/play */}
        {(isShort || hasPlayableTrailer) && (
          <div
            className="absolute inset-0 z-[5]"
            onClick={handleMediaTap}
            aria-label="Video interactions"
          />
        )}
      </div>

      {/* Heart burst layer */}
      <div ref={burstLayerRef} className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
        {bursts.map((b) => (
          <svg
            key={b.id}
            viewBox="0 0 24 24"
            className="absolute w-24 h-24 text-[#ff2d55] animate-heart-burst drop-shadow-lg"
            style={{ left: b.x - 48, top: b.y - 48 }}
            fill="currentColor"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        ))}
      </div>

      {/* Pause indicator */}
      {paused && active && (
        <div className="absolute inset-0 z-[6] flex items-center justify-center pointer-events-none">
          <Icon name="play_arrow" size="lg" className="text-white/70 w-16 h-16" />
        </div>
      )}

      {/* Overlay gradient */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

      {/* Mute / unmute — top left */}
      <button
        type="button"
        onClick={toggleMute}
        className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center hover:bg-black/60 active:scale-90 transition-all"
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        <Icon name={muted ? 'volume_off' : 'volume_up'} className="text-white" />
      </button>

      {/* Interaction stack */}
      <div className="absolute right-4 bottom-24 md:bottom-28 flex flex-col items-center gap-5 md:gap-6 z-10">
        {/* Profile target with layered plus badge — shorts have creators; trailers don't */}
        {isShort && (
          <button
            type="button"
            className="relative"
            onClick={() => { if (item.creatorName) navigate(`/profile/${item.creatorName}`) }}
            aria-label={item.creatorName ? `View ${item.creatorName}` : 'View profile'}
          >
            <span className="w-12 h-12 rounded-full border-2 border-white bg-neutral-700 flex items-center justify-center overflow-hidden">
              {item.creatorAvatar || creatorAvatar ? (
                <img src={item.creatorAvatar || creatorAvatar || undefined} alt="" className="w-full h-full object-cover" />
              ) : (
                <Icon name="person" size="lg" className="text-white/80" />
              )}
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); handleFollow() }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleFollow() } }}
              className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center transition-all duration-300 ${
                following ? 'bg-[#4caf50]' : 'bg-[#e50914]'
              } ${followSending ? 'opacity-70' : ''}`}
              aria-label={following ? 'Following' : 'Follow creator'}
            >
              <Icon name={following ? 'check' : 'add'} className="text-white !text-xs" />
            </span>
          </button>
        )}

        {/* Like — works on every card */}
        <button
          onClick={() => doLike(false)}
          disabled={isLiking}
          className="flex flex-col items-center gap-1 group"
          aria-label={liked ? 'Unlike' : 'Like'}
        >
          <Icon
            name={liked ? 'favorite' : 'favorite_border'}
            fill={liked}
            size="lg"
            className={`transition-all duration-200 ${liked ? 'text-[#e50914]' : 'text-white group-hover:text-red-400'} ${popLike ? 'animate-like-pop' : ''}`}
          />
          <span className="text-xs text-white font-medium">{formatCount(likeCount)}</span>
        </button>

        {/* Comments — works on every card */}
        <button
          onClick={onOpenComments}
          className="flex flex-col items-center gap-1 group"
          aria-label="Comments"
        >
          <Icon
            name="chat_bubble"
            size="lg"
            className="text-white group-hover:text-red-400 transition-colors"
          />
          <span className="text-xs text-white font-medium">{formatCount(commentCount)}</span>
        </button>

        {/* Bookmark — shorts only */}
        {isShort && (
          <button
            onClick={handleBookmark}
            disabled={bookmarkSending}
            className="flex flex-col items-center gap-1 group"
            aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          >
            <Icon
              name={bookmarked ? 'bookmark' : 'bookmark_border'}
              fill={bookmarked}
              size="lg"
              className={`transition-all duration-200 ${bookmarked ? 'text-[#f5c518] scale-110' : 'text-white group-hover:text-amber-400'}`}
            />
            <span className="text-xs text-white font-medium">{formatCount(bookmarkCount)}</span>
          </button>
        )}

        {/* Share — works on every card */}
        <button onClick={handleShare} className="flex flex-col items-center gap-1 group" aria-label="Share">
          <Icon name="share" size="lg" className="text-white group-hover:text-red-400 transition-colors" />
          {isShort && (
            <span className="text-xs text-white font-medium">{formatCount(sharesCount)}</span>
          )}
        </button>
      </div>

      {/* Content footnote */}
      <div className="absolute left-4 bottom-4 right-16 text-white z-10">
        {item.promoted && (
          <span className="text-[10px] uppercase tracking-wider text-primary-container bg-primary-container/20 px-2 py-0.5 rounded font-semibold mb-1.5 inline-block">
            Sponsored
          </span>
        )}

        {isLive ? (
          <>
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-red-500/20 backdrop-blur px-2 py-0.5 rounded-lg w-fit mb-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> LIVE
            </span>
            <h2 className="font-bold text-sm md:text-base text-white truncate">{item.title}</h2>
            <p className="text-xs md:text-sm text-white/80 truncate mt-0.5">@{item.creatorName || 'creator'}</p>
            <span className="flex items-center gap-1 text-xs md:text-sm text-white/70 mt-1">
              <Icon name="visibility" size="sm" /> {formatCount(item.viewerCount || 0)} watching
            </span>
          </>
        ) : isShort ? (
          <>
            <h2 className="font-bold text-sm md:text-base text-white truncate">
              @{item.creatorName || item.title.replace(/\s+/g, '')}
            </h2>

            {item.description && (
              <p className="text-xs md:text-sm line-clamp-2 mb-2 leading-relaxed text-white/90">
                {item.description}{' '}
                {(item.hashtags?.length ? item.hashtags : ['fyp', 'novaflix', 'shorts']).map((tag, i) => (
                  <span key={i} className="text-[#ffb4aa] font-semibold">#{tag} </span>
                ))}
              </p>
            )}

            <div className="flex items-center gap-3">
              {trackName && (
                <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
                  <Icon name="music_note" size="sm" className="text-white shrink-0 animate-spin-music" />
                  <div className="overflow-hidden flex-1">
                    <div className="animate-marquee inline-flex whitespace-nowrap">
                      <span className="pr-8 text-xs md:text-sm text-white/80">{trackName}</span>
                      <span className="pr-8 text-xs md:text-sm text-white/80">{trackName}</span>
                    </div>
                  </div>
                </div>
              )}
              {!!Number(item.views) && (
                <span className="flex items-center gap-1 shrink-0 text-xs md:text-sm text-white/80">
                  <Icon name="visibility" size="sm" /> {formatCount(item.views)}
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-bold text-sm md:text-base text-white truncate">{item.title}</h2>
              <span className="text-sm md:text-base text-white/70 shrink-0">{item.year}</span>
            </div>

            <div className="flex items-center gap-2">
              {item.mediaId && (
                <button
                  onClick={() => navigate(`/${item.mediaType === 'tv' ? 'tv' : 'movie'}/${item.mediaId}`)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-container text-on-primary-container rounded-xl font-semibold text-sm hover:brightness-110 active:scale-95 transition-all mb-2"
                >
                  <Icon name="play_arrow" fill={true} /> Watch Full Movie
                </button>
              )}
              {!!likeCount && (
                <span className="flex items-center gap-1 mb-2 text-xs md:text-sm text-white/80">
                  <Icon name="favorite" size="sm" /> {formatCount(likeCount)} likes
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

let viewedShortIds = new Set<string>()
