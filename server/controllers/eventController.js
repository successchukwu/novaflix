import { v4 as uuidv4 } from 'uuid'
import {
  createLiveEvent, updateLiveEvent, getLiveEvents, getLiveEventById, getLiveEventsByCreator,
  purchaseEventTicket, getUserTickets, getEventTicketCount,
  createTransaction, getTransactionByReference, updateTransactionByReference,
} from '../db.js'
import pool from '../config/database.js'

let _paystack = null
async function getPaystack() {
  if (_paystack) return _paystack
  if (!process.env.PAYSTACK_SECRET_KEY) return null
  try {
    const paystackModule = await import('paystack-api')
    const PaystackAPI = paystackModule.default || paystackModule
    _paystack = new PaystackAPI(process.env.PAYSTACK_SECRET_KEY)
    return _paystack
  } catch { return null }
}

const CALLBACK_URL = process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:3000'

// --- Event CRUD (creator) ---
export async function createEvent(req, res) {
  try {
    const { title, description, eventDate, ticketPrice, totalTickets, posterUrl, streamUrl } = req.body
    if (!title || !eventDate) return res.status(400).json({ error: 'Title and event date required' })
    const event = await createLiveEvent({
      id: uuidv4(),
      creatorId: req.userId,
      title, description, eventDate, ticketPrice: ticketPrice || 0,
      totalTickets: totalTickets || 0, posterUrl, streamUrl,
    })
    res.json({ success: true, event })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function updateEvent(req, res) {
  try {
    const { id } = req.params
    const { title, description, eventDate, ticketPrice, totalTickets, posterUrl, streamUrl, status } = req.body
    const updates = {}
    if (title !== undefined) updates.title = title
    if (description !== undefined) updates.description = description
    if (eventDate !== undefined) updates.event_date = eventDate
    if (ticketPrice !== undefined) updates.ticket_price = ticketPrice
    if (totalTickets !== undefined) { updates.total_tickets = totalTickets; updates.available_tickets = totalTickets }
    if (posterUrl !== undefined) updates.poster_url = posterUrl
    if (streamUrl !== undefined) updates.stream_url = streamUrl
    if (status !== undefined) updates.status = status
    const event = await updateLiveEvent(id, req.userId, updates)
    if (!event) return res.status(404).json({ error: 'Event not found' })
    res.json({ success: true, event })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// --- Public event listing ---
export async function listEvents(req, res) {
  try {
    const includePast = req.query.includePast === 'true'
    const events = await getLiveEvents(includePast)
    res.json({ success: true, events })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function getEvent(req, res) {
  try {
    const { id } = req.params
    const event = await getLiveEventById(id)
    if (!event) return res.status(404).json({ error: 'Event not found' })
    const ticketsSold = await getEventTicketCount(id)
    event.tickets_sold = ticketsSold
    res.json({ success: true, event })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function myEvents(req, res) {
  try {
    const events = await getLiveEventsByCreator(req.userId)
    res.json({ success: true, events })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// --- Ticket purchase ---
export async function purchaseTicket(req, res) {
  try {
    const { eventId } = req.body
    if (!eventId) return res.status(400).json({ error: 'Event ID required' })
    const event = await getLiveEventById(eventId)
    if (!event) return res.status(404).json({ error: 'Event not found' })
    if (event.status === 'cancelled' || event.status === 'ended') {
      return res.status(400).json({ error: 'Event is not available' })
    }
    if (event.ticket_price > 0 && event.available_tickets <= 0) {
      return res.status(400).json({ error: 'Sold out' })
    }

    if (event.ticket_price <= 0) {
      const ticket = await purchaseEventTicket({
        id: uuidv4(),
        eventId,
        userId: req.userId,
        transactionId: null,
        status: 'active',
      })
      return res.json({ success: true, ticket, free: true })
    }

    const paystack = await getPaystack()
    if (!paystack) return res.status(500).json({ error: 'Paystack not configured' })

    const reference = `TICKET-${uuidv4().split('-')[0]}-${Date.now()}`

    await createTransaction({
      userId: req.userId,
      reference,
      type: 'event_ticket',
      creatorId: event.creator_id,
      amount: parseFloat(event.ticket_price),
      status: 'pending',
      metadata: { eventId, eventTitle: event.title },
    })

    const response = await paystack.transaction.initialize({
      email: req.user.email,
      amount: parseFloat(event.ticket_price) * 100,
      reference,
      callback_url: `${CALLBACK_URL}/events/success?reference=${reference}`,
      metadata: { userId: req.userId, eventId, type: 'event_ticket' },
    })

    res.json({ success: true, authorization_url: response.data.authorization_url, reference })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function verifyTicketPurchase(req, res) {
  try {
    const { reference } = req.query
    if (!reference) return res.status(400).json({ error: 'Reference required' })
    const paystack = await getPaystack()
    if (!paystack) return res.status(500).json({ error: 'Paystack not configured' })

    const response = await paystack.transaction.verify({ reference })
    if (response.data.status === 'success') {
      const tx = await getTransactionByReference(reference)
      if (!tx || tx.status !== 'pending') {
        return res.json({ success: false, error: 'Transaction not found or already processed' })
      }
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows } = await client.query(`UPDATE transactions SET status='success' WHERE reference=$1 AND status='pending' RETURNING id`, [reference])
        if (rows.length === 0) { await client.query('ROLLBACK'); return res.json({ success: false, error: 'Transaction already processed' }) }
        const eventId = tx.metadata?.eventId
        const { rows: evRows } = await client.query(`SELECT creator_id, ticket_price FROM live_events WHERE id=$1`, [eventId])
        const creatorId = evRows[0]?.creator_id || tx.creator_id
        const ticket = await purchaseEventTicket({
          id: uuidv4(),
          eventId,
          userId: tx.user_id,
          transactionId: tx.id,
          status: 'active',
        })
        const gross = parseFloat(tx.amount) || parseFloat(evRows[0]?.ticket_price) || 0
        const platformFee = Math.round(gross * 0.20 * 100) / 100
        const creatorShare = Math.round((gross - platformFee) * 100) / 100
        if (creatorId && creatorShare > 0) {
          const { rows: balRows } = await client.query(`UPDATE creator_profiles SET wallet_balance_ngn = wallet_balance_ngn + $1 WHERE user_id=$2 RETURNING wallet_balance_ngn`, [creatorShare, creatorId])
          const bal = balRows[0]?.wallet_balance_ngn || creatorShare
          await client.query(`INSERT INTO creator_wallet_transactions (creator_id, type, amount_ngn, balance_after_ngn, metadata) VALUES ($1,'event_ticket',$2,$3,$4)`, [creatorId, creatorShare, bal, JSON.stringify({ reference, eventId, gross, platformFee })])
        }
        await client.query('COMMIT')
        res.json({ success: true, ticket })
      } catch (e) { try { await client.query('ROLLBACK') } catch {}; throw e } finally { client.release() }
      return
    } else {
      res.json({ success: false, error: 'Payment not completed' })
    }
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// --- User's tickets ---
export async function myTickets(req, res) {
  try {
    const tickets = await getUserTickets(req.userId)
    res.json({ success: true, tickets })
  } catch (err) { res.status(500).json({ error: err.message }) }
}
