import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { initializePayment, getGatewayInfo, validatePromo } from '../lib/auth'
import { formatCurrency, getCurrencySymbol } from '../lib/currency'
import Button from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'
import Icon from '../components/ui/Icon'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface Feature {
  label: string
  included: boolean
  bold?: boolean
}

interface PlanData {
  id: string
  name: string
  price: string
  description: string
  popular: boolean
  features: Feature[]
}

const defaultPlans: PlanData[] = [
  {
    id: 'free',
    name: 'Free',
    price: '0',
    description: 'Try it out',
    popular: false,
    features: [
      { label: '720p HD Quality', included: false },
      { label: '1 device at a time', included: false },
      { label: 'Offline downloads', included: false },
      { label: 'Ad-supported', included: true },
      { label: 'Limited library access', included: true },
    ],
  },
  {
    id: 'student',
    name: 'Student',
    price: '₦800',
    description: 'For learners on a budget',
    popular: false,
    features: [
      { label: '720p HD Quality', included: true },
      { label: 'All devices supported', included: true },
      { label: '1 screen at a time', included: true },
      { label: 'Offline downloads (1 device)', included: true },
      { label: 'Ad-supported', included: true },
      { label: '6 skips per hour', included: true },
    ],
  },
  {
    id: 'basic',
    name: 'Basic',
    price: '₦1,500',
    description: 'Solo streaming, zero interruptions',
    popular: false,
    features: [
      { label: '720p HD Quality', included: true },
      { label: 'All devices supported', included: true },
      { label: '1 screen at a time', included: true },
      { label: 'Offline downloads (1 device)', included: true },
      { label: 'Completely ad-free', included: true },
      { label: '6 skips per hour', included: true },
    ],
  },
  {
    id: 'standard',
    name: 'Standard',
    price: '₦2,500',
    description: 'The sweet spot',
    popular: true,
    features: [
      { label: '1080p Full HD', included: true, bold: true },
      { label: 'All devices supported', included: true },
      { label: '2 screens simultaneously', included: true },
      { label: 'Offline downloads (2 devices)', included: true },
      { label: 'Completely ad-free', included: true },
      { label: 'Unlimited skips', included: true },
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '₦5,500',
    description: 'Cinema grade experience',
    popular: false,
    features: [
      { label: '4K Ultra HD + Dolby Vision & HDR10', included: true, bold: true },
      { label: 'Spatial Audio support', included: true },
      { label: 'All devices supported', included: true },
      { label: '4 screens simultaneously', included: true },
      { label: 'Offline downloads (6 devices)', included: true },
      { label: 'Completely ad-free', included: true },
      { label: 'Unlimited skips', included: true },
      { label: 'Premier access: theatrical drops, masterclasses, red carpet lobbies', included: true },
    ],
  },
]

// Locked tier matrix copy — used when rendering live DB plans
const featureSets: Record<string, Feature[]> = {
  student: [
    { label: '720p HD Quality', included: true },
    { label: 'All devices supported', included: true },
    { label: '1 screen at a time', included: true },
    { label: 'Offline downloads (1 device)', included: true },
    { label: 'Ad-supported', included: true },
    { label: '6 skips per hour', included: true },
  ],
  basic: [
    { label: '720p HD Quality', included: true },
    { label: 'All devices supported', included: true },
    { label: '1 screen at a time', included: true },
    { label: 'Offline downloads (1 device)', included: true },
    { label: 'Completely ad-free', included: true },
    { label: '6 skips per hour', included: true },
  ],
  standard: [
    { label: '1080p Full HD', included: true, bold: true },
    { label: 'All devices supported', included: true },
    { label: '2 screens simultaneously', included: true },
    { label: 'Offline downloads (2 devices)', included: true },
    { label: 'Completely ad-free', included: true },
    { label: 'Unlimited skips', included: true },
  ],
  premium: [
    { label: '4K Ultra HD + Dolby Vision & HDR10', included: true, bold: true },
    { label: 'Spatial Audio support', included: true },
    { label: 'All devices supported', included: true },
    { label: '4 screens simultaneously', included: true },
    { label: 'Offline downloads (6 devices)', included: true },
    { label: 'Completely ad-free', included: true },
    { label: 'Unlimited skips', included: true },
    { label: 'Premier access: theatrical drops, masterclasses, red carpet lobbies', included: true },
  ],
}

export default function Pricing() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [plans, setPlans] = useState<PlanData[]>(defaultPlans)
  const [selectedPlan, setSelectedPlan] = useState('standard')
  const [gateways, setGateways] = useState<{ paystack: { configured: boolean; publicKey: string }; flutterwave: { configured: boolean; publicKey: string } } | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalPlan, setModalPlan] = useState<string | null>(null)
  const [modalGateway, setModalGateway] = useState<'paystack' | 'flutterwave'>('flutterwave')
  const [modalLoading, setModalLoading] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [promoValid, setPromoValid] = useState<null | { valid: boolean; discount?: number; total?: number; originalAmount?: number; error?: string }>(null)
  const [promoApplying, setPromoApplying] = useState(false)

  useEffect(() => {
    const urlPromo = searchParams.get('code')
    if (urlPromo) {
      setPromoCode(urlPromo.toUpperCase())
    }
  }, [searchParams])

  useEffect(() => {
    fetch(`${API_BASE}/payment/pricing`).then(r => r.json()).then((data: any) => {
      const raw = data?.plans || []
      setPlans(raw.map((p: any, i: number) => ({
        id: p.slug,
        name: p.name,
        price: `${data.currency || 'NGN'} ${(p.price || 0).toLocaleString()}`,
        description: p.slug === 'student' ? 'For learners on a budget' : p.slug === 'basic' ? 'Solo streaming essentials' : p.slug === 'standard' ? 'The sweet spot' : 'Cinema grade experience',
        popular: p.slug === 'standard',
        features: featureSets[p.slug] || (p.features || []).map((f: string) => ({ label: f, included: true })),
      })))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (user) {
      getGatewayInfo(localStorage.getItem('novaflix-token') || '').then(setGateways).catch(() => setGateways({ paystack: { configured: false, publicKey: '' }, flutterwave: { configured: false, publicKey: '' } }))
    }
  }, [user])

  useEffect(() => {
    if (gateways) {
      if (!gateways.paystack.configured && !gateways.flutterwave.configured) {
        // leave default but will be disabled
      } else if (!gateways.flutterwave.configured && gateways.paystack.configured) {
        setModalGateway('paystack')
      } else if (gateways.flutterwave.configured) {
        setModalGateway('flutterwave')
      }
    }
  }, [gateways])

  const handleSelectPlan = (planId: string) => {
    if (!user) { navigate('/login'); return }
    if (planId === 'free') return
    setSelectedPlan(planId)
    setModalPlan(planId)
    setShowModal(true)
  }

  const handlePayNow = async () => {
    if (!modalPlan) return
    setModalLoading(true)
    const token = localStorage.getItem('novaflix-token') || ''
    const res = await initializePayment(token, modalPlan, modalGateway, promoValid?.valid ? promoCode : undefined)
    setModalLoading(false)
    setShowModal(false)
    if (res.success && res.authorization_url) {
      window.location.href = res.authorization_url
    } else {
      toast.error(res.error || 'Payment failed')
    }
  }

  const applyPromoCode = async () => {
    if (!promoCode.trim() || !modalPlan) return
    setPromoApplying(true)
    setPromoValid(null)
    const token = localStorage.getItem('novaflix-token') || ''
    const res = await validatePromo(token, promoCode.trim().toUpperCase(), modalPlan)
    setPromoApplying(false)
    if (res.success && res.valid) {
      setPromoValid({ valid: true, discount: res.discount, total: res.total, originalAmount: res.originalAmount })
      toast.success('Promo code applied!')
    } else {
      setPromoValid({ valid: false, error: res.error || 'Invalid promo code' })
      toast.error(res.error || 'Invalid promo code')
    }
  }

  const currentPlan = user?.plan || 'free'
  const isCurrentPlan = (planId: string) => currentPlan === planId && currentPlan !== 'free'

  return (
    <>
      <div className="min-h-screen bg-background">
      <div className="relative pt-32 pb-24 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] opacity-20 pointer-events-none blur-[120px] bg-gradient-to-b from-primary-container to-transparent" />

        <div className="relative z-10 text-center mb-16">
          <span className="inline-block px-4 py-1.5 rounded-full bg-surface-container-highest text-secondary font-label-md text-label-md mb-6 uppercase tracking-widest">Pricing Tiers</span>
          <h1 className="text-headline-lg md:text-display-lg mb-4 text-balance">Choose the plan that's right for you</h1>
          <p className="text-body-lg text-on-surface-variant max-w-2xl mx-auto">From students to cinephiles — every tier unlocks a premium <img src="/leter-mark-logo.png" alt="" className="h-5 w-auto inline align-middle" /> experience.</p>
        </div>

<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-20" id="plan-selector">
          <div className="relative group flex flex-col p-6 rounded-xl border bg-surface-container border-outline-variant/30 hover:translate-y-[-8px] transition-all cursor-default">
            <div className="mb-6">
              <h3 className="text-headline-md mb-1">Free</h3>
              <p className="font-label-sm text-label-sm text-on-surface-variant">Try it out</p>
              <div className="mt-4">
                <span className="text-headline-lg font-bold">{formatCurrency(0)}</span>
                <span className="text-on-surface-variant text-body-md">/month</span>
              </div>
            </div>
            <div className="space-y-3 mb-8 flex-grow">
              {defaultPlans.find(p => p.id === 'free')?.features.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  {f.included ? (
                    <Icon name="check_circle" className="text-primary text-[20px]" />
                  ) : (
                    <Icon name="cancel" className="text-on-surface-variant/40 text-[20px]" />
                  )}
                  <span className={`text-body-md ${f.included ? (f.bold ? 'font-bold text-on-surface' : '') : 'text-on-surface-variant/60'}`}>
                    {f.label}
                  </span>
                </div>
              ))}
            </div>
            <Link to="/register" className="w-full py-4 rounded-lg font-bold border border-primary-container text-primary-container hover:bg-primary-container hover:text-on-primary-container transition-all">
              Get Started
            </Link>
          </div>
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.id
            const isActive = isCurrentPlan(plan.id)
            return (
              <div
                key={plan.id}
                className={`relative group flex flex-col p-6 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-surface-container-high border-primary-container/50 scale-105 z-10 shadow-2xl'
                    : 'bg-surface-container border-outline-variant/30 hover:translate-y-[-8px]'
              }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary-container text-on-primary-container px-4 py-1 rounded-full font-label-md text-label-sm font-bold uppercase tracking-tighter whitespace-nowrap">
                    Most Popular
                  </div>
                )}
                {isActive && (
                  <div className="absolute -top-4 right-4 bg-secondary text-black px-3 py-1 rounded-full font-label-md text-label-sm font-bold">
                    Current
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-headline-md mb-1">{plan.name}</h3>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">{plan.description}</p>
                  <div className="mt-4">
                    <span className="text-headline-lg font-bold">{plan.price}</span>
                    <span className="text-on-surface-variant text-body-md">/month</span>
                  </div>
                </div>

                <div className="space-y-3 mb-8 flex-grow">
                  {plan.features.map((f) => (
                    <div key={f.label} className="flex items-center gap-3">
                      {f.included ? (
                        <Icon name="check_circle" className="text-primary text-[20px]" />
                      ) : (
                        <Icon name="cancel" className="text-on-surface-variant/40 text-[20px]" />
                      )}
                      <span className={`text-body-md ${f.included ? (f.bold ? 'font-bold text-on-surface' : '') : 'text-on-surface-variant/60'}`}>
                        {f.label}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  disabled={isActive}
                  onClick={() => handleSelectPlan(plan.id)}
                  className={`w-full py-4 rounded-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'bg-primary-container text-on-primary-container shadow-lg shadow-primary-container/20 hover:brightness-110 active:scale-95'
                      : 'border border-primary-container text-primary-container hover:bg-primary-container hover:text-on-primary-container'
                  }`}
                >
                  {isActive ? 'Current Plan' : `Subscribe — ${plan.price}`}
                </button>
              </div>
            )
          })}
        </div>

        <div className="text-center">
          <Link to="/settings" className="inline-flex items-center gap-2 font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors group">
            Manage your subscription
            <Icon name="arrow_forward" size="sm" className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="mt-24 rounded-2xl overflow-hidden h-64 md:h-96 relative">
          <div className="w-full h-full bg-gradient-to-br from-primary-container/20 via-surface to-surface" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12">
            <p className="font-label-md text-label-md text-secondary mb-2">EXPERIENCE THE NEXUS</p>
            <h4 className="text-headline-md md:text-headline-lg max-w-xl">Studio quality content in every frame, everywhere you are.</h4>
          </div>
        </div>
      </div>
      </div>

      {showModal && modalPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-surface-container-high rounded-2xl w-full max-w-md mx-4 p-8 relative shadow-2xl border border-outline-variant/30" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-surface-container-higher transition-colors text-on-surface-variant"
            >
              <Icon name="close" />
            </button>

            <h2 className="text-headline-md mb-1">Complete Payment</h2>
            <p className="text-body-md text-on-surface-variant mb-6">
              {plans.find(p => p.id === modalPlan)?.name} — {plans.find(p => p.id === modalPlan)?.price}/month
            </p>

            <div className="mb-6">
              <label className="block text-sm mb-2">
                <span className="text-on-surface-variant">Promo code</span>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={promoCode}
                    onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoValid(null); }}
                    placeholder="Enter promo code"
                    className="flex-1"
                    disabled={promoApplying}
                  />
                  <Button
                    onClick={applyPromoCode}
                    loading={promoApplying}
                    disabled={!promoCode.trim() || promoApplying}
                    className="whitespace-nowrap"
                    size="sm"
                  >
                    Apply
                  </Button>
                </div>
                {promoValid?.valid && (
                  <div className="mt-2 text-sm text-green-400">Promo applied! You save {promoValid.discount ? formatCurrency(promoValid.discount) : ''}</div>
                )}
                {promoValid?.valid === false && (
                  <div className="mt-2 text-sm text-red-400">{promoValid.error}</div>
                )}
              </label>
            </div>

            {promoValid?.valid && (
              <div className="mb-4 p-4 bg-surface-container rounded-xl border border-outline-variant/30">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-on-surface-variant">Original price</span>
                  <span className="text-on-surface">{formatCurrency(promoValid.originalAmount || 0)}</span>
                </div>
                <div className="flex justify-between text-sm mb-2 text-green-400">
                  <span className="text-on-surface-variant">Discount</span>
                  <span className="font-bold">-{formatCurrency(promoValid.discount || 0)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t border-white/10 pt-2">
                  <span className="text-on-surface">Total to pay</span>
                  <span className="text-primary">{formatCurrency(promoValid.total || 0)}</span>
                </div>
              </div>
            )}

            <p className="font-label-md text-label-sm text-on-surface-variant mb-3">Select payment method</p>

            <div className="space-y-3 mb-6">
              <div
                onClick={() => setModalGateway('flutterwave')}
                className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                  modalGateway === 'flutterwave'
                    ? 'border-primary-container/50 bg-surface-container-high'
                    : 'border-outline-variant/30 bg-surface-container hover:brightness-110'
                }`}
              >
                <img src="/flutterwave-logo.svg" alt="Flutterwave" className="h-8" />
                <span className="font-medium text-body-md flex-1">Flutterwave</span>
                <Icon name={modalGateway === 'flutterwave' ? 'radio_button_checked' : 'radio_button_unchecked'} className="text-primary text-xl" />
              </div>

              <div
                onClick={() => setModalGateway('paystack')}
                className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                  modalGateway === 'paystack'
                    ? 'border-primary-container/50 bg-surface-container-high'
                    : 'border-outline-variant/30 bg-surface-container hover:brightness-110'
                }`}
              >
                <img src="/paystack-logo.svg" alt="Paystack" className="h-8" />
                <span className="font-medium text-body-md flex-1">Paystack</span>
                {gateways && !gateways.paystack.configured && (
                  <span className="text-xs bg-surface-container-highest px-2 py-0.5 rounded-full text-on-surface-variant">Keys not set</span>
                )}
                <Icon name={modalGateway === 'paystack' ? 'radio_button_checked' : 'radio_button_unchecked'} className="text-primary text-xl" />
              </div>
            </div>

            <Button
              onClick={handlePayNow}
              loading={modalLoading}
              disabled={!!(gateways && (
                (modalGateway === 'paystack' && !gateways.paystack.configured) ||
                (modalGateway === 'flutterwave' && !gateways.flutterwave.configured)
              ))}
              className="w-full justify-center"
            >
              {gateways && modalGateway === 'paystack' && !gateways.paystack.configured
                ? 'Paystack unavailable — add keys in .env'
                : gateways && modalGateway === 'flutterwave' && !gateways.flutterwave.configured
                ? 'Flutterwave unavailable — add keys in .env'
                : 'Pay Now'}
            </Button>
            {gateways && !gateways.paystack.configured && !gateways.flutterwave.configured && (
              <p className="text-center text-sm text-red-500 mt-2">No payment gateway configured. Contact support.</p>
            )}
            <p className="text-center text-body-sm text-on-surface-variant mt-4">
              You'll be redirected to the payment portal
            </p>
          </div>
        </div>
      )}
    </>
  )
}
