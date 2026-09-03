import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../lib/AuthContext'
import { API_BASE } from '../../lib/config'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import LoginBackdrop from '../../components/features/LoginBackdrop'
import PasswordField from '../../components/auth/PasswordField'
import SocialLoginButtons from '../../components/social/SocialLoginButtons'

export default function ViewerSignup() {
  const navigate = useNavigate()
  const { user, loading: authLoading, login, register, verifyEmail, resendVerification } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [needsVerify, setNeedsVerify] = useState(false)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [userId, setUserId] = useState('')
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    if (user && !authLoading && !needsVerify) {
      navigate('/home', { replace: true })
    }
  }, [user, authLoading, needsVerify, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    const result = await register(email, password, name || undefined)
    setLoading(false)

    if (result.success && result.userId) {
      setUserId(result.userId)
      setNeedsVerify(true)
    } else {
      setError(result.error || 'Registration failed')
    }
  }

  const handleVerify = async () => {
    setError('')
    setVerifying(true)
    const result = await verifyEmail(code)
    setVerifying(false)

    if (result.success) {
      setRedirecting(true)
      await new Promise(r => setTimeout(r, 800))
      navigate('/home')
    } else {
      setError(result.error || 'Invalid code')
    }
  }

  const handleResend = async () => {
    setError('')
    const result = await resendVerification()
    if (!result.success) {
      setError(result.error || 'Failed to resend code')
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
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary-container/10 mb-4 mx-auto ring-1 ring-primary-container/20">
                <Icon name="mail" className="text-primary-container text-4xl" />
              </div>
              <h1 className="text-headline-md mb-2">Verify your email</h1>
              <p className="text-body-md text-on-surface-variant">
                6-digit code sent to <span className="text-primary">{email}</span>
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
              <Button className="w-full" size="lg" loading={verifying || redirecting} onClick={handleVerify} disabled={code.length !== 6}>
                {redirecting ? 'Redirecting...' : 'Verify Email'}
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
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black z-[1]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-[480px] px-4"
      >
        <div className="flex flex-col items-center mb-10">
          <img src="/leter-mark-logo.png" alt="NovaFlix" className="h-12 w-auto mb-2" />
          <p className="font-label-md text-label-md text-on-surface-variant opacity-70 tracking-widest uppercase">The Cinematic Experience</p>
        </div>

        <div className="glass-panel rounded-xl p-8 md:p-12 shadow-2xl border border-outline-variant/20">
          <div className="mb-8">
            <h2 className="text-headline-lg mb-2">Join NovaFlix</h2>
            <p className="text-body-md text-on-surface-variant">Create your account to start watching.</p>
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
            <div className="space-y-2">
              <label className="font-label-md text-label-md text-on-surface opacity-80 ml-1">Display Name</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/30 text-on-surface rounded-lg py-4 px-4 focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container font-body-md transition-all placeholder:text-on-surface-variant/40"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-label-md text-label-md text-on-surface opacity-80 ml-1">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  placeholder="name@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-surface-container-low border border-outline-variant/30 text-on-surface rounded-lg py-4 px-4 focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container font-body-md transition-all placeholder:text-on-surface-variant/40"
                />
                <Icon name="alternate_email" size="sm" className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40" />
              </div>
            </div>

            <PasswordField
              value={password}
              onChange={setPassword}
              placeholder="Create a password (min 8 characters)"
              showStrength
            />

            <PasswordField
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Confirm your password"
              showStrength={false}
              error={confirmPassword && password !== confirmPassword ? 'Passwords do not match' : undefined}
            />

            <button
              type="submit"
              disabled={loading || !email || !password || !confirmPassword}
              className="w-full py-4 bg-primary-container text-on-primary-container font-headline-md text-headline-md rounded-lg shadow-lg hover:brightness-110 active:scale-[0.98] transition-all duration-200 mt-2 disabled:opacity-50"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div className="relative my-10 flex items-center">
            <div className="flex-grow border-t border-outline-variant/20" />
            <span className="mx-4 font-label-sm text-label-sm text-on-surface-variant/50">OR CONTINUE WITH</span>
            <div className="flex-grow border-t border-outline-variant/20" />
          </div>

          <button
            type="button"
            onClick={() => {
              window.location.href = `${API_BASE}/auth/google?redirect=/home`
            }}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg bg-surface-container-high border border-outline-variant/20 hover:bg-surface-container-highest transition-all duration-150 active:scale-95"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span className="font-label-md text-label-md text-on-surface">Sign up with Google</span>
          </button>

          <div className="mt-4">
            <SocialLoginButtons redirect="/home" exclude={['google']} />
          </div>

          <div className="mt-8 text-center">
            <p className="text-body-md text-on-surface-variant">
              Already have an account?{' '}
              <Link to="/auth/login" className="text-primary-container font-semibold hover:underline">
                Sign In
              </Link>
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
