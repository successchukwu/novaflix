import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getCreatorShorts, getCreatorUploadsPublic, type CreatorShort } from '../../lib/api'
import VideoCard from './VideoCard'
import Icon from '../ui/Icon'

function SectionHeader({ icon, title, count }: { icon: string; title: string; count?: number }) {
  return (
    <h3 className="flex items-center gap-2 font-label-md text-label-md uppercase tracking-widest mb-3 mt-6 first:mt-0">
      <Icon name={icon} className="text-primary-container" /> {title}
      {typeof count === 'number' && <span className="text-on-surface-variant/50 font-normal normal-case">· {count}</span>}
    </h3>
  )
}

export default function VideosTab() {
  const { id } = useParams<{ id: string }>()
  const [shorts, setShorts] = useState<CreatorShort[]>([])
  const [uploads, setUploads] = useState<any[]>([])
  const [shortsLoading, setShortsLoading] = useState(true)
  const [uploadsLoading, setUploadsLoading] = useState(true)
  const [shortsPage, setShortsPage] = useState(1)
  const [uploadsPage, setUploadsPage] = useState(1)
  const [shortsHasMore, setShortsHasMore] = useState(true)
  const [uploadsHasMore, setUploadsHasMore] = useState(true)
  const [shortsTotal, setShortsTotal] = useState(0)
  const [uploadsTotal, setUploadsTotal] = useState(0)

  const loadShorts = useCallback(async (pageNum: number, append = false) => {
    if (!id) return
    try {
      if (!append) setShortsLoading(true)
      const res = await getCreatorShorts(id, pageNum, 12)
      if (res.success) {
        setShorts(prev => append ? [...prev, ...res.shorts] : res.shorts)
        setShortsTotal(res.total)
        setShortsHasMore(!!res.nextPage)
        setShortsPage(pageNum)
      }
    } catch (err) {
      console.error('Failed to load shorts:', err)
    } finally {
      setShortsLoading(false)
    }
  }, [id])

  const loadUploads = useCallback(async (pageNum: number, append = false) => {
    if (!id) return
    try {
      if (!append) setUploadsLoading(true)
      const res = await getCreatorUploadsPublic(id, pageNum, 12)
      if (res.success) {
        setUploads(prev => append ? [...prev, ...res.uploads] : res.uploads)
        setUploadsTotal(res.total)
        setUploadsHasMore(!!res.nextPage)
        setUploadsPage(pageNum)
      }
    } catch (err) {
      console.error('Failed to load uploads:', err)
    } finally {
      setUploadsLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadShorts(1, false)
    loadUploads(1, false)
  }, [loadShorts, loadUploads])

  const isInitialLoading = (shortsLoading && shorts.length === 0) && (uploadsLoading && uploads.length === 0)

  if (isInitialLoading) {
    return (
      <div className="px-4 md:px-6 pb-8 animate-pulse space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="aspect-[16/9] bg-white/5 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="aspect-[9/16] bg-white/5 rounded-xl" />)}
        </div>
      </div>
    )
  }

  const noMovies = !uploadsLoading && uploads.length === 0
  const noShorts = !shortsLoading && shorts.length === 0

  if (noMovies && noShorts) {
    return (
      <div className="px-4 md:px-6 pb-8 text-center py-16">
        <Icon name="video_library" className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" />
        <p className="text-on-surface-variant/60 text-sm">No videos yet</p>
      </div>
    )
  }

  return (
    <div className="px-4 md:px-6 pb-8">
      {/* Movies row */}
      <SectionHeader icon="movie" title="Movies" count={uploadsTotal} />
      {uploadsLoading && uploads.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="aspect-[16/9] bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      ) : noMovies ? (
        <p className="text-sm text-on-surface-variant/40 py-4">No movies yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {uploads.map((u: any) => (
              <VideoCard
                key={u.id}
                video={{
                  id: u.id,
                  title: u.title,
                  thumbnail_url: u.thumbnail_url,
                  views: u.views,
                  duration_seconds: u.duration_seconds,
                  created_at: u.created_at,
                } as any}
                type="upload"
              />
            ))}
          </div>
          {uploadsHasMore && (
            <div className="text-center pt-4">
              <button
                onClick={() => loadUploads(uploadsPage + 1, true)}
                disabled={uploadsLoading}
                className="px-6 py-2 bg-surface-variant/50 border border-white/10 text-on-surface rounded-xl hover:bg-surface-variant/80 transition-colors disabled:opacity-50 text-sm"
              >
                {uploadsLoading ? 'Loading…' : 'Load more movies'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Reels row */}
      <SectionHeader icon="video_library" title="Reels" count={shortsTotal} />
      {shortsLoading && shorts.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="aspect-[9/16] bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      ) : noShorts ? (
        <p className="text-sm text-on-surface-variant/40 py-4">No reels yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {shorts.map((short) => (
              <VideoCard key={short.id} video={short} type="short" />
            ))}
          </div>
          {shortsHasMore && (
            <div className="text-center pt-4">
              <button
                onClick={() => loadShorts(shortsPage + 1, true)}
                disabled={shortsLoading}
                className="px-6 py-2 bg-surface-variant/50 border border-white/10 text-on-surface rounded-xl hover:bg-surface-variant/80 transition-colors disabled:opacity-50 text-sm"
              >
                {shortsLoading ? 'Loading…' : 'Load more reels'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
