import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Icon from '../components/ui/Icon'
import { getEvents, getToken, purchaseEventTicket, getMyTickets } from '../lib/auth'
import { formatCurrency } from '../lib/currency'

export default function RedCarpet() {
  const [events, setEvents] = useState<any[]>([])
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [purchasingId, setPurchasingId] = useState<string | null>(null)
  const navigate = useNavigate()
  const token = getToken()

  useEffect(() => {
    Promise.all([
      getEvents(false),
      token ? getMyTickets(token) : Promise.resolve({ success: false, tickets: [] }),
    ]).then(([e, t]) => {
      if (e.success) setEvents(e.events)
      if (t.success) setTickets(t.tickets)
      setLoading(false)
    })
  }, [token])

  const sortedEvents = useMemo(() => {
    const upcoming = events.filter(e => e.status === 'scheduled' || e.status === 'live').sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
    const past = events.filter(e => e.status === 'ended')
    return { upcoming, past }
  }, [events])

  const hasTicket = (eventId: string) => tickets.some(t => t.event_id === eventId)

  const handlePurchase = async (eventId: string) => {
    if (!token) { navigate('/login'); return }
    setPurchasingId(eventId)
    const res = await purchaseEventTicket(token, eventId)
    if (res.success && res.free) {
      setTickets(prev => [...prev, { event_id: eventId }])
      const r = await getEvents(false)
      if (r.success) setEvents(r.events)
    } else if (res.success && res.authorization_url) {
      localStorage.setItem('pendingTicketRef', res.reference)
      window.location.href = res.authorization_url
    }
    setPurchasingId(null)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary-container" /></div>

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="relative h-[70dvh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-red-900/40 via-red-800/20 to-surface" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(220,38,38,0.15) 0%, transparent 70%)' }} />
        <div className="relative text-center px-4">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }}>
            <Icon name="star" className="text-6xl text-yellow-500 mb-4" />
            <h1 className="text-display-md md:text-display-lg font-bold text-on-surface mb-3">Virtual Red Carpet</h1>
            <p className="text-body-lg text-on-surface-variant max-w-xl mx-auto">Exclusive premieres, live events, and behind-the-scenes access. Get your front-row seat.</p>
          </motion.div>
        </div>
      </div>

      <div className="px-margin-mobile md:px-margin-desktop pb-nav">
        <div className="max-w-6xl mx-auto">
          {/* Upcoming events */}
          {sortedEvents.upcoming.length > 0 && (
            <section className="mb-16">
              <h2 className="text-title-lg font-bold text-on-surface mb-6 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />Upcoming Premieres
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedEvents.upcoming.map((ev, i) => (
                  <motion.div
                    key={ev.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-surface-container rounded-2xl overflow-hidden group hover:ring-2 hover:ring-primary-container/50 transition-all"
                  >
                    {ev.poster_url ? (
                      <img src={ev.poster_url} alt={ev.title} className="w-full aspect-video object-cover" />
                    ) : (
                      <div className="w-full aspect-video bg-surface flex items-center justify-center">
                        <Icon name="movie" className="text-4xl text-on-surface-variant/30" />
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        {ev.status === 'live' && <span className="flex items-center gap-1 text-label-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />LIVE</span>}
                        <span className="text-label-xs text-on-surface-variant">{new Date(ev.event_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      </div>
                      <h3 className="font-label-lg text-on-surface mb-1">{ev.title}</h3>
                      <p className="text-label-sm text-on-surface-variant mb-1">by {ev.creator_name}</p>
                      <p className="text-body-sm text-on-surface-variant line-clamp-2 mb-3">{ev.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="font-label-md text-on-surface">{ev.ticket_price > 0 ? formatCurrency(parseFloat(ev.ticket_price)) : 'Free'}</span>
                        {hasTicket(ev.id) ? (
                          <span className="flex items-center gap-1 text-label-sm text-green-400"><Icon name="check_circle" className="text-sm" />Got Ticket</span>
                        ) : (
                          <button
                            onClick={() => handlePurchase(ev.id)}
                            disabled={purchasingId === ev.id}
                            className="px-4 py-2 bg-primary-container text-on-primary-container rounded-xl font-label-sm disabled:opacity-50"
                          >
                            {purchasingId === ev.id ? '...' : ev.ticket_price > 0 ? 'Get Ticket' : 'RSVP Free'}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {sortedEvents.upcoming.length === 0 && sortedEvents.past.length === 0 && (
            <div className="text-center py-16">
              <Icon name="star_border" className="text-5xl text-on-surface-variant/20 mb-4" />
              <p className="text-body-lg text-on-surface-variant">No events scheduled yet</p>
              <p className="text-body-sm text-on-surface-variant/60 mt-1">Check back soon for upcoming premieres</p>
            </div>
          )}

          {/* Past events */}
          {sortedEvents.past.length > 0 && (
            <section>
              <h2 className="text-title-lg font-bold text-on-surface mb-6">Past Premieres</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {sortedEvents.past.map(ev => (
                  <div key={ev.id} className="bg-surface-container rounded-xl overflow-hidden opacity-60 hover:opacity-100 transition-opacity cursor-pointer" onClick={() => navigate(`/events/${ev.id}`)}>
                    {ev.poster_url ? (
                      <img src={ev.poster_url} alt={ev.title} className="w-full aspect-video object-cover" />
                    ) : (
                      <div className="w-full aspect-video bg-surface flex items-center justify-center"><Icon name="movie" className="text-2xl text-on-surface-variant/30" /></div>
                    )}
                    <div className="p-2">
                      <p className="text-label-sm text-on-surface truncate">{ev.title}</p>
                      <p className="text-label-xs text-on-surface-variant">{new Date(ev.event_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
