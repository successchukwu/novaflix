import { useState, useRef, useEffect, useCallback } from 'react'
import { getHooksFeed } from '../lib/api'
import { uploadShort, getShortComments, postShortComment, getToken, getComments, postComment } from '../lib/auth'
import { WS_ORIGIN } from '../lib/config'
import Icon from '../components/ui/Icon'
import Modal from '../components/ui/Modal'
import HooksCard from '../components/features/HooksCard'
import ShortCommentsSheet from '../components/features/ShortCommentsSheet'
import { useAuth } from '../lib/AuthContext'
import type { HookItem, ShortComment } from '../types'

export default function HooksFeed() {
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { isCreator } = useAuth()
  const [items, setItems] = useState<HookItem[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadDesc, setUploadDesc] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [activeComments, setActiveComments] = useState<ShortComment[]>([])

  const fetchPage = useCallback(async (pageNum: number) => {
    const res = await getHooksFeed(pageNum)
    if (res.success) {
      setItems(prev => pageNum === 1 ? res.data : [...prev, ...res.data])
      setHasMore(!!res.nextPage)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPage(1)
  }, [fetchPage])

  const activeIndexRef = useRef(0)
  useEffect(() => { activeIndexRef.current = activeIndex }, [activeIndex])
  const itemsRef = useRef<HookItem[]>([])
  useEffect(() => { itemsRef.current = items }, [items])

  // Realtime shorts events over WebSocket — push like/comment/share/view updates into the feed
  useEffect(() => {
    const token = getToken()
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = WS_ORIGIN ? new URL(WS_ORIGIN).host : window.location.host
    const ws = new WebSocket(`${protocol}//${host}/ws?token=${encodeURIComponent(token || '')}`)
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        const shortId = data?.shortId
        if (!shortId) return
        if (data?.type === 'shorts:like') {
          setItems(prev => prev.map(it => it.shortId === shortId ? { ...it, likesCount: data.likes, likes: data.likes } : it))
        } else if (data?.type === 'shorts:comment') {
          setItems(prev => prev.map(it => it.shortId === shortId ? { ...it, commentsCount: (Number(it.commentsCount) || 0) + 1 } : it))
          const activeShort = itemsRef.current[activeIndexRef.current]?.shortId
          if (data.comment?.short_id === activeShort) {
            setActiveComments(prev => {
              if (prev.some(c => c.id === data.comment.id)) return prev
              return [{
                id: data.comment.id,
                userName: data.comment.user_name || 'Anonymous',
                userAvatar: data.comment.user_avatar || null,
                text: data.comment.text,
                createdAt: data.comment.created_at,
              }, ...prev]
            })
          }
        } else if (data?.type === 'shorts:share') {
          setItems(prev => prev.map(it => it.shortId === shortId ? { ...it, shares: data.shares } : it))
        } else if (data?.type === 'shorts:bookmark') {
          setItems(prev => prev.map(it => it.shortId === shortId ? { ...it, bookmarksCount: data.bookmarks } : it))
        } else if (data?.type === 'shorts:view') {
          setItems(prev => prev.map(it => it.shortId === shortId ? { ...it, views: data.views } : it))
        } else if (data?.type === 'like' && data?.contentId) {
          // Generic (TMDB trailer) like broadcast
          const cid = String(data.contentId)
          const ctype = data.contentType === 'tv' ? 'tv' : 'movie'
          setItems(prev => prev.map(it => (
            it.type !== 'short' && it.mediaId && String(it.mediaId) === cid && (it.mediaType ?? 'movie') === ctype
              ? { ...it, likesCount: Number(data.count) || 0 }
              : it
          )))
        } else if (data?.type === 'comment' && data?.contentId && data?.comment) {
          // Generic (TMDB trailer) comment broadcast
          const cid = String(data.contentId)
          const ctype = data.contentType === 'tv' ? 'tv' : 'movie'
          setItems(prev => prev.map(it => (
            it.type !== 'short' && it.mediaId && String(it.mediaId) === cid && (it.mediaType ?? 'movie') === ctype
              ? { ...it, commentsCount: (Number(it.commentsCount) || 0) + 1 }
              : it
          )))
          const activeItem = itemsRef.current[activeIndexRef.current]
          if (activeItem?.type !== 'short' && activeItem?.mediaId && String(activeItem.mediaId) === cid) {
            setActiveComments(prev => {
              if (prev.some(c => c.id === data.comment.id)) return prev
              return [{
                id: data.comment.id,
                userName: data.comment.user_name || 'Anonymous',
                userAvatar: data.comment.user_avatar || null,
                text: data.comment.text ?? '',
                createdAt: data.comment.created_at,
              }, ...prev]
            })
          }
        }
      } catch { /* ignore malformed frames */ }
    }
    return () => ws.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // IntersectionObserver to detect which card is most in view
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = parseInt(entry.target.getAttribute('data-index') || '0', 10)
            setActiveIndex(idx)
          }
        }
      },
      { threshold: 0.7 }
    )

    const cards = container.querySelectorAll('[data-index]')
    cards.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [items])

  // Infinite scroll sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          setPage(prev => prev + 1)
          fetchPage(page + 1)
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, page, fetchPage])

  const openComments = useCallback(async () => {
    const current = items[activeIndex]
    if (!current) return
    setCommentsOpen(true)
    setActiveComments([])
    if (current.shortId) {
      const res = await getShortComments(current.shortId)
      if (res.success && Array.isArray(res.comments)) {
        setActiveComments(res.comments.map((c: any) => ({
          id: c.id,
          userName: c.user_name || 'Anonymous',
          userAvatar: c.user_avatar || null,
          text: c.text,
          createdAt: c.created_at,
        })))
      }
    } else if (current.mediaId) {
      const contentType = current.mediaType === 'tv' ? 'tv' : 'movie'
      const res = await getComments(String(current.mediaId), contentType)
      if (res.success && Array.isArray(res.comments)) {
        const mapped = res.comments
          .filter((c: any) => !c.locked)
          .map((c: any) => ({
            id: c.id,
            userName: c.user_name || 'Anonymous',
            userAvatar: c.user_avatar || null,
            text: c.text ?? '',
            createdAt: c.created_at,
          }))
        setActiveComments(mapped)
        const total = Number(res.total) || mapped.length
        setItems(prev => prev.map((it, idx) => idx === activeIndex ? { ...it, commentsCount: total } : it))
      }
    }
  }, [items, activeIndex])

  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle.trim()) {
      setUploadError('Choose a video and add a title')
      return
    }
    setUploading(true)
    setUploadError('')
    const res = await uploadShort(uploadFile, uploadTitle.trim(), uploadDesc.trim())
    setUploading(false)
    if (!res.success || !res.short) {
      setUploadError(res.error || 'Upload failed')
      return
    }
    const created = res.short
    const hookItem: HookItem = {
      id: `short-${created.id}`,
      videoUrl: created.video_url,
      poster: created.thumbnail_url || null,
      title: created.title,
      year: '',
      type: 'short',
      promoted: false,
      shortId: created.id,
      creatorName: created.creator_name,
      views: created.views,
      likes: created.likes,
    }
    setItems(prev => [hookItem, ...prev])
    setUploadOpen(false)
    setUploadTitle('')
    setUploadDesc('')
    setUploadFile(null)
  }

  const handleShare = useCallback(async (item?: HookItem) => {
    const target = item || items[activeIndex]
    let url = `${window.location.origin}/hooks`
    let title = 'Novaflix Hooks'
    if (target?.shortId) {
      url = `${window.location.origin}/hooks?short=${target.shortId}`
    } else if (target?.mediaId) {
      url = `${window.location.origin}/${target.mediaType === 'tv' ? 'tv' : 'movie'}/${target.mediaId}`
      title = target.title
    }
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        /* dismissed */
      }
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* noop */
    }
  }, [items, activeIndex])

  const handleArrow = useCallback((dir: 'up' | 'down') => {
    const container = containerRef.current
    if (!container) return
    const next = dir === 'down' ? Math.min(activeIndex + 1, items.length - 1) : Math.max(activeIndex - 1, 0)
    container.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [activeIndex, items.length])

  return (
    <div className="w-full h-screen overflow-hidden bg-black flex flex-col">
      {/* Main feed area — player centered, nav buttons beside it */}
      <div className="flex-1 min-h-0 flex items-center justify-center gap-2 md:gap-3 px-2 sm:px-4 md:px-6">
        <div className="flex-1 min-w-0 h-full md:h-[92vh] md:max-h-full md:max-w-[450px] md:rounded-2xl md:border md:border-neutral-800 md:shadow-2xl relative overflow-hidden">
        {/* Upload Trailers — creators only (viewer-only upload gate via isCreator) */}
        {isCreator ? (
          <button
            onClick={() => setUploadOpen(true)}
            className="absolute top-4 right-4 z-30 flex items-center gap-1.5 px-4 py-2 rounded-full bg-black/50 backdrop-blur-md border border-white/20 hover:bg-black/70 active:scale-95 transition-all"
            aria-label="Upload trailers"
          >
            <Icon name="add" size="sm" className="text-white" />
            <span className="text-sm font-semibold text-white">Upload Trailers</span>
          </button>
        ) : (
          <div className="absolute top-4 right-4 z-30 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[11px] text-white/50">
            Viewer mode — creators can upload
          </div>
        )}

        {/* Index indicator */}
        <div className="absolute top-4 left-4 z-30 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full text-xs text-white/60">
          {activeIndex + 1} / {items.length}
        </div>

        {/* Snap scroll container */}
        <div
          ref={containerRef}
          className="snap-y snap-mandatory h-full w-full overflow-y-scroll scroll-smooth no-scrollbar"
        >
          {items.map((item, i) => (
            <div key={item.id} data-index={i} className="h-full w-full flex-shrink-0 snap-start">
              <HooksCard
                item={item}
                active={i === activeIndex}
                near={Math.abs(i - activeIndex) <= 1}
                audioTrackName={item.type === 'short' ? `Original Audio · ${item.creatorName || 'Novaflix'}` : undefined}
                onOpenComments={openComments}
                onShare={handleShare}
              />
            </div>
          ))}

          {loading && (
            <div className="h-full w-full flex-shrink-0 snap-start bg-surface-container flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          <div ref={sentinelRef} className="h-1" />
        </div>

        {/* Comments drawer */}
        <ShortCommentsSheet
          open={commentsOpen}
          comments={activeComments}
          count={activeComments.length}
          onClose={() => setCommentsOpen(false)}
          onSubmit={async (text) => {
            const current = items[activeIndex]
            if (!current) return
            if (current.shortId) {
              // WS 'shorts:comment' echo (sent to us too) inserts the comment and bumps the count
              await postShortComment(current.shortId, text)
            } else if (current.mediaId) {
              // WS 'comment' echo does the same for trailer cards
              await postComment(String(current.mediaId), current.mediaType === 'tv' ? 'tv' : 'movie', text)
            }
          }}
        />

        {/* Up / down navigation arrows — beside the player, outside it */}
        </div>
        <div className="flex flex-col gap-3 shrink-0">
          <button
            onClick={() => handleArrow('up')}
            disabled={activeIndex === 0}
            className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-black/40 border border-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 active:scale-90 transition-all disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Previous clip"
          >
            <Icon name="arrow_upward" size="sm" />
          </button>
          <button
            onClick={() => handleArrow('down')}
            disabled={activeIndex >= items.length - 1}
            className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-black/40 border border-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 active:scale-90 transition-all disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Next clip"
          >
            <Icon name="arrow_downward" size="sm" />
          </button>
        </div>
      </div>

      <Modal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload a Short">
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs text-on-surface-variant uppercase tracking-wide mb-1.5 block">Video file</span>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="w-full text-sm file:mr-3 file:px-4 file:py-2 file:rounded-lg file:bg-surface-container-high file:text-on-surface file:border-0 file:cursor-pointer hover:file:bg-surface-container-highest transition-colors"
            />
            {uploadFile && (
              <p className="text-xs text-on-surface-variant/60 mt-1 truncate">{uploadFile.name} · {(uploadFile.size / 1024 / 1024).toFixed(1)} MB</p>
            )}
          </label>

          <label className="block">
            <span className="text-xs text-on-surface-variant uppercase tracking-wide mb-1.5 block">Title</span>
            <input
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="Give your short a title"
              maxLength={100}
              className="w-full bg-surface-container-high border border-white/10 text-on-surface rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary placeholder-on-surface-variant/40"
            />
          </label>

          <label className="block">
            <span className="text-xs text-on-surface-variant uppercase tracking-wide mb-1.5 block">Description (optional)</span>
            <textarea
              value={uploadDesc}
              onChange={(e) => setUploadDesc(e.target.value)}
              placeholder="What's this short about?"
              rows={3}
              maxLength={300}
              className="w-full bg-surface-container-high border border-white/10 text-on-surface rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary placeholder-on-surface-variant/40 resize-none"
            />
          </label>

          {uploadError && <p className="text-sm text-error">{uploadError}</p>}

          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 bg-primary-container text-on-primary-container px-6 py-3 rounded-xl font-semibold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none min-h-[44px]"
          >
            {uploading ? (
              <>
                <span className="w-4 h-4 border-2 border-on-primary-container border-t-transparent rounded-full animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Icon name="upload" size="sm" /> Upload Short
              </>
            )}
          </button>
        </div>
      </Modal>
    </div>
  )
}
