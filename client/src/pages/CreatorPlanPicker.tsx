import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Icon from '../components/ui/Icon'
import { useAuth } from '../lib/AuthContext'
import { API_BASE } from '../lib/config'
import { formatCurrency } from '../lib/currency'

const CREATOR_PLANS = [
  {
    id: 'student',
    name: 'Student',
    price: 800,
    period: '/month',
    color: 'from-blue-600 to-blue-800',
    features: ['720p HD streaming', 'Ad-supported', '1 download device', 'Basic analytics'],
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 1500,
    period: '/month',
    color: 'from-green-600 to-green-800',
    features: ['720p HD streaming', 'Ad-supported', '1 download device', 'Basic analytics', 'Priority support'],
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 2500,
    period: '/month',
    color: 'from-purple-600 to-purple-800',
    featured: true,
    features: ['1080p Full HD', 'Ad-free', '2 download devices', 'Advanced analytics', 'Priority support', 'Early access to features'],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 5500,
    period: '/month',
    color: 'from-accent to-red-800',
    features: ['4K HDR streaming', 'Ad-free', '6 download devices', 'Full analytics suite', '24/7 priority support', 'Watch parties', 'Spatial audio', 'Premier access'],
  },
]

export default function CreatorPlanPicker() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleSelect(planId: string) {
    setLoading(planId)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/payment/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ plan: planId }),
      })
      const data = await res.json()
      if (data.success && data.authorization_url) {
        window.location.href = data.authorization_url
      } else {
        setError(data.error || 'Payment initialization failed')
      }
    } catch {
      setError('Network error')
    }
    setLoading(null)
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center py-12 px-4">
      <div className="max-w-6xl w-full">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary-container/10 mb-4">
            <Icon name="workspace_premium" className="w-8 h-8 text-primary-container" />
          </div>
          <h1 className="text-display-sm font-bold mb-2">
            Choose Your <span className="text-primary-container">Plan</span>
          </h1>
          <p className="text-on-surface-variant max-w-md mx-auto">
            {user?.name || 'Creator'}, pick a plan to start publishing your content. All plans unlock creator features.
          </p>
        </div>

        {error && (
          <div className="max-w-md mx-auto mb-6 bg-error-container/20 text-error text-sm rounded-lg px-4 py-3 text-center">{error}</div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {CREATOR_PLANS.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`relative rounded-xl border overflow-hidden transition-all duration-300 ${
                plan.featured
                  ? 'border-primary-container bg-surface-container-high ring-1 ring-primary-container/30'
                  : 'border-white/5 bg-surface-container hover:border-white/20'
              }`}
            >
              {plan.featured && (
                <div className="absolute top-0 left-0 right-0 bg-primary-container text-on-primary-container text-xs font-bold text-center py-1.5 uppercase tracking-wider">
                  Recommended
                </div>
              )}

              <div className="p-6 pt-8">
                <h3 className="text-headline-md font-bold text-on-surface mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl font-bold text-on-surface">{formatCurrency(plan.price)}</span>
                  <span className="text-on-surface-variant text-sm">{plan.period}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-on-surface-variant">
                      <Icon name="check" className="text-primary-container mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelect(plan.id)}
                  disabled={loading !== null}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                    plan.featured
                      ? 'bg-primary-container text-on-primary-container hover:brightness-110 shadow-lg shadow-primary-container/20'
                      : 'bg-surface-variant/60 text-on-surface hover:bg-surface-variant border border-white/5'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {loading === plan.id ? 'Processing...' : `Choose ${plan.name}`}
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-on-surface-variant/40 text-xs mt-8">
          All plans include hosting, distribution, analytics, and creator tools. No hidden fees.
        </p>
      </div>
    </div>
  )
}
