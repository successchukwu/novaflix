import { useEffect, useState } from 'react'
import Icon from '../components/ui/Icon'
import { useAuth } from '../lib/AuthContext'
import { useNavigate } from 'react-router-dom'
import { getFanLeaderboard, getFanStatus } from '../lib/auth'

export default function CreatorProfileHub() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [fans, setFans] = useState<any[]>([])
  const [ownStatus, setOwnStatus] = useState<any>(null)

  useEffect(() => {
    if (!user) return
    getFanLeaderboard(user.id, 10).then(r => r.success && setFans(r.fans))
    getFanStatus(user.id).then(r => r.success && setOwnStatus(r))
  }, [user])

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Icon name="person" className="text-primary-container" />
            <h1 className="text-headline-md font-bold">Creator Profile</h1>
          </div>
          {user && (
            <button
              onClick={() => navigate(`/creators/${user.id}`)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-label-md hover:brightness-110 transition-all"
            >
              <Icon name="open_in_new" className="w-4 h-4" /> View public profile
            </button>
          )}
        </div>

        {/* Identity card */}
        <div className="bg-surface-container-high border border-white/5 rounded-2xl p-6 mb-8 flex items-center gap-5">
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="w-20 h-20 rounded-2xl object-cover ring-2 ring-white/10" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-surface-container flex items-center justify-center">
              <Icon name="person" className="w-10 h-10 text-on-surface-variant/40" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-headline-sm font-bold text-on-surface truncate">{user?.name || 'Creator'}</h2>
            <p className="text-sm text-on-surface-variant mt-1">{user?.bio || 'Independent filmmaker & visual storyteller'}</p>
            <p className="text-xs text-primary mt-2 inline-flex items-center gap-1">
              <Icon name="group" className="w-3.5 h-3.5" /> {ownStatus?.rank ? `Rank #${ownStatus.rank} on your own leaderboard` : 'Your fans leaderboard lives on your public profile'}
            </p>
          </div>
        </div>

        {/* Public links */}
        <h2 className="font-label-md text-label-md text-on-surface uppercase tracking-widest mb-4">Manage & Promote</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter mb-8">
          {[
            { to: '/creator/analytics', icon: 'bar_chart', label: 'Analytics', desc: 'Views, likes and earnings' },
            { to: '/creator/catalog', icon: 'video_library', label: 'Content Catalog', desc: 'Manage your films' },
            { to: '/creator/memberships', icon: 'card_membership', label: 'Memberships', desc: 'Fan subscriptions' },
            { to: '/creator/campaigns', icon: 'campaign', label: 'Promotions', desc: 'Run campaigns' },
          ].map(item => (
            <button
              key={item.to}
              onClick={() => navigate(item.to)}
              className="bg-surface-container-high border border-white/5 rounded-xl p-5 text-left hover:border-primary/30 transition-colors"
            >
              <Icon name={item.icon} className="text-primary-container mb-3" />
              <p className="font-label-md text-label-md text-on-surface">{item.label}</p>
              <p className="text-sm text-on-surface-variant/70 mt-0.5">{item.desc}</p>
            </button>
          ))}
        </div>

        {/* Superfan leaderboard preview */}
        {fans.length > 0 && (
          <div>
            <h2 className="font-label-md text-label-md text-on-surface uppercase tracking-widest mb-4 flex items-center gap-2">
              <Icon name="leaderboard" className="text-primary-container" /> Top Fans
            </h2>
            <div className="bg-surface-container-high border border-white/5 rounded-2xl overflow-hidden">
              {fans.slice(0, 5).map((f, i) => (
                <div key={f.user_id} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                  <span className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-xs font-bold text-on-surface-variant shrink-0">{i + 1}</span>
                  {f.avatar ? <img src={f.avatar} alt="" className="w-8 h-8 rounded-full object-cover" /> : <Icon name="person" className="text-on-surface-variant/50" />}
                  <button onClick={() => navigate(`/creators/${f.user_id}`)} className="flex-1 text-left text-sm font-medium text-on-surface truncate hover:text-primary">
                    {f.name}
                  </button>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ backgroundColor: `${f.badge.color}22`, color: f.badge.color }}>
                    {f.badge.tier}
                  </span>
                  <span className="text-sm font-bold text-on-surface w-10 text-right">{f.points}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
