import { Link } from 'react-router-dom'
import Icon from '../ui/Icon'

interface VideoCardProps {
  video: {
    id: string
    title: string
    thumbnail_url: string | null
    views: number
    likes: number
    is_pinned?: boolean
    duration_seconds: number
  }
  type?: 'short' | 'upload'
}

export default function VideoCard({ video, type = 'short' }: VideoCardProps) {
  const formatViews = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
    return String(n)
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const isViral = video.views >= 100000

  return (
    <Link to={type === 'short' ? `/hooks/${video.id}` : `/watch?id=${video.id}&type=movie`} className="group block">
      <div className="relative aspect-[9/16] bg-surface-container-high rounded-xl overflow-hidden">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-container">
            <Icon name="videocam" className="w-12 h-12 text-on-surface-variant/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
        
        {video.is_pinned && (
          <span className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold uppercase tracking-wide">
            Pinned
          </span>
        )}
        
        {isViral && (
          <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded bg-yellow-500 text-black text-[10px] font-bold uppercase tracking-wide">
            Viral
          </span>
        )}
        
        <span className="absolute bottom-2 right-2 z-10 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[11px] font-medium text-white">
          {formatDuration(video.duration_seconds)}
        </span>
        
        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 text-white text-[11px]">
          <Icon name="visibility" className="w-3.5 h-3.5" />
          <span>{formatViews(video.views)}</span>
        </div>
        
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <Icon name="play_circle" className="w-14 h-14 text-white/90 drop-shadow-lg" />
        </div>
      </div>
      <div className="mt-2 px-1">
        <p className="text-sm font-medium text-on-surface line-clamp-1">{video.title}</p>
        <p className="text-xs text-on-surface-variant/60 mt-0.5">{formatViews(video.likes)} likes</p>
      </div>
    </Link>
  )
}