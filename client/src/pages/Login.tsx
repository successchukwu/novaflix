import { useState } from 'react'
import { useNavigate, useSearchParams, Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../lib/AuthContext'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Icon from '../components/ui/Icon'
import LoginBackdrop from '../components/features/LoginBackdrop'
import SocialLoginButtons from '../components/social/SocialLoginButtons'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') || '/home'
  const { user, loading: authLoading, login, register, verifyEmail, verifyLogin, resendVerification } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [needsVerify, setNeedsVerify] = useState(false)
  const [verifyReason, setVerifyReason] = useState<'email' | 'new-device' | 'inactive' | 'unknown-location'>('email')
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  if (user && !authLoading) {
    return <Navigate to={redirect} replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = isSignUp
      ? await register(email, password, name || undefined)
      : await login(email, password)

    setLoading(false)

    if (result.success && !result.userId) {
      // Role-based routing after successful login
      const role = (result as any).user?.role
      if (role === 'creator') {
        navigate(redirect)
      } else if (role === 'admin') {
        navigate('/admin')
      } else {
        navigate(redirect)
      }
    } else if ('needsLoginVerification' in result && result.needsLoginVerification) {
      const reason = (result as { reason?: 'new-device' | 'inactive' | 'unknown-location' }).reason
      setVerifyReason(reason || 'new-device')
      setNeedsVerify(true)
    } else if (result.needsVerification || (result.success && result.userId)) {
      setVerifyReason('email')
      setNeedsVerify(true)
    } else {
      setError(result.error || 'Something went wrong')
    }
  }

  const handleVerify = async () => {
    setError('')
    setVerifying(true)
    const result = verifyReason === 'email' ? await verifyEmail(code) : await verifyLogin(code)
    setVerifying(false)
    if (result.success) {
      navigate(redirect)
    } else {
      setError(result.error || 'Invalid code')
    }
  }

  const handleResend = async () => {
    setError('')
    const result = await resendVerification()
    if (!result.success) {
      setError(result.error || 'Failed to resend')
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-2 border-primary-container border-t-transparent rounded-full" />
      </div>
    )
  }

  if (needsVerify) {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
        <LoginBackdrop />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black z-[1]" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-md px-4"
        >
          <div className="glass-panel rounded-xl p-8 shadow-2xl border border-outline-variant/20">
            <div className="text-center mb-8">
              <h1 className="text-headline-md mb-2">{verifyReason === 'email' ? 'Verify your email' : 'Confirm it\'s you'}</h1>
              <p className="text-body-md text-on-surface-variant">
                {verifyReason === 'email' && <>6-digit code sent to <span className="text-primary">{email}</span></>}
                {verifyReason === 'new-device' && <>We noticed a sign-in from a new device or network. A code was sent to <span className="text-primary">{email}</span>.</>}
                {verifyReason === 'inactive' && <>You haven't signed in for a while, so we want to confirm it's you. A code was sent to <span className="text-primary">{email}</span>.</>}
                {verifyReason === 'unknown-location' && <>We noticed a sign-in from an unfamiliar location. A code was sent to <span className="text-primary">{email}</span>.</>}
              </p>
            </div>
            {error && (
              <div className="bg-error-container/20 border border-error/20 text-error text-sm rounded-xl px-4 py-3 mb-4">{error}</div>
            )}
            <div className="space-y-4">
              <input
                type="text"
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value)}
                maxLength={6}
                className="w-full bg-surface-container-low border border-outline-variant/30 text-on-surface rounded-lg py-4 px-4 text-center text-2xl tracking-[0.5em] font-bold focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container"
              />
              <Button className="w-full" size="lg" loading={verifying} onClick={handleVerify} disabled={code.length !== 6}>
                {verifyReason === 'email' ? 'Verify Email' : 'Verify & Sign In'}
              </Button>
              <button onClick={handleResend} className="w-full text-sm text-on-surface-variant hover:text-primary transition-colors font-label-md">
                Resend code
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
      <LoginBackdrop />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-[480px] px-margin-mobile"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src="/leter-mark-logo.png" alt="" className="mb-2" style={{ height: '400px', width: '800px', objectFit: 'contain' }} />
          <p className="font-label-md text-label-md text-on-surface-variant opacity-70 tracking-widest uppercase" style={{ position: 'relative', bottom: '120px' }}>The Cinematic Experience</p>
        </div>

        {/* Glass card */}
        <div className="glass-panel rounded-xl p-8 md:p-12 shadow-2xl border border-outline-variant/20" style={{ position: 'relative', bottom: '120px' }}>
          <div className="mb-8">
            <h2 className="text-headline-lg mb-2">Welcome back</h2>
            <p className="text-body-md text-on-surface-variant">Sign in to your portal to resume discovery.</p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-error-container/20 border border-error/20 text-error text-sm rounded-xl px-4 py-3 mb-4"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignUp && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <label className="font-label-md text-label-md text-on-surface opacity-80 ml-1">Display Name</label>
                <div className="relative group">
                  <input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 text-on-surface rounded-lg py-4 px-4 focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container font-body-md transition-all placeholder:text-on-surface-variant/40"
                  />
                </div>
              </motion.div>
            )}

            <div className="space-y-2">
              <label className="font-label-md text-label-md text-on-surface opacity-80 ml-1">Email Address</label>
              <div className="relative group transition-all duration-300 rounded-lg">
                <input
                  type="email"
                  placeholder="name@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-surface-container-low border border-outline-variant/30 text-on-surface rounded-lg py-4 px-4 focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container font-body-md transition-all placeholder:text-on-surface-variant/40"
                />
                <Icon name="alternate_email" size="sm" className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40 group-focus-within:text-primary-container transition-colors" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="font-label-md text-label-md text-on-surface opacity-80">Password</label>
                {!isSignUp && (
                  <Link to="/forgot-password" className="font-label-sm text-label-sm text-primary-container hover:underline transition-all cursor-pointer">Forgot Password?</Link>
                )}
              </div>
              <div className="relative group transition-all duration-300 rounded-lg">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={isSignUp ? 'Create a password' : 'Enter your password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-surface-container-low border border-outline-variant/30 text-on-surface rounded-lg py-4 px-4 focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container font-body-md transition-all placeholder:text-on-surface-variant/40 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40 hover:text-on-surface transition-colors p-2"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'visibility_off' : 'visibility'} size="sm" />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-primary-container text-on-primary-container font-headline-md text-headline-md rounded-lg shadow-lg hover:brightness-110 active:scale-[0.98] transition-all duration-200 mt-2 disabled:opacity-50"
            >
              {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="relative my-10 flex items-center">
            <div className="flex-grow border-t border-outline-variant/20" />
            <span className="mx-4 font-label-sm text-label-sm text-on-surface-variant/50">OR CONTINUE WITH</span>
            <div className="flex-grow border-t border-outline-variant/20" />
          </div>

          <SocialLoginButtons redirect={redirect} />

          <div className="mt-8 text-center">
            <p className="text-body-md text-on-surface-variant">
              {isSignUp ? 'Already have an account?' : "New to "}<img src="/leter-mark-logo.png" alt="" className="h-4 w-auto inline align-middle" />{"?"}{' '}
              <button
                type="button"
                onClick={() => { setIsSignUp(!isSignUp); setError('') }}
                className="text-primary-container font-semibold hover:underline"
              >
                {isSignUp ? 'Sign In' : 'Join the Nexus'}
              </button>
            </p>
          </div>
        </div>

        <div className="mt-8 flex justify-center gap-8 opacity-40">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(83,224,118,0.6)]" />
            <span className="font-label-sm text-label-sm text-on-surface">System Operational</span>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="lock" size="sm" />
            <span className="font-label-sm text-label-sm text-on-surface">Encrypted Portal</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
