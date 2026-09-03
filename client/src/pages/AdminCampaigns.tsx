import { useState, useEffect } from 'react'
import Icon from '../components/ui/Icon'
import Button from '../components/ui/Button'
import { API_BASE } from '../lib/config'
import { formatCurrency } from '../lib/currency'

interface Campaign {
  id: string
  creator_id: string
  advertiser_name: string
  creative_url: string
  creative_type: string
  promotion_type: string
  target_genre: string | null
  max_impressions: number
  current_impressions: number
  budget: number
  spent: number
  approved: boolean
  active: boolean
  start_date: string
  end_date: string | null
  created_at: string
}

export default function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCampaigns = async () => {
    const token = localStorage.getItem('novaflix-token')
    const res = await fetch(`${API_BASE}/campaigns`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (data.success) setCampaigns(data.campaigns || [])
    setLoading(false)
  }

  useEffect(() => { fetchCampaigns() }, [])

  const updateCampaign = async (id: string, updates: Record<string, any>) => {
    const token = localStorage.getItem('novaflix-token')
    await fetch(`${API_BASE}/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(updates),
    })
    fetchCampaigns()
  }

  return (
    <div className="px-margin-mobile md:px-margin-desktop pt-6 pb-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-headline-md font-bold text-on-surface mb-8">Campaign Approvals</h1>

        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-2 border-primary-container border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-20">
            <Icon name="campaign" className="w-12 h-12 text-on-surface-variant/40 mx-auto mb-4" />
            <p className="text-on-surface-variant">No campaigns to review</p>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((c) => (
              <div key={c.id} className="bg-surface-container-high border border-white/5 rounded-xl p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-label-md text-label-md text-on-surface">{c.advertiser_name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded ${c.approved ? 'bg-secondary/20 text-secondary' : 'bg-yellow-500/20 text-yellow-400'}`}>
                        {c.approved ? 'Approved' : 'Pending'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${c.active ? 'bg-primary-container/20 text-primary-container' : 'bg-surface-variant/40 text-on-surface-variant/40'}`}>
                        {c.active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-on-surface-variant/60">
                      <span>Type: {c.promotion_type}</span>
                      <span>Impressions: {c.current_impressions}/{c.max_impressions || '∞'}</span>
                      {c.budget > 0 && <span>Budget: {formatCurrency(c.spent)}/{formatCurrency(c.budget)}</span>}
                      {c.target_genre && <span>Genre: {c.target_genre}</span>}
                    </div>
                    {c.creative_type === 'image' && c.creative_url && (
                      <img src={c.creative_url} alt="" className="mt-3 h-20 rounded object-cover bg-surface-container" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {!c.approved && (
                      <Button size="sm" onClick={() => updateCampaign(c.id, { approved: true })}>
                        Approve
                      </Button>
                    )}
                    <button
                      onClick={() => updateCampaign(c.id, { active: !c.active })}
                      className="w-9 h-9 rounded-lg bg-surface-variant/40 flex items-center justify-center hover:bg-surface-variant/60 transition-colors"
                      aria-label={c.active ? 'Pause' : 'Activate'}
                    >
                      <Icon name={c.active ? 'pause' : 'play_arrow'} className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
