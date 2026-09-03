import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import Icon from '../components/ui/Icon'
import SocialLoginButtons from '../components/social/SocialLoginButtons'
import { useToast } from '../components/ui/Toast'
import { getClaimPreview, startClaim, socialOAuthUrl } from '../lib/auth'
import { formatCurrency } from '../lib/currency'

export default function ClaimPreview() {
  const { tmdbPersonId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [preview, setPreview] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!tmdbPersonId) return
    getClaimPreview(tmdbPersonId).then((res) => {
      if (res?.success && res.preview) setPreview(res.preview)
      setLoading(false)
    })
  }, [tmdbPersonId])

  const handleSelect = async (provider: string) => {
    setStarting(true)
    try {
      const person = preview?.person
      const res = await startClaim(Number(tmdbPersonId), person?.name || '', provider)
      if (!res?.success) {
        if (res?.claimId) {
          // Claim already in progress — resume verification
          window.location.href = `${socialOAuthUrl(provider)}?claimId=${res.claimId}&redirect=${encodeURIComponent(`/creator/claim/status/${res.claimId}`)}`
          return
        }
        toast.error(res?.error || 'Failed to start claim')
        setStarting(false)
        return
      }
      const claimId = res.claimId
      window.location.href = `${socialOAuthUrl(provider)}?claimId=${claimId}&redirect=${encodeURIComponent(`/creator/claim/status/${claimId}`)}`
    } catch {
      toast.error('Failed to start claim')
      setStarting(false)
    }
  }

  const person = preview?.person
  const filmCount = preview?.credits
    ? (preview.credits.cast?.length || 0) + (preview.credits.crew?.length || 0)
    : 0
  const earnings = preview?.estimatedEarnings

  return (
    <Layout>
      <div className="min-h-screen px-4 md:px-8 py-12">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-body-md text-on-surface-variant hover:text-on-surface mb-8"
          >
            <Icon name="arrow_back" size="sm" /> Back
          </button>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-2 border-primary-container border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-outline/20 overflow-hidden bg-surface-container/40">
                <div className="flex gap-5 p-6">
                  {person?.profile_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                      alt={person?.name}
                      className="w-24 h-32 rounded-xl object-cover ring-2 ring-white/10"
                    />
                  ) : (
                    <div className="w-24 h-32 rounded-xl bg-surface-container flex items-center justify-center">
                      <Icon name="person" className="w-12 h-12 text-on-surface-variant/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h1 className="text-headline-lg font-bold text-on-surface">{person?.name || 'Profile'}</h1>
                    <p className="text-body-md text-on-surface-variant mt-1">
                      {person?.known_for_department || 'Known for'} · {filmCount} titles on TMDB
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                      <div className="rounded-xl bg-surface-container px-3 py-2">
                        <p className="text-label-lg text-on-surface">{filmCount}</p>
                        <p className="text-label-sm text-on-surface-variant">Linked titles</p>
                      </div>
                      <div className="rounded-xl bg-surface-container px-3 py-2">
                        <p className="text-label-lg text-on-surface">{formatCurrency(Number(earnings || 0))}</p>
                        <p className="text-label-sm text-on-surface-variant">Est. monthly</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <h2 className="text-title-lg font-semibold text-on-surface mb-2">Verify your identity</h2>
                <p className="text-body-md text-on-surface-variant mb-6">
                  Connect a verified social account to prove you are this person. Choose a provider to continue.
                </p>
                <SocialLoginButtons onStart={handleSelect} disabled={starting} />
                {starting && (
                  <p className="text-center text-body-sm text-on-surface-variant mt-4">
                    Starting verification…
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}
