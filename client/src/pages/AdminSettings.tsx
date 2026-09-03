import { useEffect, useState } from 'react'
import { getToken, adminAuditLog, adminPromotionsSettings, adminSavePromotionsSettings } from '../lib/auth'
import PageHeader from '../components/admin/PageHeader'
import StatusBadge from '../components/admin/StatusBadge'
import StatCard from '../components/admin/StatCard'
import { useAdminEvent, AdminEvents } from '../hooks/useAdminEvents'
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

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState<'audit' | 'currency' | 'promotions'>('audit')
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  // Real-time updates for audit log
  useAdminEvent('admin:audit.action', (data) => {
    console.log('[AdminSettings] New audit action:', data)
    setLogs((prev) => [data, ...prev])
  })

  useEffect(() => {
    const token = getToken()
    if (!token) return
    adminAuditLog(token).then((r) => { if (r.success) setLogs(r.activity || []); setLoading(false) })
  }, [])

  useEffect(() => {
    if (activeTab === 'currency' || activeTab === 'promotions') {
      const token = getToken()
      if (token) {
        adminPromotionsSettings(token).then((r) => { if (r.success) setSettings(r.settings || {}) })
      }
    }
  }, [activeTab])

  const saveSetting = async (key: string, value: any) => {
    const token = getToken()
    if (!token) return
    setSaving(true)
    const res = await adminSavePromotionsSettings(token, key, value)
    setSaving(false)
    if (res.success) {
      toast.success('Saved')
      setSettings((prev: any) => ({ ...prev, [key]: value }))
    } else {
      toast.error(res.error || 'Failed to save')
    }
  }

  if (loading && activeTab === 'audit') return <div className="text-on-surface-variant text-sm">Loading audit log…</div>

  return (
    <div>
      <PageHeader icon="settings" title="Settings & Audit" subtitle="Platform settings, audit trail, and configuration" />
      
      <div className="flex gap-3 mb-6 border-b border-white/5">
        <button onClick={() => setActiveTab('audit')} className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${activeTab === 'audit' ? 'bg-primary-container/20 text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>
          Audit Log
        </button>
        <button onClick={() => setActiveTab('currency')} className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${activeTab === 'currency' ? 'bg-primary-container/20 text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>
          Currency
        </button>
        <button onClick={() => setActiveTab('promotions')} className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${activeTab === 'promotions' ? 'bg-primary-container/20 text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>
          Promotion Settings
        </button>
      </div>

      {activeTab === 'audit' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-gutter mb-6">
            <StatCard label="Log Entries" value={logs.length} icon="history" />
          </div>

          <div className="bg-surface-container-high border border-white/5 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-on-surface-variant/60 border-b border-white/5">
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Entity</th>
                    <th className="px-4 py-3">Meta</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 text-on-surface font-mono text-xs">{l.action}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{l.actor_name || 'admin'}</td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        <span className="capitalize">{l.entity}</span> {l.entity_id ? `#${String(l.entity_id).slice(0, 8)}` : ''}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant max-w-xs truncate">{JSON.stringify(l.meta) || '—'}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{new Date(l.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs.length === 0 && <p className="p-5 text-center text-on-surface-variant text-sm">No recorded admin activity yet.</p>}
            </div>
          </div>
        </>
      )}

      {activeTab === 'currency' && (
        <div className="max-w-md space-y-6">
          <div className="bg-surface-container-high border border-white/5 rounded-xl p-6">
            <h3 className="font-label-md text-label-md text-on-surface mb-4">Default Currency</h3>
            <p className="text-sm text-on-surface-variant mb-4">Set the default display currency for all pricing across the platform. Amounts remain in NGN; only the symbol/label changes.</p>
            <select
              value={settings.default_currency || 'NGN'}
              onChange={(e) => saveSetting('default_currency', e.target.value)}
              disabled={saving}
              className="input w-full max-w-xs"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {activeTab === 'promotions' && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-surface-container-high border border-white/5 rounded-xl p-6">
            <h3 className="font-label-md text-label-md text-on-surface mb-4">Promotion Visibility</h3>
            <p className="text-sm text-on-surface-variant mb-4">Configure default promotion visibility and targeting options.</p>
            <label className="flex items-center gap-3 mb-3">
              <input type="checkbox" checked={settings.promo_enabled !== false} onChange={(e) => saveSetting('promo_enabled', e.target.checked)} disabled={saving} className="w-4 h-4 accent-primary" />
              <span className="text-on-surface">Enable promotions globally</span>
            </label>
            <label className="flex items-center gap-3 mb-3">
              <input type="checkbox" checked={settings.ip_targeting_enabled} onChange={(e) => saveSetting('ip_targeting_enabled', e.target.checked)} disabled={saving} className="w-4 h-4 accent-primary" />
              <span className="text-on-surface">Enable IP-based targeting</span>
            </label>
            <label className="flex items-center gap-3 mb-3">
              <input type="checkbox" checked={settings.phone_targeting_enabled} onChange={(e) => saveSetting('phone_targeting_enabled', e.target.checked)} disabled={saving} className="w-4 h-4 accent-primary" />
              <span className="text-on-surface">Enable phone-based targeting</span>
            </label>
            <label className="flex items-center gap-3 mb-3">
              <input type="checkbox" checked={settings.show_promo_banner} onChange={(e) => saveSetting('show_promo_banner', e.target.checked)} disabled={saving} className="w-4 h-4 accent-primary" />
              <span className="text-on-surface">Show promo banner on homepage</span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}