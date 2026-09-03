import { useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import Icon from '../components/ui/Icon'
import Button from '../components/ui/Button'

export default function ClaimVerify() {
  const navigate = useNavigate()
  return (
    <Layout>
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="text-center max-w-xl">
          <Icon name="verified_user" className="w-16 h-16 mx-auto mb-4 text-primary" />
          <h1 className="text-2xl font-bold">Claim Verification</h1>
          <p className="text-on-surface-variant mt-2">
            Verification happens during the claim flow. Search for your profile to begin.
          </p>
          <Button onClick={() => navigate('/creator/claim/start')} className="mt-6">
            Search Your Profile
          </Button>
        </div>
      </div>
    </Layout>
  )
}
