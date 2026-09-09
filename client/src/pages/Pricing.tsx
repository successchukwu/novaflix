import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { initializePayment, getGatewayInfo, validatePromo } from '../lib/auth'
import { formatCurrency } from '../lib/currency'
import Button from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'
import Icon from '../components/ui/Icon'
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
  { id: 'free', name: 'Free', price: '0', description: 'Try it out', popular: false, features: [ { label: '720p HD Quality', included: false }, { label: '1 device at a time', included: false }, { label: 'Offline downloads', included: false }, { label: 'Ad-supported', included: true }, { label: 'Limited library access', included: true }, ] },
  { id: 'student', name: 'Student', price: '₦800', description: 'For learners on a budget', popular: false, features: [ { label: '720p HD Quality', included: true }, { label: 'All devices supported', included: true }, { label: '1 screen at a time', included: true }, { label: 'Offline downloads (1 device)', included: true }, { label: 'Ad-supported', included: true }, { label: '6 skips per hour', included: true }, ] },
  { id: 'basic', name: 'Basic', price: '₦1,500', description: 'Solo streaming, zero interruptions', popular: false, features: [ { label: '720p HD Quality', included: true }, { label: 'All devices supported', included: true }, { label: '1 screen at a time', included: true }, { label: 'Offline downloads (1 device)', included: true }, { label: 'Completely ad-free', included: true }, { label: '6 skips per hour', included: true }, ] },
  { id: 'standard', name: 'Standard', price: '₦2,500', description: 'The sweet spot', popular: true, features: [ { label: '1080p Full HD', included: true, bold: true }, { label: 'All devices supported', included: true }, { label: '2 screens simultaneously', included: true }, { label: 'Offline downloads (2 devices)', included: true }, { label: 'Completely ad-free', included: true }, { label: 'Unlimited skips', included: true }, ] },
  { id: 'premium', name: 'Premium', price: '₦5,500', description: 'Cinema grade experience', popular: false, features: [ { label: '4K Ultra HD + Dolby Vision & HDR10', included: true, bold: true }, { label: 'Spatial Audio support', included: true }, { label: 'All devices supported', included: true }, { label: '4 screens simultaneously', included: true }, { label: 'Offline downloads (6 devices)', included: true }, { label: 'Completely ad-free', included: true }, { label: 'Unlimited skips', included: true }, { label: 'Premier access: theatrical drops, masterclasses, red carpet lobbies', included: true }, ] },
]

