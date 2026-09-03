import { useEffect, useState } from 'react'
import { getToken, adminPromoCodes, adminCreatePromo, adminBanners, adminCreateBanner } from '../lib/auth'
import { getHollywood, getNollywood } from '../lib/api'
import ContentRow from '../components/features/ContentRow'
import PageHeader from '../components/admin/PageHeader'
import StatCard from '../components/admin/StatCard'
import StatusBadge from '../components/admin/StatusBadge'
import Icon from '../components/ui/Icon'

export default function AdminMarketing() {
  const [token] = useState(() => getToken() ?? '')
  const [promos, setPromos] = useState<any[]>([])
  const [banners, setBanners] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showPromo, setShowPromo] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [promoForm, setPromoForm] = useState<any>({ code: '', discount: 0, maxUses: 0, plan: 'premium', expiresAt: '' })
  const [bannerForm, setBannerForm] = useState<any>({ title: '', image_url: '', link: '/', active: true })
  const [msg, setMsg] = useState('')
  const [hollywood, setHollywood] = useState<any[]>([])
  const [nollywood, setNollywood] = useState<any[]>([])

  const load = () => {
    Promise.all([adminPromoCodes(token), adminBanners(token)]).then(([p, b]) => {
      if (p.success) setPromos(p.codes || [])
      if (b.success) setBanners(b.banners || [])
      setLoading(false)
    })
    getHollywood().then(r=>{ if(r.success) setHollywood(r.data.slice(0,20))}).catch(()=>{})
    getNollywood().then(r=>{ if(r.success) setNollywood(r.data.slice(0,20))}).catch(()=>{})
  }
  useEffect(load, [])

  const createPromo = async () => {
    const r = await adminCreatePromo(token!, {
      code: promoForm.code.toUpperCase(),
      discountPct: Number(promoForm.discount),
      maxUses: Number(promoForm.maxUses),
      plan: promoForm.plan,
      expiresAt: promoForm.expiresAt || null,
    })
    setMsg(r.success ? 'Promo created ✓' : r.error)
    if (r.success) { setShowPromo(false); setPromoForm({ code: '', discount: 0, maxUses: 0, plan: 'premium', expiresAt: '' }); load() }
  }

  const createBanner = async () => {
    const r = await adminCreateBanner(token!, { ...bannerForm, active: true })
    setMsg(r.success ? 'Banner created ✓' : r.error)
    if (r.success) { setShowBanner(false); setBannerForm({ title: '', image_url: '', link: '/', active: true }); load() }
  }

  if (loading) return <div className="text-on-surface-variant text-sm">Loading marketing tools…</div>

  return (
    <div>
      <PageHeader icon="campaign" title="Promo & Banners" subtitle="Create promo codes and manage home banners" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-gutter mb-6">
        <StatCard label="Promo Codes" value={promos.length} icon="confirmation_number" />
        <StatCard label="Active Banners" value={banners.filter((b) => b.active).length} icon="image" />
      </div>

      <div className="flex gap-3 mb-6">
        <button onClick={() => setShowPromo(true)} className="btn-primary flex items-center gap-2"><Icon name="add" size="sm" /> New promo</button>
        <button onClick={() => setShowBanner(true)} className="btn-outline flex items-center gap-2"><Icon name="add" size="sm" /> New banner</button>
      </div>

      {msg && <p className="text-sm text-primary mb-4">{msg}</p>}

      <div className="grid lg:grid-cols-2 gap-gutter">
        <div className="bg-surface-container-high border border-white/5 rounded-xl overflow-hidden">
          <h3 className="font-label-md text-label-md text-on-surface px-5 py-4 border-b border-white/5">Promo codes</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-on-surface-variant/60 border-b border-white/5">
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Discount</th>
                <th className="px-4 py-2">Uses</th>
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2">Expires</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-on-surface font-mono font-semibold">{p.code}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{p.discount}%</td>
                  <td className="px-4 py-3 text-on-surface-variant">{p.uses} / {p.maxUses}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.plan} /></td>
                  <td className="px-4 py-3 text-on-surface-variant">{p.expires_at ? new Date(p.expires_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {promos.length === 0 && <p className="p-5 text-center text-on-surface-variant text-sm">No promo codes yet.</p>}
        </div>

        <div className="bg-surface-container-high border border-white/5 rounded-xl overflow-hidden">
          <h3 className="font-label-md text-label-md text-on-surface px-5 py-4 border-b border-white/5">Banners</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-on-surface-variant/60 border-b border-white/5">
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Link</th>
              </tr>
            </thead>
            <tbody>
              {banners.map((b) => (
                <tr key={b.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-on-surface">{b.title}</td>
                  <td className="px-4 py-3"><StatusBadge status={b.active ? 'active' : 'hidden'} /></td>
                  <td className="px-4 py-3 text-on-surface-variant">{b.link || '/'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {banners.length === 0 && <p className="p-5 text-center text-on-surface-variant text-sm">No banners yet.</p>}
        </div>
      </div>

      {(hollywood.length > 0 || nollywood.length > 0) && (
        <div className="mt-8 space-y-8 bg-surface-container-high border border-white/5 rounded-xl p-5">
          <h3 className="font-label-md text-label-md text-on-surface flex items-center gap-2">
            <Icon name="play_circle" className="text-primary-container" /> Hollywood & Nollywood Preview — Hover to Preview (Desktop)
          </h3>
          {hollywood.length > 0 && <ContentRow title="Hollywood" items={hollywood} link="/discover?origin=US" />}
          {nollywood.length > 0 && <ContentRow title="Nollywood" items={nollywood} link="/discover?origin=NG" />}
        </div>
      )}

      {showPromo && (
        <Modal title="Create promo code" onClose={() => setShowPromo(false)}>
          {[['code', 'Code'], ['discount', 'Discount %']].map(([k, label]) => (
            <label key={k} className="block text-sm"><span className="text-on-surface-variant">{label}</span>
              <input value={promoForm[k]} onChange={(e) => setPromoForm({ ...promoForm, [k]: e.target.value })} className="input mt-1 w-full" />
            </label>
          ))}
          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm"><span className="text-on-surface-variant">Max uses</span>
              <input type="number" value={promoForm.maxUses} onChange={(e) => setPromoForm({ ...promoForm, maxUses: e.target.value })} className="input mt-1 w-full" />
            </label>
            <label className="text-sm"><span className="text-on-surface-variant">Plan</span>
              <select value={promoForm.plan} onChange={(e) => setPromoForm({ ...promoForm, plan: e.target.value })} className="input mt-1 w-full">
                <option value="premium">Premium</option>
                <option value="pro">Pro</option>
                <option value="studio">Studio</option>
              </select>
            </label>
          </div>
          <label className="text-sm block"><span className="text-on-surface-variant">Expires</span>
            <input type="date" value={promoForm.expiresAt} onChange={(e) => setPromoForm({ ...promoForm, expiresAt: e.target.value })} className="input mt-1 w-full" />
          </label>
          <button onClick={createPromo} className="btn-primary w-full mt-2">Create</button>
        </Modal>
      )}

      {showBanner && (
        <Modal title="Create banner" onClose={() => setShowBanner(false)}>
          {[['title', 'Title'], ['image_url', 'Image URL'], ['link', 'Link']].map(([k, label]) => (
            <label key={k} className="block text-sm"><span className="text-on-surface-variant">{label}</span>
              <input value={bannerForm[k]} onChange={(e) => setBannerForm({ ...bannerForm, [k]: e.target.value })} className="input mt-1 w-full" />
            </label>
          ))}
          <button onClick={createBanner} className="btn-primary w-full mt-2">Create</button>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-container-high rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-on-surface-variant"><Icon name="close" size="sm" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}