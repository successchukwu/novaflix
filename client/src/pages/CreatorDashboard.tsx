import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Icon from '../components/ui/Icon'
import { getToken, getCreatorDashboard, getCreatorComments, getPayoutHistory, requestWithdraw, createPayoutRecipient, getArtistGraph, getCreatorEarnings, getMyGlowGifts, updateCreatorUpload } from '../lib/auth'
import { getHollywood, getNollywood } from '../lib/api'
import ContentRow from '../components/features/ContentRow'
import Skeleton from '../components/ui/Skeleton'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { subscribeCreator } from '../lib/creatorLive'
import PromoteContentModal from '../components/features/PromoteContentModal'

const tabs = ['Overview', 'Content', 'Audience', 'Engagement', 'Payouts', 'Network', 'Analytics']

type DashboardData = {
  totalUploads: number
  totalViews: number
  totalMinutesWatched: number
  revenue: number
  tipRevenue: number
  totalLikes: number
  totalComments: number
  uploads: any[]
  recentComments: any[]
  recentTips: any[]
}

export default function CreatorDashboard() {
  const nav = useNavigate()
  const [activeTab, setActiveTab] = useState('Overview')
  const [data, setData] = useState<DashboardData | null>(null)
  const [comments, setComments] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])
  const [earnings, setEarnings] = useState<any>({ summary: null, items: [] })
  const [glowGifts, setGlowGifts] = useState<any>({ items: [], totals: null })
  const [graphData, setGraphData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [livePulse, setLivePulse] = useState<number>(0)
  const [hollywood, setHollywood] = useState<any[]>([])
  const [nollywood, setNollywood] = useState<any[]>([])

  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [payoutMsg, setPayoutMsg] = useState('')

  const [editingUpload, setEditingUpload] = useState<any>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editGenre, setEditGenre] = useState('')
  const [editPoster, setEditPoster] = useState<File | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [promoteContent, setPromoteContent] = useState<any>(null)
  const toast = useToast()

  const openEdit = (u: any) => {
    setEditingUpload(u)
    setEditTitle(u.title || '')
    setEditDesc(u.description || '')
    setEditGenre(u.genre || '')
    setEditPoster(null)
  }

  const saveEdit = async () => {
    const token = getToken()
    if (!token || !editingUpload) return
    setEditSaving(true)
    const res = await updateCreatorUpload(token, editingUpload.id, {
      title: editTitle,
      description: editDesc,
      genre: editGenre,
      posterFile: editPoster || undefined,
    })
    setEditSaving(false)
    if (res.success) {
      toast.success('Movie details updated')
      setEditingUpload(null)
      getCreatorDashboard(token).then((d) => { if (d.success) setData(d.dashboard) })
    } else {
      toast.error(res.error || 'Failed to update')
    }
  }

  useEffect(() => {
    loadAll()
    getHollywood().then(r => { if (r.success) setHollywood(r.data.slice(0, 20)) }).catch(()=>{})
    getNollywood().then(r => { if (r.success) setNollywood(r.data.slice(0, 20)) }).catch(()=>{})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAll = async () => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    Promise.all([
      getCreatorDashboard(token),
      getCreatorComments(token),
      getPayoutHistory(token),
      getArtistGraph(token),
      getCreatorEarnings(token),
      getMyGlowGifts(token),
    ]).then(([d, c, p, g, e, gifts]) => {
      if (d.success) setData(d.dashboard)
      if (c.success) setComments(c.comments)
      if (p.success) setPayouts(p.payouts)
      if (g.success) setGraphData(g.edges)
      if (e.success) setEarnings(e)
      if (gifts.success) setGlowGifts(gifts)
      setLoading(false)
    })
  }

  useEffect(() => {
    return subscribeCreator(['engagement', 'earnings', 'content', 'payout'], () => {
      setLivePulse(Date.now())
      loadAll()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreateRecipient = async () => {
    const token = getToken()
    if (!token) return
    const res = await createPayoutRecipient(token, { bankCode, accountNumber, accountName })
    if (res.success) setPayoutMsg('Recipient created! You can now withdraw.')
    else setPayoutMsg(res.error || 'Failed')
  }

  const handleWithdraw = async () => {
    const token = getToken()
    if (!token) return
    const res = await requestWithdraw(token, Number(withdrawAmount))
    if (res.success) setPayoutMsg('Withdrawal initiated!')
    else setPayoutMsg(res.error || 'Failed')
  }

  const statsCards = data ? [
    { icon: 'visibility' as const, label: 'Minutes Streamed', value: (data.totalMinutesWatched || 0).toLocaleString(), change: '+12%' },
    { icon: 'attach_money' as const, label: 'Revenue', value: `$${(data.revenue || 0).toLocaleString()}`, change: '+8%' },
    { icon: 'movie' as const, label: 'Uploads', value: String(data.totalUploads || 0), change: '+24%' },
    { icon: 'trending_up' as const, label: 'Total Views', value: (data.totalViews || 0).toLocaleString(), change: '+5%' },
    { icon: 'favorite' as const, label: 'Likes', value: (data.totalLikes || 0).toLocaleString(), change: '+15%' },
    { icon: 'chat' as const, label: 'Comments', value: (data.totalComments || 0).toLocaleString(), change: '+10%' },
  ] : []

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Overview':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-gutter">
              {statsCards.map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-surface-container-high border border-white/5 rounded-xl p-4"
                >
                  <Icon name={s.icon} className="text-primary-container mb-2" />
                  <p className="text-xl font-bold text-on-surface">{s.value}</p>
                  <p className="text-on-surface-variant/60 text-[10px] mt-0.5">{s.label}</p>
                  <span className="text-[10px] text-primary font-medium">{s.change}</span>
                </motion.div>
              ))}
            </div>

            {(hollywood.length > 0 || nollywood.length > 0) && (
              <div className="space-y-8 bg-surface-container-high border border-white/5 rounded-xl p-5">
                <h3 className="font-label-md text-label-md text-on-surface mb-3 flex items-center gap-2">
                  <Icon name="play_circle" className="text-primary-container" /> Featured — Hover to Preview (Desktop)
                </h3>
                {hollywood.length > 0 && <ContentRow title="Hollywood" items={hollywood} link="/discover?origin=US" />}
                {nollywood.length > 0 && <ContentRow title="Nollywood" items={nollywood} link="/discover?origin=NG" />}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-gutter">
              <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
                <h3 className="font-label-md text-label-md text-on-surface mb-3 flex items-center gap-2">
                  <Icon name="movie" className="text-primary-container" /> Recent Uploads
                </h3>
                {data && data.uploads && data.uploads.slice(0, 5).map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <p className="text-sm text-on-surface-variant truncate">{u.title}</p>
                    <span className="text-xs text-on-surface-variant/60">{u.views || 0} views</span>
                  </div>
                ))}
                {(!data?.uploads || data.uploads.length === 0) && (
                  <p className="text-xs text-on-surface-variant/60 text-center py-4">No uploads yet</p>
                )}
              </div>

              <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
                <h3 className="font-label-md text-label-md text-on-surface mb-3 flex items-center gap-2">
                  <Icon name="chat" className="text-primary-container" /> Recent Comments
                </h3>
                {data?.recentComments?.slice(0, 5).map((c: any) => (
                  <div key={c.id} className="py-2 border-b border-white/5 last:border-0">
                    <p className="text-xs text-on-surface-variant/60">{c.user_name}</p>
                    <p className="text-sm text-on-surface-variant truncate">{c.text}</p>
                  </div>
                ))}
                {(!data?.recentComments || data.recentComments.length === 0) && (
                  <p className="text-xs text-on-surface-variant/60 text-center py-4">No comments yet</p>
                )}
              </div>
            </div>
          </div>
        )

      case 'Content':
        return (
          <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
            <h3 className="font-label-md text-label-md text-on-surface mb-4 flex items-center gap-2">
              <Icon name="movie" className="text-primary-container" /> Your Uploads
            </h3>
            {data && data.uploads && data.uploads.length > 0 ? (
              <div className="space-y-2">
                {data.uploads.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="font-label-md text-label-md text-on-surface truncate">{u.title}</p>
                      <p className="text-on-surface-variant/60 text-xs">{u.views || 0} views · {Math.round((u.minutes_watched || 0) / 60)}h watched</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-on-surface-variant/60">
                      <button onClick={()=>setPromoteContent(u)} title="Promote" className="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20"><Icon name="campaign" size="sm" /></button>
                      <button onClick={() => openEdit(u)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                        <Icon name="edit" size="sm" /> Edit
                      </button>
                      <span>${parseFloat(u.revenue || 0).toFixed(2)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        u.status === 'published' ? 'bg-primary-container/10 text-primary-container' : 'bg-white/10 text-on-surface-variant'
                      }`}>{u.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Icon name="add" className="w-8 h-8 text-on-surface-variant/40 mx-auto mb-2" />
                <p className="text-sm text-on-surface-variant">No uploads yet. Upload your first video!</p>
              </div>
            )}
          </div>
        )

      case 'Audience':
        return (
          <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
            <h3 className="font-label-md text-label-md text-on-surface mb-4 flex items-center gap-2">
              <Icon name="language" className="text-primary-container" /> Top Locations
            </h3>
            {[
              { country: 'United States', viewers: 4520 },
              { country: 'United Kingdom', viewers: 2104 },
              { country: 'Germany', viewers: 1892 },
              { country: 'Canada', viewers: 1438 },
              { country: 'Brazil', viewers: 983 },
            ].map(loc => (
              <div key={loc.country} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <span className="text-sm text-on-surface-variant">{loc.country}</span>
                <span className="text-xs text-on-surface-variant/60">{loc.viewers.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )

      case 'Engagement':
        return (
          <div className="grid md:grid-cols-2 gap-gutter">
            <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
              <h3 className="font-label-md text-label-md text-on-surface mb-3 flex items-center gap-2">
                <Icon name="chat" className="text-primary-container" /> All Comments ({comments.length})
              </h3>
              {comments.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {comments.map(c => (
                    <div key={c.id} className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary-container/10 flex items-center justify-center shrink-0">
                        <Icon name="person" size="sm" className="text-primary-container" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-on-surface">{c.user_name}</p>
                        <p className="text-xs text-on-surface-variant">{c.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant/60 text-center py-6">No comments yet</p>
              )}
            </div>
            <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
              <h3 className="font-label-md text-label-md text-on-surface mb-3 flex items-center gap-2">
                <Icon name="favorite" className="text-primary-container" /> Likes
              </h3>
              <p className="text-3xl font-bold text-on-surface">{data?.totalLikes || 0}</p>
              <p className="text-xs text-on-surface-variant/60 mt-1">Total likes across all content</p>
            </div>
          </div>
        )

      case 'Payouts':
        const e = earnings.summary
        return (
          <div className="space-y-6">
            <div className="grid md:grid-cols-3 gap-gutter">
              <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
                <p className="text-xs text-on-surface-variant">Total Revenue</p>
                <p className="text-2xl font-bold text-on-surface">${(data?.revenue || 0).toLocaleString()}</p>
              </div>
              <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
                <p className="text-xs text-on-surface-variant">Tips Received</p>
                <p className="text-2xl font-bold text-on-surface">${(data?.tipRevenue || 0).toLocaleString()}</p>
              </div>
              <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
                <p className="text-xs text-on-surface-variant">Total Views</p>
                <p className="text-2xl font-bold text-on-surface">{(data?.totalViews || 0).toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
              <h3 className="font-label-md text-label-md text-on-surface mb-4 flex items-center gap-2">
                <Icon name="savings" className="text-primary-container" /> Dual-Pool VPM Earnings
              </h3>              <p className="text-xs text-on-surface-variant/60 mb-4 leading-relaxed">
                60% of subscription revenue is split between Movie (80%) and Shorts (20%) pools and paid per-minute-watched (VPM). 40% funds corporate operations.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-[11px] text-on-surface-variant">Movie Pool</p>
                  <p className="text-lg font-bold text-on-surface">${(e?.movie || 0).toLocaleString()}</p>
                </div>
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-[11px] text-on-surface-variant">Shorts Pool</p>
                  <p className="text-lg font-bold text-on-surface">${(e?.short || 0).toLocaleString()}</p>
                </div>
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-[11px] text-on-surface-variant">Minutes Earned</p>
                  <p className="text-lg font-bold text-on-surface">{Math.round(e?.minutes || 0).toLocaleString()}</p>
                </div>
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-[11px] text-on-surface-variant">Total VPM</p>
                  <p className="text-lg font-bold text-primary">${(e?.total || 0).toLocaleString()}</p>
                </div>
              </div>
              {Array.isArray(earnings.items) && earnings.items.length > 0 ? (
                <div className="space-y-2">
                  {earnings.items.map((row: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <span className="text-sm text-on-surface">{row.period} <span className="text-on-surface-variant/60">· {row.pool_type}</span></span>
                      <span className="text-xs text-on-surface-variant/70">{(parseFloat(row.minutes) || 0).toLocaleString()} min</span>
                      <span className="text-xs text-on-surface-variant/60">@ ${parseFloat(row.vpm).toFixed(3)}/min</span>
                      <span className="text-sm font-semibold text-primary">${parseFloat(row.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant/60 text-center py-4">No VPM earnings settled yet.</p>
              )}
            </div>

            <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
              <h3 className="font-label-md text-label-md text-on-surface mb-4 flex items-center gap-2">
                <Icon name="bolt" className="text-primary-container" /> Glow Gifts Received
              </h3>
              <p className="text-xs text-on-surface-variant/60 mb-4">Fans send Glow Tokens your way. A 20% gifting fee funds the platform; you receive the remaining 80%.</p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-[11px] text-on-surface-variant">Gross Gifts</p>
                  <p className="text-lg font-bold text-on-surface">${(glowGifts.totals?.gross || 0).toLocaleString()}</p>
                </div>
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-[11px] text-on-surface-variant">Gifting Fee (20%)</p>
                  <p className="text-lg font-bold text-on-surface-variant/70">${(glowGifts.totals?.fee || 0).toLocaleString()}</p>
                </div>
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-[11px] text-on-surface-variant">You Receive</p>
                  <p className="text-lg font-bold text-primary">${(glowGifts.totals?.net || 0).toLocaleString()}</p>
                </div>
              </div>
              {glowGifts.items && glowGifts.items.length > 0 ? (
                <div className="space-y-2">
                  {glowGifts.items.map((g: any) => (
                    <div key={g.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <span className="text-sm text-on-surface">{g.sender_name || 'Fan'}</span>
                      <span className="text-xs text-on-surface-variant/70 px-2 truncate">{g.note || ''}</span>
                      <span className="text-sm font-semibold text-primary">+${parseFloat(g.net_amount).toFixed(2)}</span>
                      <span className="text-xs text-on-surface-variant/60">{new Date(g.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant/60 text-center py-4">No Glow Gifts yet.</p>
              )}
            </div>

            <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
              <h3 className="font-label-md text-label-md text-on-surface mb-4 flex items-center gap-2">
                <Icon name="storefront" className="text-primary-container" /> Commerce Shelf
              </h3>
              <p className="text-xs text-on-surface-variant/60 mb-4">Sell merch on your shelf. A 15% marketplace fee funds the platform; you keep 85%.</p>
              <div className="grid grid-cols-4 gap-3 mb-2">
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-[11px] text-on-surface-variant">Orders</p>
                  <p className="text-lg font-bold text-on-surface">{earnings.merch?.orders || 0}</p>
                </div>
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-[11px] text-on-surface-variant">Gross Sales</p>
                  <p className="text-lg font-bold text-on-surface">${(earnings.merch?.gross || 0).toLocaleString()}</p>
                </div>
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-[11px] text-on-surface-variant">Marketplace Fee</p>
                  <p className="text-lg font-bold text-on-surface-variant/70">${(earnings.merch?.fee || 0).toLocaleString()}</p>
                </div>
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-[11px] text-on-surface-variant">You Receive</p>
                  <p className="text-lg font-bold text-primary">${(earnings.merch?.net || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
              <h3 className="font-label-md text-label-md text-on-surface mb-4">Setup Bank Account</h3>
              <div className="grid md:grid-cols-3 gap-3 mb-4">
                <input value={bankCode} onChange={e => setBankCode(e.target.value)} placeholder="Bank Code (e.g. 057)" className="bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary-container/50" />
                <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Account Number" className="bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary-container/50" />
                <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Account Name" className="bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary-container/50" />
              </div>
              <button onClick={handleCreateRecipient} className="px-4 py-2 bg-primary-container text-on-primary-container text-sm rounded-xl hover:brightness-110 transition-colors">
                Create Recipient
              </button>
            </div>

            <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
              <h3 className="font-label-md text-label-md text-on-surface mb-4">Request Withdrawal</h3>
              <div className="flex gap-3 max-w-sm">
                <input value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} type="number" placeholder="Amount ($)" className="flex-1 bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary-container/50" />
                <button onClick={handleWithdraw} className="px-4 py-2 bg-primary-container text-on-primary-container text-sm rounded-xl hover:brightness-110 transition-colors">
                  Withdraw
                </button>
              </div>
              {payoutMsg && <p className="text-xs text-primary mt-2">{payoutMsg}</p>}
            </div>

            <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
              <h3 className="font-label-md text-label-md text-on-surface mb-4 flex items-center gap-2">
                <Icon name="calendar_month" className="text-primary-container" /> Payout History
              </h3>
              {payouts.length > 0 ? (
                <div className="space-y-2">
                  {payouts.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <span className="text-sm text-on-surface-variant">${parseFloat(p.amount).toFixed(2)}</span>
                      <span className="text-xs text-on-surface-variant/60">{new Date(p.created_at).toLocaleDateString()}</span>
                      <span className={`text-xs ${p.status === 'completed' ? 'text-primary' : 'text-secondary'}`}>{p.status}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant/60 text-center py-4">No payouts yet</p>
              )}
            </div>
          </div>
        )

      case 'Network':
        return (
          <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
            <h3 className="font-label-md text-label-md text-on-surface mb-4 flex items-center gap-2">
              <Icon name="account_tree" className="text-primary-container" /> Collaboration Network
            </h3>
            {graphData.length > 0 ? (
              <div className="space-y-2">
                {graphData.map((e: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-on-surface-variant py-1">
                    <span>{e.artist1_name}</span>
                    <span className="text-on-surface-variant/40">—</span>
                    <span>{e.artist2_name}</span>
                    <span className="text-xs text-on-surface-variant/60">({e.weight} collab{e.weight > 1 ? 's' : ''})</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant/60 text-center py-8">No collaboration data yet. Run the artist seeding script to populate.</p>
            )}
          </div>
        )

      case 'Analytics':
        return (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-gutter">
              <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
                <h3 className="font-label-md text-label-md text-on-surface mb-3 flex items-center gap-2">
                  <Icon name="monitoring" className="text-primary-container" /> Views Over Time
                </h3>
                <p className="text-xs text-on-surface-variant/60">Analytics chart coming soon</p>
              </div>
              <div className="bg-surface-container-high border border-white/5 rounded-xl p-5">
                <h3 className="font-label-md text-label-md text-on-surface mb-3 flex items-center gap-2">
                  <Icon name="attach_money" className="text-primary-container" /> Revenue Breakdown
                </h3>
                <p className="text-xs text-on-surface-variant/60">Revenue charts coming soon</p>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Icon name="bar_chart" className="w-7 h-7 text-primary-container" />
            <div>
              <h1 className="text-headline-md font-bold">Creator Dashboard</h1>
              <p className="text-on-surface-variant/60 text-xs mt-0.5">Your films, audience, and revenue</p>
            </div>
          </div>
          <button onClick={() => nav('/creator/go-live')} className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl font-medium transition-colors ${livePulse ? 'bg-red-500/15 text-red-300' : 'bg-primary-container text-on-primary-container hover:opacity-90'}`}>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Go Live
          </button>
        </div>

        <nav className="flex gap-1 overflow-x-auto mb-4 pb-1">
          {[
            { path: '/creator/analytics', label: 'Analytics', icon: 'monitoring' },
            { path: '/creator/catalog', label: 'Catalog', icon: 'movie' },
            { path: '/creator/wallet', label: 'Wallet', icon: 'account_balance_wallet' },
            { path: '/creator/ppm', label: 'PPM', icon: 'tune' },
            { path: '/creator/onboarding', label: 'Onboarding', icon: 'rocket_launch' },
            { path: '/creator/go-live', label: 'Go Live', icon: 'podcasts' },
          ].map(n => (
            <button key={n.path} onClick={() => nav(n.path)} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl whitespace-nowrap text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors">
              <Icon name={n.icon as any} size="sm" /> {n.label}
            </button>
          ))}
        </nav>

        <div className="flex gap-1 overflow-x-auto mb-6 pb-1">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm rounded-xl whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'bg-primary-container text-on-primary-container'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-gutter">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-surface-container-high border border-white/5 rounded-xl p-4">
                <Skeleton variant="text" className="w-6 h-6 mb-2 rounded-lg" />
                <Skeleton variant="text" className="w-16 h-5 mb-1" />
                <Skeleton variant="text" className="w-20 h-2" />
              </div>
            ))}
          </div>
        ) : (
          renderTabContent()
        )}
      </div>

      <Modal isOpen={!!editingUpload} onClose={() => setEditingUpload(null)} title="Edit Movie Details">
        {editingUpload && (
          <div className="space-y-4">
            <div>
              <label className="text-on-surface-variant text-sm mb-1.5 block">Title</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Movie title" />
            </div>
            <div>
              <label className="text-on-surface-variant text-sm mb-1.5 block">Genre</label>
              <select
                value={editGenre}
                onChange={(e) => setEditGenre(e.target.value)}
                className="w-full bg-surface-variant/20 border border-outline/30 rounded-xl px-4 py-3 text-sm on-surface focus:outline-none focus:border-primary-container"
              >
                <option value="">Select genre</option>
                <option value="action">Action</option>
                <option value="comedy">Comedy</option>
                <option value="drama">Drama</option>
                <option value="horror">Horror</option>
                <option value="sci-fi">Sci-Fi</option>
                <option value="documentary">Documentary</option>
                <option value="animation">Animation</option>
              </select>
            </div>
            <div>
              <label className="text-on-surface-variant text-sm mb-1.5 block">Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={4}
                placeholder="Tell users about your movie..."
                className="w-full bg-surface-variant/20 border border-outline/30 rounded-xl px-4 py-3 text-sm on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary-container resize-none"
              />
            </div>
            <div>
              <label className="text-on-surface-variant text-sm mb-1.5 block">Poster</label>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer px-4 py-2.5 bg-surface-variant/20 border border-outline/30 rounded-xl text-sm on-surface hover:bg-surface-variant/40 transition-colors">
                  Choose Image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setEditPoster(e.target.files?.[0] || null)}
                  />
                </label>
                {editPoster && <span className="text-on-surface-variant text-sm">{editPoster.name}</span>}
              </div>
            </div>
            <Button onClick={saveEdit} size="lg" className="w-full" loading={editSaving}>
              Save Changes
            </Button>
          </div>
        )}
      </Modal>
      <PromoteContentModal open={!!promoteContent} onClose={()=>setPromoteContent(null)} content={promoteContent} onCreated={()=>{ setPromoteContent(null); toast.success('Promotion submitted — awaiting approval') }} />
    </div>
  )
}