const featureSets: Record<string, Feature[]> = {
  student: [ { label: '720p HD Quality', included: true }, { label: 'All devices supported', included: true }, { label: '1 screen at a time', included: true }, { label: 'Offline downloads (1 device)', included: true }, { label: 'Ad-supported', included: true }, { label: '6 skips per hour', included: true }, ],
  basic: [ { label: '720p HD Quality', included: true }, { label: 'All devices supported', included: true }, { label: '1 screen at a time', included: true }, { label: 'Offline downloads (1 device)', included: true }, { label: 'Completely ad-free', included: true }, { label: '6 skips per hour', included: true }, ],
  standard: [ { label: '1080p Full HD', included: true, bold: true }, { label: 'All devices supported', included: true }, { label: '2 screens simultaneously', included: true }, { label: 'Offline downloads (2 devices)', included: true }, { label: 'Completely ad-free', included: true }, { label: 'Unlimited skips', included: true }, ],
  premium: [ { label: '4K Ultra HD + Dolby Vision & HDR10', included: true, bold: true }, { label: 'Spatial Audio support', included: true }, { label: 'All devices supported', included: true }, { label: '4 screens simultaneously', included: true }, { label: 'Offline downloads (6 devices)', included: true }, { label: 'Completely ad-free', included: true }, { label: 'Unlimited skips', included: true }, { label: 'Premier access: theatrical drops, masterclasses, red carpet lobbies', included: true }, ],
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
    if (urlPromo) setPromoCode(urlPromo.toUpperCase())
  }, [searchParams])

  useEffect(() => {
    fetch(`${API_BASE}/payment/pricing`).then(r => r.json()).then((data: any) => {
      const raw = data?.plans || []
      setPlans(raw.map((p: any) => ({
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
      if (!gateways.paystack.configured && !gateways.flutterwave.configured) {}
      else if (!gateways.flutterwave.configured && gateways.paystack.configured) setModalGateway('paystack')
      else if (gateways.flutterwave.configured) setModalGateway('flutterwave')
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
    if (res.success && res.authorization_url) window.location.href = res.authorization_url
    else toast.error(res.error || 'Payment failed')
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

  // Filter out free from dynamic plans (free rendered separately)
  const paidPlans = plans.filter(p => p.id !== 'free')
  const freePlan = defaultPlans.find(p => p.id === 'free')!

  return (
    <>
      <section className="pricing-section w-full py-[70px] px-[25px] pb-20 bg-pricing-bg bg-pricing-body max-[1250px]:px-[15px] max-[1250px]:py-[55px] max-[900px]:px-[18px] max-[900px]:py-[45px] max-[600px]:px-3 max-[600px]:py-[35px] max-[400px]:px-2 max-[400px]:py-[30px]">
        <div className="pricing-container w-full max-w-[1450px] mx-auto">
          {/* Header — reference pricing-header */}
          <div className="pricing-header text-center max-w-[750px] mx-auto mb-[55px] max-[900px]:mb-10 max-[600px]:mb-[30px] max-[400px]:mb-[25px]">
            <span className="pricing-badge inline-flex items-center justify-center px-[15px] py-[7px] mb-[18px] border border-pricing-red/50 rounded-full bg-pricing-red/10 text-pricing-red-light text-[10px] font-extrabold tracking-[1px] uppercase max-[600px]:text-[8px] max-[600px]:px-3 max-[600px]:py-1.5 max-[400px]:text-[8px]">
              NovaFlix Membership
            </span>
            <h1 className="text-pricing-white text-[clamp(30px,4vw,48px)] font-extrabold leading-[1.1] tracking-[-1px] mb-[15px] max-[600px]:text-[29px] max-[600px]:tracking-[-0.5px] max-[400px]:text-[26px]">
              Choose Your <span className="text-pricing-red">Perfect Plan</span>
            </h1>
            <p className="text-pricing-muted text-sm leading-[1.7] max-w-[650px] mx-auto max-[900px]:text-[13px] max-[600px]:text-xs max-[600px]:leading-6 max-[400px]:text-[11px]">
              Stream your favorite movies and shows with a plan that fits your lifestyle. Upgrade anytime and enjoy more entertainment.
            </p>
          </div>

          {/* Grid — reference pricing-grid 5 cols desktop, 2 tablet/mobile */}
          <div className="pricing-grid grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-[14px] max-[1250px]:gap-[10px] max-[900px]:grid-cols-2 max-[900px]:gap-4 max-[600px]:gap-3 max-[400px]:gap-2 items-stretch" id="plan-selector">
            {/* Free — always first, static */}
            <div className="plan-card relative flex flex-col min-w-0 min-h-[550px] p-[28px_20px_20px] border border-pricing-border rounded-xl bg-gradient-to-br from-[#252525] to-[#1c1c1c] transition-all duration-300 hover:-translate-y-[7px] hover:border-pricing-red/70 hover:bg-pricing-card-hover hover:shadow-pricing max-[1250px]:min-h-[540px] max-[1250px]:p-[25px_14px_18px] max-[900px]:min-h-[500px] max-[900px]:p-[28px_20px_20px] max-[600px]:min-h-[510px] max-[600px]:p-[25px_14px_16px] max-[600px]:rounded-[10px] max-[400px]:min-h-[480px] max-[400px]:p-[22px_10px_13px] max-[400px]:rounded-lg">
              <div className="plan-top mb-[22px] max-[400px]:mb-[18px]">
                <h2 className="plan-name text-pricing-white text-lg font-bold mb-[7px] max-[1250px]:text-base max-[900px]:text-lg max-[600px]:text-base max-[400px]:text-sm">{freePlan.name}</h2>
                <p className="plan-description text-[#9d9d9d] text-[10px] leading-[1.4] min-h-[14px] max-[1250px]:text-[9px] max-[900px]:text-[10px] max-[600px]:text-[9px] max-[600px]:min-h-[25px] max-[400px]:text-[8px] max-[400px]:min-h-[23px]">{freePlan.description}</p>
              </div>
              <div className="price free-price flex items-baseline flex-wrap mb-[25px] text-pricing-white max-[600px]:mb-[22px] max-[400px]:mb-[19px]">
                <span className="currency text-[#dddddd] text-xs font-semibold mr-1 max-[1250px]:text-[10px] max-[600px]:text-[9px] max-[400px]:text-[8px]">NGN</span>
                <span className="amount text-pricing-white text-[34px] font-extrabold leading-none tracking-[-1px] max-[1250px]:text-[27px] max-[900px]:text-[32px] max-[600px]:text-[25px] max-[400px]:text-[21px]">0</span>
                <span className="period text-[#888] text-[10px] ml-0.5 max-[1250px]:text-[8px] max-[600px]:text-[8px] max-[400px]:text-[7px]">/month</span>
              </div>
              <ul className="features list-none flex flex-col gap-[13px] flex-1 max-[1250px]:gap-[11px] max-[900px]:gap-[13px] max-[600px]:gap-[11px] max-[400px]:gap-[9px]">
                {freePlan.features.map(f => (
                  <li key={f.label} className="flex items-start gap-[9px] text-[#c8c8c8] text-[11px] leading-[1.45] max-[1250px]:text-[9px] max-[1250px]:gap-1.5 max-[900px]:text-[11px] max-[600px]:text-[9px] max-[600px]:gap-1.5 max-[400px]:text-[8px] max-[400px]:gap-1">
                    <span className={`flex items-center justify-center shrink-0 w-3.5 h-3.5 mt-px rounded-full border text-[8px] font-bold max-[1250px]:w-3 max-[1250px]:h-3 max-[1250px]:text-[7px] max-[600px]:w-3 max-[600px]:h-3 max-[600px]:text-[7px] max-[400px]:w-[11px] max-[400px]:h-[11px] max-[400px]:text-[6px] ${f.included ? 'border-pricing-red-light text-pricing-red-light' : 'border-[#555] text-[#555]'}`}>✓</span>
                    <span className={f.included ? '' : 'opacity-60'}>{f.label}</span>
                  </li>
                ))}
              </ul>
              <Link to="/register" className="plan-button w-full min-h-[44px] mt-7 px-2.5 py-2 border border-pricing-red rounded-md bg-transparent text-pricing-red text-[10px] font-bold flex items-center justify-center hover:bg-pricing-red hover:text-white hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(255,7,24,0.25)] transition-all max-[1250px]:min-h-[42px] max-[1250px]:text-[8px] max-[600px]:min-h-[42px] max-[600px]:text-[8px] max-[600px]:mt-6 max-[400px]:min-h-[38px] max-[400px]:text-[7px] max-[400px]:mt-5">
                Get Started
              </Link>
            </div>

            {/* Paid plans — mapped from DB + featureSets */}
            {paidPlans.map(plan => {
              const isSelected = selectedPlan === plan.id
              const isActive = isCurrentPlan(plan.id)
              const isPopular = plan.popular
              return (
                <div
                  key={plan.id}
                  className={`plan-card relative flex flex-col min-w-0 p-[28px_20px_20px] border rounded-xl transition-all duration-300 cursor-pointer
                    ${isPopular
                      ? 'min-h-[550px] border-pricing-red bg-gradient-to-br from-[#2a2a2a] to-[#202020] shadow-pricing-popular -translate-y-2 hover:-translate-y-[14px] hover:shadow-pricing-popular-hover max-[1250px]:-translate-y-1 max-[1250px]:hover:-translate-y-2.5 max-[900px]:translate-y-0 max-[900px]:hover:-translate-y-[7px]'
                      : 'min-h-[550px] border-pricing-border bg-gradient-to-br from-[#252525] to-[#1c1c1c] hover:-translate-y-[7px] hover:border-pricing-red/70 hover:bg-pricing-card-hover hover:shadow-pricing'}
                    ${isActive ? 'current-plan opacity-100' : ''}
                    ${isSelected && !isPopular ? 'border-pricing-red/70 shadow-pricing' : ''}
                    max-[1250px]:min-h-[540px] max-[1250px]:p-[25px_14px_18px]
                    max-[900px]:min-h-[500px] max-[900px]:p-[28px_20px_20px]
                    max-[600px]:min-h-[510px] max-[600px]:p-[25px_14px_16px] max-[600px]:rounded-[10px]
                    max-[400px]:min-h-[480px] max-[400px]:p-[22px_10px_13px] max-[400px]:rounded-lg
                  `}
                >
                  {isPopular && <span className="popular-badge absolute -top-px left-1/2 -translate-x-1/2 whitespace-nowrap px-[15px] py-1.5 bg-pricing-red text-white rounded-b-lg text-[9px] font-extrabold tracking-[0.5px] max-[1250px]:text-[7px] max-[1250px]:px-2.5 max-[1250px]:py-1 max-[600px]:text-[7px] max-[600px]:px-2 max-[600px]:py-1 max-[400px]:text-[6px] max-[400px]:px-1.5 max-[400px]:py-1">MOST POPULAR</span>}
                  {isActive && <span className="current-badge absolute -top-[9px] right-3 px-2.5 py-1 bg-pricing-green text-[#07190d] rounded-full text-[9px] font-extrabold max-[1250px]:text-[7px] max-[1250px]:px-1.5 max-[1250px]:py-1 max-[1250px]:right-2 max-[600px]:text-[7px] max-[600px]:px-1.5 max-[600px]:py-1 max-[400px]:text-[6px] max-[400px]:px-1 max-[400px]:py-0.5 max-[400px]:right-1">Current</span>}

                  <div className="plan-top mb-[22px] max-[400px]:mb-[18px]">
                    <h2 className="plan-name text-pricing-white text-lg font-bold mb-[7px] max-[1250px]:text-base max-[900px]:text-lg max-[600px]:text-base max-[400px]:text-sm">{plan.name}</h2>
                    <p className="plan-description text-[#9d9d9d] text-[10px] leading-[1.4] min-h-[14px] max-[1250px]:text-[9px] max-[900px]:text-[10px] max-[600px]:text-[9px] max-[600px]:min-h-[25px] max-[400px]:text-[8px] max-[400px]:min-h-[23px]">{plan.description}</p>
                  </div>

                  <div className="price flex items-baseline flex-wrap mb-[25px] text-pricing-white max-[600px]:mb-[22px] max-[400px]:mb-[19px]">
                    <span className="currency text-[#dddddd] text-xs font-semibold mr-1 max-[1250px]:text-[10px] max-[600px]:text-[9px] max-[400px]:text-[8px]">{plan.price.split(' ')[0]}</span>
                    <span className="amount text-pricing-white text-[32px] font-extrabold leading-none tracking-[-1px] max-[1250px]:text-[27px] max-[900px]:text-[32px] max-[600px]:text-[25px] max-[400px]:text-[21px]">{plan.price.split(' ')[1] || plan.price}</span>
                    <span className="period text-[#888] text-[10px] ml-0.5 max-[1250px]:text-[8px] max-[600px]:text-[8px] max-[400px]:text-[7px]">/month</span>
                  </div>

                  <ul className="features list-none flex flex-col gap-[13px] flex-1 max-[1250px]:gap-[11px] max-[900px]:gap-[13px] max-[600px]:gap-[11px] max-[400px]:gap-[9px]">
                    {plan.features.map(f => (
                      <li key={f.label} className="flex items-start gap-[9px] text-[#c8c8c8] text-[11px] leading-[1.45] max-[1250px]:text-[9px] max-[1250px]:gap-1.5 max-[900px]:text-[11px] max-[600px]:text-[9px] max-[600px]:gap-1.5 max-[400px]:text-[8px] max-[400px]:gap-1">
                        <span className="flex items-center justify-center shrink-0 w-3.5 h-3.5 mt-px rounded-full border border-pricing-red-light text-pricing-red-light text-[8px] font-bold max-[1250px]:w-3 max-[1250px]:h-3 max-[1250px]:text-[7px] max-[600px]:w-3 max-[600px]:h-3 max-[600px]:text-[7px] max-[400px]:w-[11px] max-[400px]:h-[11px] max-[400px]:text-[6px]">✓</span>
                        {f.bold ? <strong className="text-pricing-white">{f.label}</strong> : <span>{f.label}</span>}
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    disabled={isActive}
                    onClick={() => handleSelectPlan(plan.id)}
                    className={`plan-button w-full min-h-[44px] mt-7 px-2.5 py-2 rounded-md text-[10px] font-bold flex items-center justify-center transition-all
                      ${isActive
                        ? 'bg-transparent text-[#777] border-[#444] cursor-default'
                        : isPopular
                          ? 'bg-pricing-red text-white border-pricing-red hover:bg-[#ff1c2c] hover:shadow-[0_10px_25px_rgba(255,7,24,0.35)] hover:-translate-y-0.5'
                          : 'bg-transparent text-pricing-red border-pricing-red hover:bg-pricing-red hover:text-white hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(255,7,24,0.25)]'}
                      disabled:opacity-50 disabled:cursor-not-allowed
                      max-[1250px]:min-h-[42px] max-[1250px]:text-[8px]
                      max-[600px]:min-h-[42px] max-[600px]:text-[8px] max-[600px]:mt-6 max-[600px]:py-1
                      max-[400px]:min-h-[38px] max-[400px]:text-[7px] max-[400px]:mt-5
                    `}
                  >
                    {isActive ? 'Current Plan' : `Subscribe — ${plan.price}`}
                  </button>
                </div>
              )
            })}
          </div>

          <div className="text-center mt-10">
            <Link to="/settings" className="inline-flex items-center gap-2 font-mono text-sm text-pricing-muted hover:text-pricing-red transition-colors group">
              Manage your subscription
              <Icon name="arrow_forward" size="sm" className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* Modal — keep existing logic, Tailwind surface for contrast */}
      {showModal && modalPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowModal(false)}>
          <div className="bg-surface-container-high rounded-2xl w-full max-w-md mx-4 p-8 relative shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors text-white/60"><Icon name="close" /></button>
            <h2 className="text-xl font-bold text-white mb-1">Complete Payment</h2>
            <p className="text-sm text-white/60 mb-6">{paidPlans.find(p => p.id === modalPlan)?.name || modalPlan} — {paidPlans.find(p => p.id === modalPlan)?.price || ''}/month</p>

            <div className="mb-6">
              <label className="block text-sm mb-2"><span className="text-white/60">Promo code</span>
                <div className="flex gap-2 mt-1">
                  <Input value={promoCode} onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoValid(null); }} placeholder="Enter promo code" className="flex-1" disabled={promoApplying} />
                  <Button onClick={applyPromoCode} loading={promoApplying} disabled={!promoCode.trim() || promoApplying} className="whitespace-nowrap" size="sm">Apply</Button>
                </div>
                {promoValid?.valid && <div className="mt-2 text-sm text-pricing-green">Promo applied! You save {promoValid.discount ? formatCurrency(promoValid.discount) : ''}</div>}
                {promoValid?.valid === false && <div className="mt-2 text-sm text-red-400">{promoValid.error}</div>}
              </label>
            </div>

            {promoValid?.valid && (
              <div className="mb-4 p-4 bg-pricing-card rounded-xl border border-pricing-border">
                <div className="flex justify-between text-sm mb-2"><span className="text-pricing-muted">Original price</span><span className="text-pricing-white">{formatCurrency(promoValid.originalAmount || 0)}</span></div>
                <div className="flex justify-between text-sm mb-2 text-pricing-green"><span>Discount</span><span className="font-bold">-{formatCurrency(promoValid.discount || 0)}</span></div>
                <div className="flex justify-between font-bold text-base border-t border-white/10 pt-2"><span className="text-pricing-white">Total to pay</span><span className="text-pricing-red">{formatCurrency(promoValid.total || 0)}</span></div>
              </div>
            )}

            <p className="font-mono text-xs text-pricing-muted mb-3 uppercase tracking-widest">Select payment method</p>
            <div className="space-y-3 mb-6">
              <div onClick={() => setModalGateway('flutterwave')} className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${modalGateway === 'flutterwave' ? 'border-pricing-red/50 bg-pricing-card' : 'border-pricing-border bg-pricing-card/50 hover:brightness-110'}`}>
                <img src="/flutterwave-logo.svg" alt="Flutterwave" className="h-8" />
                <span className="font-medium text-sm flex-1 text-pricing-white">Flutterwave</span>
                <Icon name={modalGateway === 'flutterwave' ? 'radio_button_checked' : 'radio_button_unchecked'} className="text-pricing-red text-xl" />
              </div>
              <div onClick={() => setModalGateway('paystack')} className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${modalGateway === 'paystack' ? 'border-pricing-red/50 bg-pricing-card' : 'border-pricing-border bg-pricing-card/50 hover:brightness-110'}`}>
                <img src="/paystack-logo.svg" alt="Paystack" className="h-8" />
                <span className="font-medium text-sm flex-1 text-pricing-white">Paystack</span>
                {gateways && !gateways.paystack.configured && <span className="text-xs bg-black/30 px-2 py-0.5 rounded-full text-pricing-muted">Keys not set</span>}
                <Icon name={modalGateway === 'paystack' ? 'radio_button_checked' : 'radio_button_unchecked'} className="text-pricing-red text-xl" />
              </div>
            </div>

            <Button onClick={handlePayNow} loading={modalLoading} disabled={!!(gateways && ((modalGateway === 'paystack' && !gateways.paystack.configured) || (modalGateway === 'flutterwave' && !gateways.flutterwave.configured)))} className="w-full justify-center bg-pricing-red hover:bg-pricing-red-dark text-white">
              {gateways && modalGateway === 'paystack' && !gateways.paystack.configured ? 'Paystack unavailable — add keys in .env' : gateways && modalGateway === 'flutterwave' && !gateways.flutterwave.configured ? 'Flutterwave unavailable — add keys in .env' : 'Pay Now'}
            </Button>
            {gateways && !gateways.paystack.configured && !gateways.flutterwave.configured && <p className="text-center text-sm text-red-500 mt-2">No payment gateway configured. Contact support.</p>}
            <p className="text-center text-xs text-pricing-muted mt-4">You'll be redirected to the payment portal</p>
          </div>
        </div>
      )}
    </>
  )
}

