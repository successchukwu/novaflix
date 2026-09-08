import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import Button from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import { useAuth } from '../lib/AuthContext'
import { API_BASE } from '../lib/config'
import { formatCurrency } from '../lib/currency'

interface ReferralStat {
  total: number
  converted: number
  total_commission: number
}

interface Referral {
  id: string
  code: string
  status: string
  commission: number
  created_at: string
  converted_at: string | null
}

export default function Referrals() {
  const { user } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [code, setCode] = useState('')
  const [url, setUrl] = useState('')
  const [stats, setStats] = useState<ReferralStat>({ total: 0, converted: 0, total_commission: 0 })
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('novaflix-token')
    if (!token) { setLoading(false); return }

    Promise.all([
      fetch(`${API_BASE}/affiliate/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
      fetch(`${API_BASE}/affiliate/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
    ]).then(([genRes, statsRes]) => {
      if (genRes.success) {
        setCode(genRes.code)
        setUrl(genRes.url)
      }
      if (statsRes.success) {
        setStats(statsRes.stats)
        setReferrals(statsRes.referrals || [])
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Referral link copied!')
    } catch {
      toast.error('Failed to copy')
    }
  }

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join NovaFlix', text: 'Watch amazing movies and shows on NovaFlix!', url })
      } catch {}
    } else {
      copyLink()
    }
  }

  const shareWhatsApp = () => {
    const text = encodeURIComponent(`Join NovaFlix and discover amazing movies! Sign up using my link: ${url}`)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  if (loading) {
    return (
      <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton variant="card" className="h-40" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton variant="card" className="h-24" />
            <Skeleton variant="card" className="h-24" />
            <Skeleton variant="card" className="h-24" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-secondary/10 mb-4">
            <Icon name="share" className="w-7 h-7 text-secondary" />
          </div>
          <h1 className="text-headline-md font-bold text-on-surface mb-2">Refer & Earn</h1>
          <p className="text-on-surface-variant text-sm">Invite friends to <img src="/leter-mark-logo.png" alt="" className="h-3 w-auto inline align-middle" /> and earn rewards</p>
        </div>

        {/* Referral Link Card */}
        <div className="bg-surface-container-high border border-white/5 rounded-xl p-6 mb-8">
          <label className="text-xs text-on-surface-variant mb-2 block">Your Referral Link</label>
          <div className="flex items-center gap-2 bg-surface-container rounded-lg px-4 py-3 border border-white/5 mb-4">
            <Icon name="link" className="text-primary-container shrink-0" />
            <span className="text-sm text-on-surface truncate font-mono">{url || 'Loading...'}</span>
          </div>
          <div className="flex gap-3">
            <Button onClick={copyLink} variant="secondary" className="flex-1">
              <Icon name="content_copy" /> Copy Link
            </Button>
            <Button onClick={shareLink} variant="secondary" className="flex-1">
              <Icon name="share" /> Share
            </Button>
            <button
              onClick={shareWhatsApp}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors text-sm font-semibold min-h-[44px]"
            >
              <Icon name="chat" /> WhatsApp
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Referrals', value: stats.total, icon: 'group' as const },
            { label: 'Converted', value: stats.converted, icon: 'check_circle' as const },
            { label: 'Commission', value: formatCurrency(stats.total_commission), icon: 'payments' as const },
          ].map((s) => (
            <div key={s.label} className="bg-surface-container-high border border-white/5 rounded-xl p-4 text-center">
              <Icon name={s.icon} className="text-primary-container mx-auto mb-2" />
              <p className="text-headline-md font-bold text-on-surface">{s.value}</p>
              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Referral History */}
        <div className="bg-surface-container-high border border-white/5 rounded-xl p-6">
          <h2 className="font-label-md text-label-md text-on-surface mb-4">Referral History</h2>
          {referrals.length === 0 ? (
            <div className="text-center py-8">
              <Icon name="group_add" className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="text-on-surface-variant/60 text-sm">No referrals yet. Share your link to get started!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {referrals.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-on-surface">{r.code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      r.status === 'converted' ? 'bg-secondary/20 text-secondary' :
                      r.status === 'paid' ? 'bg-primary-container/20 text-primary-container' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-on-surface-variant/60">{formatDate(r.created_at)}</p>
                    {r.commission > 0 && <p className="text-xs text-secondary">+{formatCurrency(r.commission)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Footer */}
        <p className="text-center text-on-surface-variant/40 text-xs mt-8">
          Terms apply. Commission is credited after the referred friend's first paid subscription.
        </p>
      </div>
    </div>
  )
}
