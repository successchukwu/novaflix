import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon'
import FollowButton from '../ui/FollowButton'
import GlowGiftButton from '../ui/GlowGiftButton'
import { subscribeContent } from '../../lib/live'
import { useAuth } from '../../lib/AuthContext'

interface CreatorProfileHeaderProps {
  creator: {
    id: string
    name: string
    avatar: string | null
    bio: string | null
    verified?: boolean
    known_for_department: string | null
    followers_count: number
    total_likes: number
    total_views: number
  }
  stats: {
    followers: number
    following: number
    profile?: { name: string; avatar: string | null }
  } | null
  fanStatus: {
    badge?: { label: string; color: string }
  } | null
  isLive: boolean
}

export default function CreatorProfileHeader({ creator, stats, fanStatus, isLive }: CreatorProfileHeaderProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [liveState, setLiveState] = useState(isLive)

  const formatCount = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
    return String(n)
  }

  // Subscribe to live updates
  if (typeof window !== 'undefined') {
    subscribeContent('creator', creator.id, (msg) => {
      if (msg.type === 'live' && typeof msg.isLive === 'boolean') {
        setLiveState(msg.isLive)
      }
    })
  }

  return (
    <div className="relative">
      {/* Cover Gradient */}
      <div className="relative h-[200px] w-full bg-gradient-to-br from-red-900/50 via-red-800/30 to-black overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--tw-gradient-stops))] from-red-500/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent" />
      </div>

      {/* Profile Content */}
      <div className="px-4 md:px-6 pb-6 relative -mt-20">
        <div className="max-w-5xl mx-auto">
          {/* Avatar + Actions */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="flex items-center gap-4 relative z-10">
              <div className="relative">
                <div className="w-28 h-28 md:w-32 md:h-32 rounded-full p-1 bg-gradient-to-br from-red-500 via-orange-500 to-red-700">
                  <div className="w-full h-full rounded-full border-4 border-surface overflow-hidden bg-surface-container">
                    {creator.avatar ? (
                      <img src={creator.avatar} alt={creator.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon name="person" className="w-10 h-10 md:w-12 md:h-12 text-on-surface-variant/40" />
                      </div>
                    )}
                  </div>
                </div>
                {liveState && (
                  <span className="absolute bottom-2 right-2 w-5 h-5 bg-red-500 border-3 border-surface rounded-full animate-pulse" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-bold text-on-surface truncate">{creator.name}</h1>
                  {creator.verified && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold shrink-0">
                      <Icon name="check" className="w-3 h-3" />
                    </span>
                  )}
                </div>
                {creator.known_for_department && (
                  <p className="text-sm text-on-surface-variant/70 mt-0.5">{creator.known_for_department}</p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 justify-end md:justify-end w-full md:w-auto">
              <FollowButton 
                creatorId={creator.id} 
                className="px-5 py-2.5 text-sm font-semibold"
              />
              <Link
                to={`/creators/${creator.id}`}
                className="px-5 py-2.5 text-sm font-semibold bg-surface-variant/50 border border-white/10 text-on-surface rounded-xl hover:bg-surface-variant/80 transition-colors flex items-center gap-2"
              >
                <Icon name="store" className="w-4 h-4" /> Store
              </Link>
              {user && user.id !== creator.id && (
                <GlowGiftButton creatorId={creator.id} recipientName={creator.name} />
              )}
            </div>
          </div>

          {/* Bio & Link */}
          <div className="mt-4 max-w-2xl">
            {creator.bio && (
              <p className="text-body-md text-on-surface-variant leading-relaxed">{creator.bio}</p>
            )}
            {fanStatus?.badge && (
              <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: `${fanStatus.badge.color}22`, color: fanStatus.badge.color, border: `1px solid ${fanStatus.badge.color}55` }}>
                <Icon name="emoji_events" className="w-3.5 h-3.5" /> {fanStatus.badge.label}
              </span>
            )}
          </div>

          {/* Metrics */}
          <div className="mt-6 grid grid-cols-3 gap-4 max-w-xl border-y border-white/10 py-4">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-on-surface tabular-nums">
                {formatCount(stats?.followers || creator.followers_count)}
              </div>
              <div className="text-xs text-on-surface-variant/60 mt-0.5">Followers</div>
            </div>
            <div className="text-center border-x border-white/10 px-4">
              <div className="text-2xl md:text-3xl font-bold text-on-surface tabular-nums">
                {formatCount(stats?.following || 0)}
              </div>
              <div className="text-xs text-on-surface-variant/60 mt-0.5">Following</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-on-surface tabular-nums">
                {formatCount(creator.total_likes)}
              </div>
              <div className="text-xs text-on-surface-variant/60 mt-0.5">Likes</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}