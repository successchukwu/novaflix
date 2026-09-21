import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { getFollowStats, getFanLeaderboard, getFanStatus } from '../lib/auth'
import { getCreatorDiscovery } from '../lib/api'
import CreatorProfileHeader from '../components/features/CreatorProfileHeader'
import OverviewTab from '../components/features/OverviewTab'
import VideosTab from '../components/features/VideosTab'
import LikedTab from '../components/features/LikedTab'
import StoreTab from '../components/features/StoreTab'

type Tab = 'overview' | 'videos' | 'liked' | 'store'

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'videos', label: 'Videos', icon: 'video_library' },
  { id: 'liked', label: 'Liked', icon: 'favorite' },
  { id: 'store', label: 'Store', icon: 'store' },
]

export default function CreatorProfile() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [creator, setCreator] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [fans, setFans] = useState<any[]>([])
  const [fanStatus, setFanStatus] = useState<any>(null)
  const [isLive, setIsLive] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)

    const loadData = async () => {
      try {
        const [discovery, followStats, leaderboard, fanStat] = await Promise.all([
          getCreatorDiscovery(id),
          getFollowStats(id),
          getFanLeaderboard(id),
          getFanStatus(id),
        ])
        if (cancelled) return
        if (discovery.success) {
          setCreator(discovery.creator)
          setIsLive(discovery.creator.isLive || false)
        }
        if (followStats.success) setStats(followStats)
        if (leaderboard.success) setFans(leaderboard.fans || [])
        if (fanStat.success) setFanStatus(fanStat)
      } catch (err) {
        console.error('Failed to load creator profile:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()

    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-surface animate-pulse">
        <div className="h-[200px] bg-white/5" />
        <div className="px-4 md:px-6 -mt-20 pb-8 space-y-8 max-w-5xl mx-auto">
          <div className="h-32 bg-white/5 rounded-2xl" />
          <div className="h-8 bg-white/5 rounded w-64" />
          <div className="h-4 bg-white/5 rounded w-96" />
          <div className="grid grid-cols-3 gap-4 max-w-xl border-y border-white/10 py-4">
            <div className="h-16 bg-white/5 rounded" />
            <div className="h-16 bg-white/5 rounded" />
            <div className="h-16 bg-white/5 rounded" />
          </div>
          <div className="h-12 bg-white/5 rounded w-48" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-[9/16] bg-white/5 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!creator) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center px-4">
          <svg className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-on-surface-variant/60 text-sm">Creator not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <CreatorProfileHeader 
        creator={creator} 
        stats={stats} 
        fanStatus={fanStatus} 
        isLive={isLive} 
      />

      {/* Tabs */}
      <nav className="sticky top-0 z-40 bg-surface/95 backdrop-blur-md border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'text-primary-container border-b-2 border-primary-container'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Tab Panels */}
      <div className="max-w-5xl mx-auto">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'videos' && <VideosTab />}
        {activeTab === 'liked' && <LikedTab />}
        {activeTab === 'store' && <StoreTab />}
      </div>
    </div>
  )
}