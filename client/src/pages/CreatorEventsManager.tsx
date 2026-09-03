import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Icon from '../components/ui/Icon'
import { getToken, getMyEvents, createEvent, updateEvent } from '../lib/auth'
import { formatCurrency } from '../lib/currency'

export default function CreatorEventsManager() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [ticketPrice, setTicketPrice] = useState('')
  const [totalTickets, setTotalTickets] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [streamUrl, setStreamUrl] = useState('')

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    getMyEvents(token).then(r => { if (r.success) setEvents(r.events); setLoading(false) })
  }, [])

  const handleSubmit = async () => {
    const token = getToken()
    if (!token || !title || !eventDate) return
    const data = { title, description, eventDate: new Date(eventDate).toISOString(), ticketPrice: parseFloat(ticketPrice) || 0, totalTickets: parseInt(totalTickets) || 0, posterUrl, streamUrl }
    if (editId) {
      await updateEvent(token, editId, data)
    } else {
      await createEvent(token, data)
    }
    resetForm()
    const r = await getMyEvents(token)
    if (r.success) setEvents(r.events)
  }

  const handleEdit = (ev: any) => {
    setEditId(ev.id); setTitle(ev.title); setDescription(ev.description || '')
    setEventDate(new Date(ev.event_date).toISOString().slice(0, 16))
    setTicketPrice(String(ev.ticket_price)); setTotalTickets(String(ev.total_tickets))
    setPosterUrl(ev.poster_url || ''); setStreamUrl(ev.stream_url || ''); setShowForm(true)
  }

  const handleStatusChange = async (id: string, status: string) => {
    const token = getToken()
    if (!token) return
    await updateEvent(token, id, { status })
    const r = await getMyEvents(token)
    if (r.success) setEvents(r.events)
  }

  const resetForm = () => {
    setShowForm(false); setEditId(null); setTitle(''); setDescription('')
    setEventDate(''); setTicketPrice(''); setTotalTickets(''); setPosterUrl(''); setStreamUrl('')
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary-container" /></div>

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-headline-lg font-bold text-on-surface">Live Events</h1>
          <button onClick={() => { setShowForm(!showForm); if (!showForm) resetForm() }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-container text-on-primary-container rounded-xl font-label-md">
            <Icon name="add" /> New Event
          </button>
        </div>

        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-surface-container rounded-2xl p-6 mb-8">
            <h2 className="font-label-lg mb-4 text-on-surface">{editId ? 'Edit Event' : 'Create Event'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
              <input value={eventDate} onChange={e => setEventDate(e.target.value)} type="datetime-local" className="bg-surface px-4 py-3 rounded-xl text-on-surface border border-outline/20 focus:outline-none focus:border-primary-container/50" />
              <input value={ticketPrice} onChange={e => setTicketPrice(e.target.value)} type="number" placeholder="Ticket price — 0 for free" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
              <input value={totalTickets} onChange={e => setTotalTickets(e.target.value)} type="number" placeholder="Total tickets (0 for unlimited)" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
              <input value={posterUrl} onChange={e => setPosterUrl(e.target.value)} placeholder="Poster URL" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
              <input value={streamUrl} onChange={e => setStreamUrl(e.target.value)} placeholder="Stream URL (YouTube/Vimeo embed)" className="bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50" />
            </div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" rows={3} className="w-full bg-surface px-4 py-3 rounded-xl text-on-surface placeholder-on-surface-variant/50 border border-outline/20 focus:outline-none focus:border-primary-container/50 mb-4" />
            <div className="flex gap-3">
              <button onClick={handleSubmit} className="px-6 py-2.5 bg-primary-container text-on-primary-container rounded-xl font-label-md">{editId ? 'Update' : 'Create'} Event</button>
              <button onClick={resetForm} className="px-6 py-2.5 bg-outline/10 text-on-surface rounded-xl font-label-md">Cancel</button>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map(ev => (
            <div key={ev.id} className="bg-surface-container rounded-2xl overflow-hidden">
              {ev.poster_url && <img src={ev.poster_url} alt={ev.title} className="w-full h-40 object-cover" />}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-label-lg text-on-surface">{ev.title}</h3>
                  <span className={`text-label-xs px-2 py-0.5 rounded-full ${ev.status === 'live' ? 'bg-green-500/20 text-green-400' : ev.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' : ev.status === 'ended' ? 'bg-outline/20 text-on-surface-variant' : 'bg-red-500/20 text-red-400'}`}>{ev.status}</span>
                </div>
                <p className="text-label-sm text-on-surface-variant mb-2">{new Date(ev.event_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                <p className="text-body-sm text-on-surface-variant mb-3 line-clamp-2">{ev.description}</p>
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-on-surface">{ev.ticket_price > 0 ? formatCurrency(parseFloat(ev.ticket_price)) : 'Free'}</span>
                  <div className="flex gap-1">
                    {ev.status === 'scheduled' && <button onClick={() => handleStatusChange(ev.id, 'live')} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-green-500/20 text-green-400" aria-label="Go live"><Icon name="play_arrow" /></button>}
                    {(ev.status === 'scheduled' || ev.status === 'live') && <button onClick={() => handleStatusChange(ev.id, 'cancelled')} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-red-400" aria-label="Cancel"><Icon name="cancel" /></button>}
                    <button onClick={() => handleEdit(ev)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-outline/10" aria-label="Edit"><Icon name="edit" className="text-on-surface-variant" /></button>
                  </div>
                </div>
                {ev.total_tickets > 0 && (
                  <p className="text-label-xs text-on-surface-variant mt-2">{ev.available_tickets} / {ev.total_tickets} tickets left</p>
                )}
              </div>
            </div>
          ))}
          {events.length === 0 && (
            <div className="col-span-full text-center py-12">
              <Icon name="event" className="text-4xl text-on-surface-variant/30 mb-3" />
              <p className="text-body-md text-on-surface-variant">No events created yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
