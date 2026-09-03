import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { verifyPayment, setToken } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'
import Icon from '../components/ui/Icon'
import OnboardingTour from '../components/ui/OnboardingTour'
import { formatCurrency, getCurrencySymbol } from '../lib/currency'
import { useCountdown } from '../hooks/useCountdown'

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [error, setError] = useState('')
  const [paymentData, setPaymentData] = useState<any>(null)

  useEffect(() => {
    const reference = searchParams.get('reference')
    const plan = searchParams.get('plan') || 'basic'
    if (!reference) {
      setStatus('error')
      setError('No payment reference found')
      return
    }

    const token = localStorage.getItem('novaflix-token') || ''
    verifyPayment(token, reference, plan).then((res) => {
      if (res.success) {
        if (res.token) setToken(res.token)
        setPaymentData(res)
        setStatus('success')
        refresh()
      } else {
        setStatus('error')
        setError(res.error || 'Payment verification failed')
      }
    })
  }, [searchParams, refresh])

  const planEndsAt = paymentData?.planEndsAt || paymentData?.subscription?.expires_at
  const { timeLeft, isExpired } = useCountdown(planEndsAt)
  const hasPromo = paymentData?.promoCode
  const currencySymbol = getCurrencySymbol()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-8">
        {status === 'verifying' && (
          <>
            <div className="w-16 h-16 mx-auto mb-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <h1 className="text-headline-lg mb-2">Verifying Payment</h1>
            <p className="text-on-surface-variant">Please wait while we confirm your subscription...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <Icon name="check_circle" className="text-green-500 text-6xl mx-auto mb-6" />
            <h1 className="text-headline-lg mb-2">Payment Successful!</h1>
            <p className="text-on-surface-variant mb-8">Your plan has been upgraded. Welcome to <img src="/leter-mark-logo.png" alt="" className="h-4 w-auto inline align-middle" />!</p>

            {hasPromo && planEndsAt && (
              <div className="mb-8 p-6 bg-surface-container-high rounded-2xl border border-primary-container/30 text-left">
                <h2 className="text-headline-sm font-bold text-primary mb-4 flex items-center gap-2">
                  <Icon name="card_giftcard" className="text-primary" /> Promo Applied
                </h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Promo Code</span>
                    <span className="font-mono font-bold text-primary">{paymentData.promoCode}</span>
                  </div>
                  {paymentData.originalAmount && paymentData.discount && (
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Original Price</span>
                      <span className="line-through text-on-surface-variant/60">{formatCurrency(paymentData.originalAmount)}</span>
                    </div>
                  }
                  {paymentData.discount && (
                    <div className="flex justify-between text-green-400">
                      <span className="text-on-surface-variant">Discount</span>
                      <span className="font-bold">-{formatCurrency(paymentData.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg pt-2 border-t border-white/10">
                    <span className="text-on-surface">You Paid</span>
                    <span className="text-primary">{formatCurrency(paymentData.discountedAmount || paymentData.amount || 0)}</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Icon name="schedule" className="text-on-surface-variant" size="md" />
                    <span className="text-on-surface-variant">Plan expires</span>
                  </div>
                  <div className="font-mono text-2xl text-primary tabular-nums">
                    {isExpired ? (
                      <span className="text-red-400">Expired</span>
                    ) : (
                      <>
                        {timeLeft.days > 0 && <span>{timeLeft.days}d </span>}
                        {timeLeft.hours > 0 && <span>{timeLeft.hours}h </span>}
                        {timeLeft.minutes > 0 && <span>{timeLeft.minutes}m </span>}
                        <span>{timeLeft.seconds}s</span>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-on-surface-variant/60 mt-1">
                    {new Date(planEndsAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </div>
            )}

            <button
              id="tour-start-watching"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 px-8 py-3 bg-primary-container text-on-primary-container rounded-lg font-bold hover:brightness-110"
            >
              Start Watching
              <Icon name="arrow_forward" />
            </button>
            <OnboardingTour
              storageKey="novaflix-onboarding-purchase"
              steps={[
                {
                  targetSelector: '#tour-start-watching',
                  title: 'You\'re All Set!',
                  description: 'Your premium plan is active. Click here to start exploring ad-free streaming, higher quality, and exclusive content.',
                  placement: 'top',
                },
              ]}
            />
          </>
        )}

        {status === 'error' && (
          <>
            <Icon name="error" className="text-red-500 text-6xl mx-auto mb-6" />
            <h1 className="text-headline-lg mb-2">Payment Issue</h1>
            <p className="text-on-surface-variant mb-2">{error}</p>
            <p className="text-body-sm text-on-surface-variant mb-8">If your payment was deducted, contact support with your reference: {searchParams.get('reference')}</p>
            <button
              onClick={() => navigate('/pricing')}
              className="inline-flex items-center gap-2 px-8 py-3 bg-primary-container text-on-primary-container rounded-lg font-bold hover:brightness-110"
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
