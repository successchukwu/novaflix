import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import Icon from '../components/ui/Icon'
import Button from '../components/ui/Button'
import SocialLoginButtons from '../components/social/SocialLoginButtons'
import { getClaimStatus, verifyClaimSocial } from '../lib/auth'

export default function ClaimStatus() {
  const { claimId = '' } = useParams()
  const navigate = useNavigate()
  const [claim, setClaim] = useState<any>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const verified = useRef(false)

  const check = useCallback(async () => {
    const res = await getClaimStatus(claimId)
    if (res?.success) setClaim(res.claim)
  }, [claimId])

  useEffect(() => {
    if (!claimId) return
    check()
    const t = setInterval(check, 5000)
    return () => clearInterval(t)
  }, [claimId, check])

  // Once the user returns from social OAuth, auto-attach their verified identity
  useEffect(() => {
    if (!claim || verified.current) return
    if (claim.claim_status === 'approved') return
    const provider = claim.verification_provider
    if (!provider) return
    if (claim.kyc_status === 'approved') return

    verified.current = true
    verifyClaimSocial(claimId, provider).then((res) => {
      if (!res?.success) setVerifyError(res?.error || 'Verification failed')
      setTimeout(check, 1500)
    })
  }, [claim, claimId, check])

  useEffect(() => {
    if (claim?.claim_status === 'approved') {
      navigate('/creator/claim/success', { replace: true })
    }
  }, [claim, navigate])

  const denied = claim?.claim_status === 'denied'
  const providerName = claim?.verification_provider || ''

  return (
    <Layout>
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="text-center max-w-xl">
          {claim ? (
            <>
              {claim.claim_status === 'approved' ? (
                <>
                  <Icon name="check_circle" className="w-16 h-16 mx-auto mb-4 text-green-500" />
                  <h1 className="text-2xl font-bold">Approved! Redirecting…</h1>
                </>
              ) : denied ? (
                <>
                  <Icon name="cancel" className="w-16 h-16 mx-auto mb-4 text-red-500" />
                  <h1 className="text-2xl font-bold">Claim Declined</h1>
                  <p className="text-on-surface-variant mt-2">
                    Your verification could not be confirmed. Please contact support if you believe this is a mistake.
                  </p>
                  <Button onClick={() => navigate('/creator/claim/start')} className="mt-6">Try Again</Button>
                </>
              ) : (
                <div className="flex items-center justify-center flex-col">
                  <div className="animate-spin w-12 h-12 border-2 border-primary-container border-t-transparent rounded-full mb-6" />
                  <h1 className="text-2xl font-bold">Verifying your claim</h1>
                  <p className="text-on-surface-variant mt-2">
                    {providerName
                      ? `Confirming your ${providerName} identity to approve this creator profile claim.`
                      : 'Your claim is being reviewed for approval.'}
                  </p>
                  {verifyError ? (
                    <div className="mt-6 w-full max-w-sm">
                      <p className="text-body-sm text-red-500 mb-3">{verifyError}</p>
                      <SocialLoginButtons claimId={claimId} redirect={`/creator/claim/status/${claimId}`} />
                    </div>
                  ) : (
                    <p className="text-body-sm text-on-surface-variant/60 mt-6">This usually takes a few seconds…</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="animate-spin w-8 h-8 border-2 border-primary-container border-t-transparent rounded-full mx-auto mb-4" />
              <h1 className="text-2xl font-bold">Loading claim status</h1>
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}
