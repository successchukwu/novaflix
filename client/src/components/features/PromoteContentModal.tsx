import { useEffect, useState } from 'react'
import Icon from '../ui/Icon'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Modal from '../ui/Modal'
import { getToken } from '../../lib/auth'

interface Props {
  open: boolean
  onClose: () => void
  content: any | null
  onCreated?: () => void
}

const POSITIONS: Array<{ id: string; label: string; desc: string }> = [
  { id: 'pre_roll', label: 'Pre-roll', desc: 'Before play' },
  { id: 'mid_roll', label: 'Mid-roll', desc: 'During playback' },
  { id: 'post_roll', label: 'Post-roll', desc: 'After credits' },
]

export default function PromoteContentModal({ open, onClose, content, onCreated }: Props) {
  const [step, setStep] = useState(1)
  const [position, setPosition] = useState('mid_roll')
  const [cueMinutes, setCueMinutes] = useState(15)
  const [duration, setDuration] = useState(15)
  const [impressions, setImpressions] = useState(5000)
  const [payMethod, setPayMethod] = useState<'wallet'|'card'|'split'>('wallet')
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [walletPart, setWalletPart] = useState(0)
  const [pricing, setPricing] = useState<Record<string, number>>({ pre_roll: 800, mid_roll: 600, post_roll: 400 })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pricePerMille = pricing[position] ?? 600
  const budget = Math.round((impressions / 1000) * pricePerMille)
  const cardPart = Math.max(0, budget - walletPart)

  useEffect(() => {
    if (!open) { setStep(1); setError(null); return }
    setPosition('mid_roll'); setCueMinutes(15); setDuration(15); setImpressions(5000)
    setPayMethod('wallet'); setWalletPart(0)
    const token = getToken()
    if (!token) return
    fetch(`/api/creator/wallet`, { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.json()).then(r=>{
      if (r.success) setWalletBalance(Number(r.balance ?? r.available ?? 0))
    }).catch(()=>{})
    fetch(`/api/admin/ads/pricing`, { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.json()).then(r=>{
      if (r.success && r.pricing) {
        const m: Record<string,number> = {}
        r.pricing.forEach((p:any)=> m[p.position_type]=Number(p.price_per_mille))
        setPricing(m)
      }
    }).catch(()=>{})
  }, [open])

  useEffect(() => {
    if (walletBalance !== null) setWalletPart(Math.min(walletBalance, budget))
  }, [budget, walletBalance])

  const recommended: 'wallet'|'card'|'split' =
    walletBalance !== null && walletBalance >= budget ? 'wallet' :
    walletBalance !== null && walletBalance > 0 ? 'split' : 'card'

  const canNext1 = !!position
  const canNext2 = impressions >= 500 && impressions <= 50000
  const canPay = payMethod==='wallet' ? (walletBalance!==null && walletBalance>=budget) :
                 payMethod==='card' ? budget>=100 :
                 walletPart>=0 && walletPart<= (walletBalance??0) && cardPart>=100 && walletPart+cardPart===budget

  const handlePromote = async () => {
    const token = getToken()
    if (!token || !content) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          channel: 'creator',
          promotion_type: 'creator_boost',
          advertiser_name: content.title || 'Creator Boost',
          creative_url: content.thumbnail_url || content.poster || '',
          creative_type: 'image',
          target_media_id: content.id,
          position_type: position,
          cue_time_seconds: position==='mid_roll' ? cueMinutes*60 : 0,
          duration_seconds: duration,
          max_impressions: impressions,
          budget,
          payMethod, walletPart, cardPart,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create promotion')
      if (data.requiresPayment && data.paymentUrl) {
        window.location.href = data.paymentUrl
        return
      }
      onCreated?.()
      onClose()
    } catch (e:any) { setError(e.message) } finally { setSubmitting(false) }
  }

  if (!content) return null

  return (
    <Modal isOpen={open} onClose={onClose} title={`Promote "${content.title || 'Untitled'}"`}>
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          {[1,2,3].map(n=> (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step>=n?'bg-primary-container text-on-primary-container':'bg-white/10 text-on-surface-variant'}`}>{n}</div>
              {n<3 && <div className={`flex-1 h-0.5 ${step>n?'bg-primary-container':'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        {step===1 && (
          <div className="space-y-4">
            <p className="text-sm font-medium">Placement</p>
            <div className="grid grid-cols-3 gap-2">
              {POSITIONS.map(p=> (
                <button key={p.id} onClick={()=>setPosition(p.id)} className={`p-3 rounded-xl border text-left ${position===p.id?'bg-primary-container/20 border-primary-container':'bg-white/5 border-white/10 hover:border-white/20'}`}>
                  <p className="text-sm font-medium">{p.label}</p><p className="text-[11px] text-on-surface-variant">{p.desc}</p>
                </button>
              ))}
            </div>
            {position==='mid_roll' && (
              <div>
                <label className="text-xs text-on-surface-variant">Cue time (minutes)</label>
                <input type="range" min={5} max={90} value={cueMinutes} onChange={e=>setCueMinutes(Number(e.target.value))} className="w-full accent-primary" />
                <p className="text-xs text-on-surface-variant">{cueMinutes} min</p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={()=>setDuration(15)} className={`flex-1 py-2 rounded-xl text-sm border ${duration===15?'bg-primary-container text-on-primary-container border-primary-container':'bg-white/5 border-white/10'}`}>15s</button>
              <button onClick={()=>setDuration(30)} className={`flex-1 py-2 rounded-xl text-sm border ${duration===30?'bg-primary-container text-on-primary-container border-primary-container':'bg-white/5 border-white/10'}`}>30s</button>
            </div>
            <div className="flex justify-end"><Button onClick={()=>setStep(2)} disabled={!canNext1}>Next</Button></div>
          </div>
        )}

        {step===2 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-on-surface-variant">Impressions (500 – 50,000)</label>
              <input type="range" min={500} max={50000} step={500} value={impressions} onChange={e=>setImpressions(Number(e.target.value))} className="w-full accent-primary" />
              <div className="flex justify-between text-xs"><span>{impressions.toLocaleString()}</span><span className="text-on-surface-variant">{pricePerMille} NGN / 1k</span></div>
            </div>
            <div className="bg-surface-container-high border border-white/5 rounded-xl p-4 flex justify-between">
              <span className="text-sm text-on-surface-variant">Budget</span><span className="text-lg font-bold">₦{budget.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-2"><Button variant="ghost" onClick={()=>setStep(1)}>Back</Button><Button onClick={()=>setStep(3)} disabled={!canNext2}>Next</Button></div>
          </div>
        )}

        {step===3 && (
          <div className="space-y-4">
            <div className="bg-surface-container-high border border-white/5 rounded-xl p-3 text-sm space-y-1">
              <p><span className="text-on-surface-variant">Content:</span> {content.title}</p>
              <p><span className="text-on-surface-variant">Placement:</span> {position} {position==='mid_roll' ? `@ ${cueMinutes}min` : ''} · {duration}s</p>
              <p><span className="text-on-surface-variant">Reach:</span> {impressions.toLocaleString()} impressions</p>
              <p className="font-bold">Total: ₦{budget.toLocaleString()}</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium">Pay with</p>
              {(['wallet','card','split'] as const).map(m=> (
                <label key={m} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${payMethod===m?'bg-primary-container/15 border-primary-container':'bg-white/5 border-white/10'}`}>
                  <input type="radio" checked={payMethod===m} onChange={()=>setPayMethod(m)} className="accent-primary" />
                  <span className="flex-1 text-sm capitalize">{m} {m==='wallet' && walletBalance!==null ? `— ₦${walletBalance.toLocaleString()} available` : ''}</span>
                  {recommended===m && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-bold">★ Recommended</span>}
                </label>
              ))}
              {payMethod==='split' && (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-on-surface-variant">Wallet part</label><Input type="number" value={String(walletPart)} onChange={e=>setWalletPart(Math.max(0, Math.min(Number(e.target.value)||0, walletBalance??0)))} /></div>
                  <div><label className="text-xs text-on-surface-variant">Card part</label><div className="px-3 py-3 text-sm bg-white/5 rounded-xl">₦{cardPart.toLocaleString()}</div></div>
                </div>
              )}
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={()=>setStep(2)}>Back</Button>
              <Button onClick={handlePromote} loading={submitting} disabled={!canPay}>Promote — ₦{budget.toLocaleString()}</Button>
            </div>
            <p className="text-[11px] text-on-surface-variant/60 text-center">You’ll be taken to the paywall. Admin approves after payment.</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
