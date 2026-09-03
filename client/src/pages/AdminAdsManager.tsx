import { useEffect, useState } from 'react'
import { getToken } from '../lib/auth'
import PageHeader from '../components/admin/PageHeader'
import Icon from '../components/ui/Icon'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { API_BASE } from '../lib/config'

type Tab = 'pending'|'approved'|'suspended'|'rejected'|'internal'|'pricing'

export default function AdminAdsManager() {
  const [tab, setTab] = useState<Tab>('pending')
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [reason, setReason] = useState('')
  const [target, setTarget] = useState<any>(null)
  const [action, setAction] = useState<'reject'|'suspend'|null>(null)
  const [pricing, setPricing] = useState<any[]>([])
  const [showInternal, setShowInternal] = useState(false)
  const [internalForm, setInternalForm] = useState({ advertiser_name:'', creative_url:'', position_type:'mid_roll', cue_time_seconds:900, duration_seconds:15, content_id:'' })

  const load = async () => {
    const token = getToken(); if (!token) return
    const statusMap: Record<string,string> = { pending:'pending', approved:'approved', suspended:'suspended', rejected:'rejected' }
    const url = tab==='internal' ? `${API_BASE}/campaigns?channel=internal` :
                tab==='pricing' ? '' :
                `${API_BASE}/campaigns?channel=creator&status=${statusMap[tab]||tab}`
    if (tab==='pricing') {
      const r = await fetch(`${API_BASE}/ads/pricing`, { headers:{ Authorization:`Bearer ${token}` }}).then(x=>x.json())
      if (r.success) setPricing(r.pricing||[])
      setLoading(false); return
    }
    setLoading(true)
    const r = await fetch(url, { headers:{ Authorization:`Bearer ${token}`}}).then(x=>x.json())
    if (r.success) setCampaigns(r.campaigns||[])
    setLoading(false)
  }
  useEffect(()=>{ load() }, [tab])

  const doAction = async (c:any, newStatus:string) => {
    const token = getToken()
    const body:any = { status: newStatus }
    if (newStatus==='rejected' || newStatus==='suspended') body.rejection_reason = reason
    const r = await fetch(`${API_BASE}/campaigns/${c.id}`, { method:'PATCH', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body: JSON.stringify(body)}).then(x=>x.json())
    if (r.success) { setTarget(null); setReason(''); load() } else alert(r.error)
  }

  const createInternal = async () => {
    const token = getToken()
    const r = await fetch(`${API_BASE}/campaigns`, { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body: JSON.stringify({
      channel:'internal', advertiser_name: internalForm.advertiser_name, creative_url: internalForm.creative_url, creative_type:'image',
      promotion_type:'grid', target_media_id: internalForm.content_id||null,
      position_type: internalForm.position_type, cue_time_seconds: Number(internalForm.cue_time_seconds), duration_seconds: Number(internalForm.duration_seconds),
      max_impressions: 10000, budget: 0,
    })}).then(x=>x.json())
    if (r.success) { setShowInternal(false); setInternalForm({ advertiser_name:'', creative_url:'', position_type:'mid_roll', cue_time_seconds:900, duration_seconds:15, content_id:'' }); load() }
  }

  const updatePrice = async (pos:string, price:number) => {
    const token = getToken()
    await fetch(`${API_BASE}/ads/pricing`, { method:'PUT', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body: JSON.stringify({ position_type: pos, price_per_mille: price })}).then(x=>x.json())
    load()
  }

  const tabs: Array<{id:Tab,label:string}> = [
    {id:'pending',label:'Pending'},
    {id:'approved',label:'Active'},
    {id:'suspended',label:'Suspended'},
    {id:'rejected',label:'Rejected'},
    {id:'internal',label:'Internal'},
    {id:'pricing',label:'Pricing'},
  ]

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-6xl mx-auto">
        <PageHeader icon="campaign" title="Ads Manager" subtitle="3 channels: Creator → Internal → Google (fallback). Exhausted creator = no ads." />
        <div className="flex gap-2 overflow-x-auto mb-6">
          {tabs.map(t=> (
            <button key={t.id} onClick={()=>setTab(t.id)} className={`px-4 py-2 rounded-xl text-sm whitespace-nowrap ${tab===t.id?'bg-primary-container text-on-primary-container':'bg-surface-container-high text-on-surface-variant'}`}>{t.label}</button>
          ))}
          <Button onClick={()=>setShowInternal(true)} className="ml-auto"><Icon name="add" size="sm"/> New Internal Ad</Button>
        </div>

        {tab==='pricing' ? (
          <div className="bg-surface-container-high border border-white/5 rounded-xl p-6 space-y-4">
            <h3 className="font-medium">Price per 1k impressions (NGN)</h3>
            {pricing.map(p=> (
              <div key={p.position_type} className="flex items-center gap-3">
                <span className="w-24 text-sm capitalize">{p.position_type}</span>
                <input type="number" defaultValue={p.price_per_mille} onBlur={e=>updatePrice(p.position_type, Number(e.target.value))} className="w-32 bg-surface-variant/20 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                <span className="text-xs text-on-surface-variant">min {p.min_impressions} / cap {p.max_impressions_cap}</span>
              </div>
            ))}
          </div>
        ) : loading ? <div className="text-sm text-on-surface-variant">Loading…</div> : campaigns.length===0 ? <div className="text-center py-16 text-sm text-on-surface-variant">No {tab} campaigns</div> : (
          <div className="space-y-3">
            {campaigns.map(c=> (
              <div key={c.id} className="bg-surface-container-high border border-white/5 rounded-xl p-4 flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  {c.creative_url && <img src={c.creative_url} alt="" className="w-16 h-16 rounded-lg object-cover bg-white/5" />}
                  <div>
                    <p className="text-sm font-medium">{c.advertiser_name} <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 ml-2">{c.channel||c.promotion_type}</span> {c.paid===false && <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 ml-1">Awaiting payment</span>}</p>
                    <p className="text-xs text-on-surface-variant">{c.target_media_id ? `Content: ${c.target_media_id}` : 'Global'} · {c.budget? `₦${c.budget}`:''} · {c.current_impressions}/{c.max_impressions||'∞'}</p>
                    {c.rejection_reason && <p className="text-xs text-red-300 mt-1">Reason: {c.rejection_reason}</p>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {tab==='pending' && <>
                    <Button size="sm" onClick={()=>doAction(c,'approved')} disabled={c.paid===false}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={()=>{ setTarget(c); setAction('reject')}}>Reject</Button>
                  </>}
                  {tab==='approved' && <Button size="sm" variant="ghost" onClick={()=>{ setTarget(c); setAction('suspend')}}>Suspend</Button>}
                  {(tab==='suspended'||tab==='rejected') && <Button size="sm" onClick={()=>doAction(c,'approved')}>Re-approve</Button>}
                </div>
              </div>
            ))}
          </div>
        )}

        <Modal isOpen={!!target} onClose={()=>setTarget(null)} title={action==='reject'?'Reject promotion':'Suspend promotion'}>
          <p className="text-sm text-on-surface-variant mb-3">Provide a reason (shown to creator as warning screen)</p>
          <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="Reason..." className="w-full bg-surface-variant/20 border border-white/10 rounded-xl p-3 text-sm" />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={()=>setTarget(null)}>Cancel</Button>
            <Button onClick={()=>doAction(target, action==='reject'?'rejected':'suspended')} disabled={!reason.trim()}>{action==='reject'?'Reject':'Suspend'}</Button>
          </div>
        </Modal>

        <Modal isOpen={showInternal} onClose={()=>setShowInternal(false)} title="New Internal Ad">
          <div className="space-y-3">
            <Input value={internalForm.advertiser_name} onChange={e=>setInternalForm(f=>({...f, advertiser_name:e.target.value}))} placeholder="Advertiser name" />
            <Input value={internalForm.creative_url} onChange={e=>setInternalForm(f=>({...f, creative_url:e.target.value}))} placeholder="Creative URL (image/video)" />
            <Input value={internalForm.content_id} onChange={e=>setInternalForm(f=>({...f, content_id:e.target.value}))} placeholder="Target content ID (optional, blank = global)" />
            <select value={internalForm.position_type} onChange={e=>setInternalForm(f=>({...f, position_type:e.target.value}))} className="w-full bg-surface-variant/20 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
              <option value="pre_roll">Pre-roll</option><option value="mid_roll">Mid-roll</option><option value="post_roll">Post-roll</option><option value="pause">Pause</option><option value="banner">Banner</option>
            </select>
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" value={String(internalForm.cue_time_seconds)} onChange={e=>setInternalForm(f=>({...f, cue_time_seconds:Number(e.target.value)}))} placeholder="Cue seconds" />
              <Input type="number" value={String(internalForm.duration_seconds)} onChange={e=>setInternalForm(f=>({...f, duration_seconds:Number(e.target.value)}))} placeholder="Duration" />
            </div>
            <Button onClick={createInternal} className="w-full">Create Internal Ad</Button>
          </div>
        </Modal>
      </div>
    </div>
  )
}
