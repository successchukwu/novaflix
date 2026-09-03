import { v4 as uuidv4 } from 'uuid'
import { addGlowGift, createTransaction, getTransactionByReference, getGlowGiftsForCreator, getGlowGiftsTotals, findUserById, createNotification } from '../db.js'
import { notifyUser } from '../services/realtime.js'
import pool from '../config/database.js'
import Paystack from 'paystack-api'

const paystack = process.env.PAYSTACK_SECRET_KEY
  ? new Paystack(process.env.PAYSTACK_SECRET_KEY)
  : null

const CALLBACK_URL = process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:3000'
const GIFT_FEE = 0.20

export async function initializeGift(req, res) {
  try {
    const { creatorId, amount, note } = req.body
    if (!creatorId || !amount) return res.status(400).json({ error: 'Creator and amount required' })
    if (!paystack) return res.status(500).json({ error: 'Paystack not configured' })

    const user = req.user
    const reference = `GLOW-${uuidv4().split('-')[0]}-${Date.now()}`

    const response = await paystack.transaction.initialize({
      email: user.email,
      amount: amount * 100,
      reference,
      callback_url: `${CALLBACK_URL}/gift/success?reference=${reference}`,
      metadata: { userId: req.userId, creatorId, note },
    })

    await createTransaction({
      userId: req.userId,
      reference,
      type: 'gift',
      creatorId,
      amount,
      status: 'pending',
      metadata: { note },
    })

    res.json({ success: true, authorization_url: response.data.authorization_url, reference })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function verifyGift(req, res) {
  try {
    const { reference } = req.query
    if (!reference) return res.status(400).json({ error: 'Reference required' })
    if (!paystack) return res.status(500).json({ error: 'Paystack not configured' })

    const response = await paystack.transaction.verify({ reference })
    const txData = response.data

    if (txData.status === 'success') {
      const tx = await getTransactionByReference(reference)
      if (tx && tx.status === 'pending' && tx.type === 'gift') {
        const gross = txData.amount / 100
        const fee = +(gross * GIFT_FEE).toFixed(2)
        const net = +(gross - fee).toFixed(2)
        const gift = {
          id: uuidv4(),
          senderId: tx.user_id,
          creatorId: tx.creator_id,
          amount: gross,
          fee,
          netAmount: net,
          note: tx.metadata?.note || '',
        }
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const { rows } = await client.query(`UPDATE transactions SET status='success', metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('paystackId', $2::text, 'fee', $3::text, 'netAmount', $4::text) WHERE reference=$1 AND status='pending' RETURNING id`, [reference, String(txData.id), String(fee), String(net)])
          if (rows.length === 0) { await client.query('ROLLBACK'); return res.json({ success: false, error: 'Transaction already processed' }) }
          await client.query(`INSERT INTO glow_gifts (id, sender_id, creator_id, amount, fee, net_amount, note) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [gift.id, gift.senderId, gift.creatorId, gift.amount, gift.fee, gift.netAmount, gift.note])
          if (gift.creatorId) {
            const { rows: balRows } = await client.query(`UPDATE creator_profiles SET wallet_balance_ngn = wallet_balance_ngn + $1 WHERE user_id=$2 RETURNING wallet_balance_ngn`, [net, gift.creatorId])
            const bal = balRows[0]?.wallet_balance_ngn || net
            await client.query(`INSERT INTO creator_wallet_transactions (creator_id, type, amount_ngn, balance_after_ngn, metadata) VALUES ($1,'gift',$2,$3,$4)`, [gift.creatorId, net, bal, JSON.stringify({ reference, gross, fee, net, paystackId: txData.id })])
          }
          await client.query('COMMIT')
        } catch (e) { try { await client.query('ROLLBACK') } catch {}; throw e } finally { client.release() }
        if (tx.creator_id && tx.creator_id !== tx.user_id) {
          const [sender] = await Promise.all([findUserById(tx.user_id).catch(() => null)])
          const notification = await createNotification({
            userId: tx.creator_id,
            type: 'gift',
            title: `${sender?.name || 'A fan'} sent you a Glow Gift`,
            body: gift.note ? `"${gift.note}"` : `$${net.toFixed(2)} (after 20% fee) just landed in your account.`,
            link: '/creator/dashboard',
            actorId: tx.user_id,
          }).catch(() => null)
          if (notification) notifyUser(tx.creator_id, { type: 'notification', notification })
        }
        res.json({ success: true, gift: { ...gift, fee, netAmount: net } })
      } else {
        res.json({ success: false, error: 'Transaction not found or already processed' })
      }
    } else {
      res.json({ success: false, error: 'Payment not completed' })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getMyGifts(req, res) {
  try {
    const [items, totals] = await Promise.all([
      getGlowGiftsForCreator(req.userId),
      getGlowGiftsTotals(req.userId),
    ])
    res.json({ success: true, items, totals })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}