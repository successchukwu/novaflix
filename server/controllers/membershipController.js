import { v4 as uuidv4 } from 'uuid'
import {
  createMembershipTier, updateMembershipTier, getMembershipTiersByCreator, getMembershipTierById,
  createMembership, getUserMemberships, getCreatorSubscribers, getActiveMembershipForUserAndTier,
  cancelMembership, getCreatorMembershipStats,
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

// --- Tier management (creator) ---
export async function createTier(req, res) {
  try {
    const { name, description, price, benefits } = req.body
    if (!name || !price) return res.status(400).json({ error: 'Name and price required' })
    const tier = await createMembershipTier({
      id: uuidv4(),
      creatorId: req.userId,
      name, description, price, benefits: benefits || [],
    })
    res.json({ success: true, tier })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function updateTier(req, res) {
  try {
    const { id } = req.params
    const { name, description, price, benefits, active } = req.body
    const updates = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (price !== undefined) updates.price = price
    if (benefits !== undefined) updates.benefits = JSON.stringify(benefits)
    if (active !== undefined) updates.active = active
    const tier = await updateMembershipTier(id, req.userId, updates)
    if (!tier) return res.status(404).json({ error: 'Tier not found' })
    res.json({ success: true, tier })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function listTiers(req, res) {
  try {
    const { creatorId } = req.params
    const tiers = await getMembershipTiersByCreator(creatorId)
    res.json({ success: true, tiers })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function myTiers(req, res) {
  try {
    const tiers = await getMembershipTiersByCreator(req.userId)
    res.json({ success: true, tiers })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// --- Subscribe to a creator tier ---
export async function subscribe(req, res) {
  try {
    const { tierId } = req.body
    if (!tierId) return res.status(400).json({ error: 'Tier ID required' })
    const tier = await getMembershipTierById(tierId)
    if (!tier) return res.status(404).json({ error: 'Tier not found' })
    if (!tier.active) return res.status(400).json({ error: 'Tier is not active' })

    const existing = await getActiveMembershipForUserAndTier(req.userId, tierId)
    if (existing) return res.status(400).json({ error: 'Already subscribed to this tier' })

    const paystack = await getPaystack()
    if (!paystack) return res.status(500).json({ error: 'Paystack not configured' })

    const reference = `MEMBER-${uuidv4().split('-')[0]}-${Date.now()}`

    await createTransaction({
      userId: req.userId,
      reference,
      type: 'membership',
      creatorId: tier.creator_id,
      amount: parseFloat(tier.price),
      status: 'pending',
      metadata: { tierId, tierName: tier.name },
    })

    const response = await paystack.transaction.initialize({
      email: req.user.email,
      amount: parseFloat(tier.price) * 100,
      reference,
      callback_url: `${CALLBACK_URL}/membership/success?reference=${reference}`,
      metadata: { userId: req.userId, tierId, type: 'membership' },
    })

    res.json({ success: true, authorization_url: response.data.authorization_url, reference })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function verifySubscription(req, res) {
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
        const membership = await createMembership({
          id: uuidv4(),
          userId: tx.user_id,
          tierId: tx.metadata?.tierId,
          creatorId: tx.creator_id,
          status: 'active',
          startedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        })
        // Credit creator 80% of membership price
        const gross = parseFloat(tx.amount) || 0
        const platformFee = Math.round(gross * 0.20 * 100) / 100
        const creatorShare = Math.round((gross - platformFee) * 100) / 100
        if (tx.creator_id && creatorShare > 0) {
          const { rows: balRows } = await client.query(`UPDATE creator_profiles SET wallet_balance_ngn = wallet_balance_ngn + $1 WHERE user_id=$2 RETURNING wallet_balance_ngn`, [creatorShare, tx.creator_id])
          const bal = balRows[0]?.wallet_balance_ngn || creatorShare
          await client.query(`INSERT INTO creator_wallet_transactions (creator_id, type, amount_ngn, balance_after_ngn, metadata) VALUES ($1,'membership',$2,$3,$4)`, [tx.creator_id, creatorShare, bal, JSON.stringify({ reference, gross, platformFee, tierId: tx.metadata?.tierId })])
        }
        await client.query('COMMIT')
        res.json({ success: true, membership })
      } catch (e) { try { await client.query('ROLLBACK') } catch {}; throw e } finally { client.release() }
      return
    } else {
      res.json({ success: false, error: 'Payment not completed' })
    }
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// --- User's memberships ---
export async function myMemberships(req, res) {
  try {
    const memberships = await getUserMemberships(req.userId)
    res.json({ success: true, memberships })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function cancelMembershipHandler(req, res) {
  try {
    const { id } = req.params
    const membership = await cancelMembership(id, req.userId)
    if (!membership) return res.status(404).json({ error: 'Membership not found' })
    res.json({ success: true, membership })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// --- Creator's subscribers ---
export async function mySubscribers(req, res) {
  try {
    const subscribers = await getCreatorSubscribers(req.userId)
    const stats = await getCreatorMembershipStats(req.userId)
    res.json({ success: true, subscribers, stats })
  } catch (err) { res.status(500).json({ error: err.message }) }
}
