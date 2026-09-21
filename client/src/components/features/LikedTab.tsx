import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getCreatorLiked, type CreatorLikedVideo } from '../../lib/api'
import VideoCard from './VideoCard'

export default function LikedTab() {
  const { id } = useParams<{ id: string }>()
  const [videos, setVideos] = useState<CreatorLikedVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [total, setTotal] = useState(0)

  const loadVideos = useCallback(async (pageNum: number, append = false) => {
    if (!id) return
    try {
      if (!append) setLoading(true)
      const res = await getCreatorLiked(id, pageNum, 20)
      if (res.success) {
        if (append) {
          setVideos(prev => [...prev, ...res.videos])
        } else {
          setVideos(res.videos)
        }
        setTotal(res.total)
        setHasMore(!!res.nextPage)
        setPage(pageNum)
      }
    } catch (err) {
      console.error('Failed to load liked videos:', err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadVideos(1, false)
  }, [loadVideos])

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadVideos(page + 1, true)
    }
  }

  if (loading && videos.length === 0) {
    return (
      <div className="px-4 md:px-6 pb-8 animate-pulse space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-[9/16] bg-white/5 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div className="px-4 md:px-6 pb-8 text-center py-16">
        <svg className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        <p className="text-on-surface-variant/60 text-sm">No liked videos yet</p>
      </div>
    )
  }

  return (
    <div className="px-4 md:px-6 pb-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} type={video.type} />
        ))}
      </div>
      {hasMore && (
        <div className="text-center pt-4">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="px-6 py-2.5 bg-surface-variant/50 border border-white/10 text-on-surface rounded-xl hover:bg-surface-variant/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mx-auto"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </button>
        </div>
      )}
      <p className="text-center text-xs text-on-surface-variant/50 mt-4">{total} video{total !== 1 ? 's' : ''} liked</p>
    </div>
  )
}