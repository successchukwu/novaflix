import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Icon from '../components/ui/Icon'
import { getEvents, getToken } from '../lib/auth'
import { formatCurrency } from '../lib/currency'

export default function LiveEvents() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'upcoming' | 'past'>('upcoming')
  const navigate = useNavigate()

  useEffect(() => {
    getEvents(filter === 'past').then(r => {
      if (r.success) setEvents(r.events)
      setLoading(false)
    })
  }, [filter])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary-container" /></div>

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-headline-lg font-bold text-on-surface">Live Events</h1>
          <div className="flex bg-surface-container rounded-xl p-1">
            <button onClick={() => setFilter('upcoming')} className={`px-4 py-2 rounded-lg text-label-sm transition-colors ${filter === 'upcoming' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'}`}>Upcoming</button>
            <button onClick={() => setFilter('past')} className={`px-4 py-2 rounded-lg text-label-sm transition-colors ${filter === 'past' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'}`}>Past</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((ev, i) => (
            <motion.button
              key={ev.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => navigate(`/events/${ev.id}`)}
              className="bg-surface-container rounded-2xl overflow-hidden text-left hover:ring-2 hover:ring-primary-container/50 transition-all"
            >
              {ev.poster_url ? (
                <img src={ev.poster_url} alt={ev.title} className="w-full aspect-video object-cover" />
              ) : (
                <div className="w-full aspect-video bg-surface flex items-center justify-center">
                  <Icon name="live_tv" className="text-4xl text-on-surface-variant/30" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  {ev.status === 'live' && <span className="flex items-center gap-1 text-label-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />LIVE</span>}
                  {ev.status === 'scheduled' && <span className="text-label-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">Scheduled</span>}
                </div>
                <h3 className="font-label-lg text-on-surface mb-1">{ev.title}</h3>
                <p className="text-label-sm text-on-surface-variant mb-2">
                  <Icon name="schedule" className="inline text-sm mr-1" />
                  {new Date(ev.event_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {ev.creator_name && <p className="text-label-sm text-on-surface-variant mb-2">by {ev.creator_name}</p>}
                <p className="text-body-sm text-on-surface-variant line-clamp-2 mb-3">{ev.description}</p>
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-on-surface">
                    {ev.ticket_price > 0 ? formatCurrency(parseFloat(ev.ticket_price)) : 'Free'}
                  </span>
                  {ev.total_tickets > 0 && (
                    <span className="text-label-xs text-on-surface-variant">{ev.available_tickets} left</span>
                  )}
                </div>
              </div>
            </motion.button>
          ))}
          {events.length === 0 && (
            <div className="col-span-full text-center py-16">
              <Icon name="event_busy" className="text-5xl text-on-surface-variant/20 mb-4" />
              <p className="text-body-lg text-on-surface-variant">No {filter} events</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
