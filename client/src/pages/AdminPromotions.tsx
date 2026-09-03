import { useEffect, useState } from 'react'
import { getToken, adminPromoCodes, adminCreatePromo, adminUpdatePromo, adminDeletePromo, adminPromoStats, adminPromotionsSettings, adminSavePromotionsSettings } from '../lib/auth'
import PageHeader from '../components/admin/PageHeader'
import StatCard from '../components/admin/StatCard'
import StatusBadge from '../components/admin/StatusBadge'
import Icon from '../components/ui/Icon'
import Badge from '../components/ui/Badge'
import { formatCurrency, getCurrencySymbol } from '../lib/currency'
import { useToast } from '../components/ui/Toast'

const CURRENCY_OPTIONS = [
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'GHS', symbol: '₵', name: 'Ghanaian Cedi' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
]

export default function AdminPromotions() {
  const [token] = useState(() => getToken() ?? '')
  const [activeTab, setActiveTab] = useState<'discounts' | 'settings'>('discounts')
  const [promos, setPromos] = useState<any[]>([])
  const [stats, setStats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingPromo, setEditingPromo] = useState<any | null>(null)
  const [form, setForm] = useState<any>({
    code: '', plan: 'premium', discountType: 'pct', discountValue: 0, maxUses: 0,
    expiresAt: '', minAmount: 0, applyToAllPlans: false, allowedIps: '', allowedPhones: '',
    country: '', startsAt: '', usagePerUser: 0, mode: 'one_time', description: ''
  })
  const [settings, setSettings] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    const [promoRes, statsRes] = await Promise.all([
      adminPromoCodes(token),
      adminPromoStats(token)
    ])
    if (promoRes.success) setPromos(promoRes.codes || [])
    if (statsRes.success) setStats(statsRes.codes || [])
    setLoading(false)
  }

  const loadSettings = async () => {
    const res = await adminPromotionsSettings(token)
    if (res.success) setSettings(res.settings || {})
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (activeTab === 'settings') loadSettings() }, [activeTab])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg('')

    const payload = {
      ...form,
      discountValue: Number(form.discountValue),
      maxUses: Number(form.maxUses),
      minAmount: Number(form.minAmount),
      usagePerUser: Number(form.usagePerUser),
      allowedIps: form.allowedIps.split(',').map((s: string) => s.trim()).filter(Boolean),
      allowedPhones: form.allowedPhones.split(',').map((s: string) => s.trim()).filter(Boolean),
    }

    let res
    if (editingPromo) {
      res = await adminUpdatePromo(token, editingPromo.id, payload)
    } else {
      res = await adminCreatePromo(token, { ...payload, code: payload.code.toUpperCase() })
    }
    setSaving(false)
    if (res.success) {
      setMsg('Saved ✓')
      setShowCreate(false)
      setEditingPromo(null)
      setForm({ code: '', plan: 'premium', discountType: 'pct', discountValue: 0, maxUses: 0, expiresAt: '', minAmount: 0, applyToAllPlans: false, allowedIps: '', allowedPhones: '', country: '', startsAt: '', usagePerUser: 0, mode: 'one_time', description: '' })
      load()
    } else {
      setMsg(res.error || 'Failed to save')
    }
  }

  const handleEdit = (promo: any) => {
    setEditingPromo(promo)
    setForm({
      code: promo.code,
      plan: promo.plan,
      discountType: promo.discount_type,
      discountValue: promo.discount_value,
      maxUses: promo.max_uses,
      expiresAt: promo.expires_at ? new Date(promo.expires_at).toISOString().split('T')[0] : '',
      minAmount: promo.min_amount,
      applyToAllPlans: promo.apply_to_all_plans,
      allowedIps: promo.allowed_ips?.join(', ') || '',
      allowedPhones: promo.allowed_phones?.join(', ') || '',
      country: promo.country || '',
      startsAt: promo.starts_at ? new Date(promo.starts_at).toISOString().split('T')[0] : '',
      usagePerUser: promo.usage_per_user,
      mode: promo.mode,
      description: promo.description || '',
    })
    setShowCreate(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this promo code?')) return
    const res = await adminDeletePromo(token, id)
    if (res.success) {
      toast.success('Deleted')
      load()
    } else {
      toast.error(res.error || 'Failed to delete')
    }
  }

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/pricing?code=${code}`
    navigator.clipboard.writeText(url)
    toast.success('Promo link copied!')
  }

  const saveSettings = async (key: string, value: any) => {
    const res = await adminSavePromotionsSettings(token, key, value)
    if (res.success) {
      toast.success('Settings saved')
      loadSettings()
    } else {
      toast.error(res.error || 'Failed to save')
    }
  }

  if (loading) return <div className="text-on-surface-variant text-sm">Loading promotions…</div>

  return (
    <div>
      <PageHeader icon="local_offer" title="Discounts & Promotions" subtitle="Create and manage promo codes, discounts, and promotion settings" />

      <div className="flex gap-3 mb-6 border-b border-white/5">
        <button onClick={() => setActiveTab('discounts')} className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${activeTab === 'discounts' ? 'bg-primary-container/20 text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>
          Discounts & Promos
        </button>
        <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${activeTab === 'settings' ? 'bg-primary-container/20 text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>
          Promotion Settings
        </button>
      </div>

      {msg && <p className="text-sm text-primary mb-4">{msg}</p>}

      {activeTab === 'discounts' && (
        <>
          <div className="flex gap-3 mb-6">
            <button onClick={() => { setEditingPromo(null); setForm({ code: '', plan: 'premium', discountType: 'pct', discountValue: 0, maxUses: 0, expiresAt: '', minAmount: 0, applyToAllPlans: false, allowedIps: '', allowedPhones: '', country: '', startsAt: '', usagePerUser: 0, mode: 'one_time', description: '' }); setShowCreate(true) }} className="btn-primary flex items-center gap-2"><Icon name="add" size="sm" /> New Discount</button>
          </div>

          <div className="bg-surface-container-high border border-white/5 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-on-surface-variant/60 border-b border-white/5">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Type / Value</th>
                  <th className="px-4 py-2">Plan Scope</th>
                  <th className="px-4 py-2">Uses / Max</th>
                  <th className="px-4 py-2">Redemptions</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Expires</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {promos.map((p) => {
                  const stat = stats.find((s: any) => s.id === p.id)
                  const redemptions = stat?.redemptions || 0
                  return (
                    <tr key={p.id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 text-on-surface font-mono font-semibold">{p.code}</td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {p.discount_type === 'pct' ? `${p.discount_value}%` : formatCurrency(p.discount_value)}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={p.apply_to_all_plans ? 'all' : p.plan} /></td>
                      <td className="px-4 py-3 text-on-surface-variant">{p.uses} / {p.max_uses || '∞'}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{redemptions}</td>
                      <td className="px-4 py-3"><StatusBadge status={p.active ? 'active' : 'inactive'} /></td>
                      <td className="px-4 py-3 text-on-surface-variant">{p.expires_at ? new Date(p.expires_at).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => copyLink(p.code)} className="p-2 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface-variant" title="Copy promo link"><Icon name="content_copy" size="sm" /></button>
                          <button onClick={() => handleEdit(p)} className="p-2 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface-variant" title="Edit"><Icon name="edit" size="sm" /></button>
                          <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-red-400" title="Delete"><Icon name="delete" size="sm" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {promos.length === 0 && <p className="p-5 text-center text-on-surface-variant text-sm">No discounts yet.</p>}
          </div>
        </>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-2xl">
          <div className="bg-surface-container-high border border-white/5 rounded-xl p-6">
            <h3 className="font-label-md text-label-md text-on-surface mb-4">Default Currency</h3>
            <p className="text-sm text-on-surface-variant mb-4">Set the default display currency for all pricing across the platform. Amounts remain in NGN; only the symbol/label changes.</p>
            <select
              value={settings.default_currency || 'NGN'}
              onChange={(e) => saveSettings('default_currency', e.target.value)}
              className="input w-full max-w-xs"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>
              ))}
            </select>
          </div>

          <div className="bg-surface-container-high border border-white/5 rounded-xl p-6">
            <h3 className="font-label-md text-label-md text-on-surface mb-4">Promotion Visibility</h3>
            <p className="text-sm text-on-surface-variant mb-4">Configure default promotion visibility and targeting options.</p>
            <label className="flex items-center gap-3 mb-3">
              <input type="checkbox" checked={settings.promo_enabled !== false} onChange={(e) => saveSettings('promo_enabled', e.target.checked)} className="w-4 h-4 accent-primary" />
              <span className="text-on-surface">Enable promotions globally</span>
            </label>
            <label className="flex items-center gap-3 mb-3">
              <input type="checkbox" checked={settings.ip_targeting_enabled} onChange={(e) => saveSettings('ip_targeting_enabled', e.target.checked)} className="w-4 h-4 accent-primary" />
              <span className="text-on-surface">Enable IP-based targeting</span>
            </label>
            <label className="flex items-center gap-3 mb-3">
              <input type="checkbox" checked={settings.phone_targeting_enabled} onChange={(e) => saveSettings('phone_targeting_enabled', e.target.checked)} className="w-4 h-4 accent-primary" />
              <span className="text-on-surface">Enable phone-based targeting</span>
            </label>
            <label className="flex items-center gap-3 mb-3">
              <input type="checkbox" checked={settings.show_promo_banner} onChange={(e) => saveSettings('show_promo_banner', e.target.checked)} className="w-4 h-4 accent-primary" />
              <span className="text-on-surface">Show promo banner on homepage</span>
            </label>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setShowCreate(false); setEditingPromo(null); setForm({ code: '', plan: 'premium', discountType: 'pct', discountValue: 0, maxUses: 0, expiresAt: '', minAmount: 0, applyToAllPlans: false, allowedIps: '', allowedPhones: '', country: '', startsAt: '', usagePerUser: 0, mode: 'one_time', description: '' }) }}>
          <div className="bg-surface-container-high rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{editingPromo ? 'Edit Discount' : 'Create Discount'}</h3>
              <button onClick={() => { setShowCreate(false); setEditingPromo(null); }} className="text-on-surface-variant"><Icon name="close" size="sm" /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm"><span className="text-on-surface-variant block mb-1">Code *</span><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} className="input w-full" placeholder="SUMMER20" required /></label>
                <label className="text-sm"><span className="text-on-surface-variant block mb-1">Plan</span><select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })} className="input w-full"><option value="student">Student</option><option value="basic">Basic</option><option value="standard">Standard</option><option value="premium">Premium</option></select></label>
                <label className="text-sm"><span className="text-on-surface-variant block mb-1">Discount Type</span><select value={form.discountType} onChange={e => setForm({ ...form, discountType: e.target.value })} className="input w-full"><option value="pct">Percentage (%)</option><option value="fixed">Fixed Amount</option></select></label>
                <label className="text-sm"><span className="text-on-surface-variant block mb-1">Discount Value *</span><input type="number" step="0.01" min="0" value={form.discountValue} onChange={e => setForm({ ...form, discountValue: e.target.value })} className="input w-full" placeholder={form.discountType === 'pct' ? '20' : '500'} required /></label>
                <label className="text-sm"><span className="text-on-surface-variant block mb-1">Max Uses (0 = unlimited)</span><input type="number" min="0" value={form.maxUses} onChange={e => setForm({ ...form, maxUses: e.target.value })} className="input w-full" /></label>
                <label className="text-sm"><span className="text-on-surface-variant block mb-1">Min Amount</span><input type="number" min="0" value={form.minAmount} onChange={e => setForm({ ...form, minAmount: e.target.value })} className="input w-full" placeholder="0" /></label>
                <label className="text-sm"><span className="text-on-surface-variant block mb-1">Usage Per User (0 = unlimited)</span><input type="number" min="0" value={form.usagePerUser} onChange={e => setForm({ ...form, usagePerUser: e.target.value })} className="input w-full" /></label>
                <label className="text-sm"><span className="text-on-surface-variant block mb-1">Mode</span><select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })} className="input w-full"><option value="one_time">One-time</option><option value="recurring">Recurring</option></select></label>
                <label className="text-sm md:col-span-2"><span className="text-on-surface-variant block mb-1">Expires At</span><input type="date" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} className="input w-full" /></label>
                <label className="text-sm md:col-span-2"><span className="text-on-surface-variant block mb-1">Starts At</span><input type="date" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} className="input w-full" /></label>
                <label className="text-sm md:col-span-2"><span className="text-on-surface-variant block mb-1">Country Code (e.g., NG, US)</span><input value={form.country} onChange={e => setForm({ ...form, country: e.target.value.toUpperCase() })} className="input w-full" placeholder="NG" /></label>
                <label className="text-sm md:col-span-2"><span className="text-on-surface-variant block mb-1">Allowed IPs (comma-separated)</span><input value={form.allowedIps} onChange={e => setForm({ ...form, allowedIps: e.target.value })} className="input w-full" placeholder="192.168.1.1, 10.0.0.1" /></label>
                <label className="text-sm md:col-span-2"><span className="text-on-surface-variant block mb-1">Allowed Phones (comma-separated)</span><input value={form.allowedPhones} onChange={e => setForm({ ...form, allowedPhones: e.target.value })} className="input w-full" placeholder="+2348012345678, +2348098765432" /></label>
                <label className="text-sm md:col-span-2"><span className="text-on-surface-variant block mb-1">Description</span><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input w-full" rows={2} placeholder="Internal description" /></label>
                <label className="text-sm md:col-span-2 flex items-center gap-2"><input type="checkbox" checked={form.applyToAllPlans} onChange={e => setForm({ ...form, applyToAllPlans: e.target.checked })} className="w-4 h-4 accent-primary" /><span className="text-on-surface">Apply to all plans</span></label>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setShowCreate(false); setEditingPromo(null); }} className="btn-outline flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : (editingPromo ? 'Update' : 'Create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}