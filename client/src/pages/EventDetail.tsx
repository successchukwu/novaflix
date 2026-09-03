import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Icon from '../components/ui/Icon'
import { getEvent, getToken, purchaseEventTicket, getMyTickets } from '../lib/auth'
import VideoPlayer from '../components/features/VideoPlayer'
import { formatCurrency } from '../lib/currency'

export default function EventDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [hasTicket, setHasTicket] = useState(false)
  const [msg, setMsg] = useState('')
  const token = getToken()

  useEffect(() => {
    if (!id) return
    Promise.all([
      getEvent(id),
      token ? getMyTickets(token) : Promise.resolve({ success: false, tickets: [] }),
    ]).then(([e, t]) => {
      if (e.success) setEvent(e.event)
      if (t.success) setHasTicket(t.tickets.some((tk: any) => tk.event_id === id))
      setLoading(false)
    })
  }, [id, token])

  const handlePurchase = async () => {
    if (!token) { navigate('/login'); return }
    if (!id) return
    setPurchasing(true)
    setMsg('')
    const res = await purchaseEventTicket(token, id)
    if (res.success && res.free) {
      setMsg('Ticket acquired! You have access to this event.')
      setHasTicket(true)
    } else if (res.success && res.authorization_url) {
      localStorage.setItem('pendingTicketRef', res.reference)
      window.location.href = res.authorization_url
    } else {
      setMsg(res.error || 'Purchase failed')
    }
    setPurchasing(false)
  }

  // Check for pending verification on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('reference') || localStorage.getItem('pendingTicketRef')
    if (ref && token && id) {
      localStorage.removeItem('pendingTicketRef')
      import('../lib/auth').then(({ verifyTicketPayment }) =>
        verifyTicketPayment(token, ref).then(r => {
          if (r.success) { setHasTicket(true); setMsg('Payment successful! You have access.') }
          else setMsg(r.error || 'Verification failed')
        })
      )
    }
  }, [id, token])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary-container" /></div>
  if (!event) return <div className="min-h-screen flex items-center justify-center"><p className="text-body-lg text-on-surface-variant">Event not found</p></div>

  const isLive = event.status === 'live'
  const isScheduled = event.status === 'scheduled'
  const isEnded = event.status === 'ended'
  const isSoldOut = event.total_tickets > 0 && event.available_tickets <= 0

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-label-md text-on-surface-variant hover:text-on-surface mb-6">
          <Icon name="arrow_back" /> Back
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="relative">
            {event.poster_url ? (
              <img src={event.poster_url} alt={event.title} className="w-full aspect-video object-cover rounded-2xl" />
            ) : (
              <div className="w-full aspect-video bg-surface-container rounded-2xl flex items-center justify-center">
                <Icon name="live_tv" className="text-6xl text-on-surface-variant/20" />
              </div>
            )}
            {isLive && (
              <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-red-500/90 text-white px-3 py-1.5 rounded-full text-label-sm">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />LIVE
              </div>
            )}
          </div>

          <div>
            <h1 className="text-headline-lg font-bold text-on-surface mb-3">{event.title}</h1>

            <div className="flex items-center gap-4 mb-4 text-label-sm text-on-surface-variant">
              <span className="flex items-center gap-1"><Icon name="person" className="text-sm" />{event.creator_name}</span>
              <span className="flex items-center gap-1"><Icon name="schedule" className="text-sm" />{new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            {event.description && (
              <p className="text-body-md text-on-surface-variant mb-6">{event.description}</p>
            )}

            <div className="bg-surface-container rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <span className="font-label-lg text-on-surface">Price</span>
                <span className="text-headline-md font-bold text-primary-container">
                  {event.ticket_price > 0 ? formatCurrency(parseFloat(event.ticket_price)) : 'Free'}
                </span>
              </div>
              {event.total_tickets > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between text-label-sm text-on-surface-variant mb-1">
                    <span>Available Tickets</span>
                    <span>{event.available_tickets} / {event.total_tickets}</span>
                  </div>
                  <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
                    <div className="h-full bg-primary-container rounded-full transition-all" style={{ width: `${((event.total_tickets - event.available_tickets) / event.total_tickets) * 100}%` }} />
                  </div>
                </div>
              )}

              {hasTicket || (isEnded && hasTicket) ? (
                <div className="bg-green-500/10 text-green-400 rounded-xl p-4 text-label-md text-center mb-4">
                  <Icon name="check_circle" className="inline mr-2" />You have a ticket for this event
                </div>
              ) : (
                <button
                  onClick={handlePurchase}
                  disabled={purchasing || isEnded || isSoldOut}
                  className="w-full py-3 bg-primary-container text-on-primary-container rounded-xl font-label-md disabled:opacity-50"
                >
                  {purchasing ? 'Processing...' : isEnded ? 'Event Ended' : isSoldOut ? 'Sold Out' : event.ticket_price > 0 ? 'Purchase Ticket' : 'Get Free Ticket'}
                </button>
              )}
            </div>

            {isLive && hasTicket && event.stream_url && (
              <div className="aspect-video rounded-2xl overflow-hidden bg-black mb-6">
                <VideoPlayer
                  streamUrl={event.stream_url}
                  title={event.title}
                />
              </div>
            )}

            {msg && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl p-4 text-label-md ${msg.includes('successful') || msg.includes('acquired') || msg.includes('access') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {msg}
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
