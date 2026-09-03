import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Icon from '../components/ui/Icon'
import { getToken, getMyTiers, createTier, updateTier, getMySubscribers } from '../lib/auth'
import { formatCurrency } from '../lib/currency'

export default function CreatorMembershipManager() {
  const [tiers, setTiers] = useState<any[]>([])
  const [subscribers, setSubscribers] = useState<any[]>([])
  const [stats, setStats] = useState<any>({})
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [benefits, setBenefits] = useState('')
  const [editId, setEditId] = useState<string | null>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    Promise.all([getMyTiers(token), getMySubscribers(token)]).then(([t, s]) => {
      if (t.success) setTiers(t.tiers)
      if (s.success) { setSubscribers(s.subscribers); setStats(s.stats) }
      setLoading(false)
    })
  }, [])

  const handleSubmit = async () => {
    const token = getToken()
    if (!token || !name || !price) return
    const benefitsArr = benefits.split(',').map(b => b.trim()).filter(Boolean)
    if (editId) {
      await updateTier(token, editId, { name, description, price: parseFloat(price), benefits: benefitsArr })
    } else {
      await createTier(token, { name, description, price: parseFloat(price), benefits: benefitsArr })
    }
    setShowForm(false); setEditId(null); setName(''); setDescription(''); setPrice(''); setBenefits('')
    const t = await getMyTiers(token)
    if (t.success) setTiers(t.tiers)
  }

  const handleEdit = (tier: any) => {
    setEditId(tier.id); setName(tier.name); setDescription(tier.description || '')
    setPrice(String(tier.price)); setBenefits((tier.benefits || []).join(', ')); setShowForm(true)
  }

  const handleToggle = async (tier: any) => {
    const token = getToken()
    if (!token) return
    await updateTier(token, tier.id, { active: !tier.active })
    const t = await getMyTiers(token)
    if (t.success) setTiers(t.tiers)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary-container" /></div>

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-headline-lg font-bold text-on-surface">Memberships</h1>
          <button onClick={() => { setShowForm(!showForm); setEditId(null); setName(''); setDescription(''); setPrice(''); setBenefits('') }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-container text-on-primary-container rounded-xl font-label-md">
            <Icon name="add" /> New Tier
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-surface-container rounded-2xl p-4">
            <p className="text-label-sm text-on-surface-variant">Subscribers</p>
            <p className="text-headline-lg font-bold text-on-surface">{stats.totalSubscribers || 0}</p>
          </div>
          <div className="bg-surface-container rounded-2xl p-4">
            <p className="text-label-sm text-on-surface-variant">Monthly Revenue</p>
            <p className="text-headline-lg font-bold text-on-surface">{formatCurrency(stats.monthlyRevenue || 0)}</p>
          </div>
        </div>

        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-surface-container rounded-2xl p-6 mb-8">
            <h2 className="font-label-lg mb-4 text-on-surface">{editId ? 'Edit Tier' : 'Create Tier'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Tier name (e.g. Bronze, Gold)" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
              <input value={price} onChange={e => setPrice(e.target.value)} type="number" placeholder="Price" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
            </div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" rows={3} className="w-full bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50 mb-4" />
            <input value={benefits} onChange={e => setBenefits(e.target.value)} placeholder="Benefits (comma separated)" className="w-full bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50 mb-4" />
            <div className="flex gap-3">
              <button onClick={handleSubmit} className="px-6 py-2.5 bg-primary-container text-on-primary-container rounded-xl font-label-md">{editId ? 'Update' : 'Create'} Tier</button>
              <button onClick={() => setShowForm(false)} className="px-6 py-2.5 bg-outline/10 text-on-surface rounded-xl font-label-md">Cancel</button>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {tiers.map(tier => (
            <div key={tier.id} className={`bg-surface-container rounded-2xl p-6 ${!tier.active ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-label-lg text-on-surface">{tier.name}</h3>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(tier)} aria-label="Edit tier" className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-outline/10"><Icon name="edit" className="text-on-surface-variant" /></button>
                  <button onClick={() => handleToggle(tier)} aria-label={tier.active ? 'Disable' : 'Enable'} className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-outline/10">
                    <Icon name={tier.active ? 'visibility' : 'visibility_off'} className="text-on-surface-variant" />
                  </button>
                </div>
              </div>
              <p className="text-headline-md font-bold text-primary-container mb-2">{formatCurrency(parseFloat(tier.price))}<span className="text-label-sm text-on-surface-variant">/mo</span></p>
              {tier.description && <p className="text-body-sm text-on-surface-variant mb-3">{tier.description}</p>}
              {tier.benefits?.length > 0 && (
                <ul className="space-y-1.5">
                  {tier.benefits.map((b: string, i: number) => (
                    <li key={i} className="flex items-center gap-2 text-label-sm text-on-surface-variant"><Icon name="check" className="text-primary-container text-sm" />{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {tiers.length === 0 && (
            <div className="col-span-full text-center py-12">
              <Icon name="card_membership" className="text-4xl text-on-surface-variant/30 mb-3" />
              <p className="text-body-md text-on-surface-variant">No membership tiers yet. Create your first one!</p>
            </div>
          )}
        </div>

        <h2 className="text-title-lg font-bold text-on-surface mb-4">Subscribers ({subscribers.length})</h2>
        <div className="bg-surface-container rounded-2xl overflow-hidden">
          {subscribers.length === 0 ? (
            <p className="text-body-md text-on-surface-variant p-6">No subscribers yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="border-b border-outline/10 text-label-sm text-on-surface-variant"><th className="p-4">User</th><th className="p-4">Tier</th><th className="p-4">Since</th></tr></thead>
                <tbody>
                  {subscribers.map(s => (
                    <tr key={s.id} className="border-b border-outline/5">
                      <td className="p-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-label-sm text-on-surface-variant">
                          {s.user_avatar ? <img src={s.user_avatar} className="w-full h-full rounded-full object-cover" /> : <Icon name="person" />}
                        </div>
                        <span className="text-label-md text-on-surface">{s.user_name}</span>
                      </td>
                      <td className="p-4 text-label-md text-on-surface">{s.tier_name} <span className="text-on-surface-variant">({formatCurrency(parseFloat(s.tier_price))})</span></td>
                      <td className="p-4 text-label-sm text-on-surface-variant">{new Date(s.started_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
