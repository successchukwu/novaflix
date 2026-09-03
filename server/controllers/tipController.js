import { v4 as uuidv4 } from 'uuid'
import { addTip, createTransaction, getTransactionByReference, updateTransactionByReference } from '../db.js'
import pool from '../config/database.js'
import Paystack from 'paystack-api'

const paystack = process.env.PAYSTACK_SECRET_KEY
  ? new Paystack(process.env.PAYSTACK_SECRET_KEY)
  : null

const CALLBACK_URL = process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:3000'

export async function initializeTip(req, res) {
  try {
    const { creatorId, amount, message } = req.body
    if (!creatorId || !amount) return res.status(400).json({ error: 'Creator and amount required' })
    if (!paystack) return res.status(500).json({ error: 'Paystack not configured' })

    const user = req.user
    const reference = `TIP-${uuidv4().split('-')[0]}-${Date.now()}`

    const response = await paystack.transaction.initialize({
      email: user.email,
      amount: amount * 100,
      reference,
      callback_url: `${CALLBACK_URL}/tips/success?reference=${reference}`,
      metadata: { userId: req.userId, creatorId, message },
    })

    await createTransaction({
      userId: req.userId,
      reference,
      type: 'tip',
      creatorId,
      amount,
      status: 'pending',
      metadata: { message },
    })

    res.json({ success: true, authorization_url: response.data.authorization_url, reference })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function verifyTip(req, res) {
  try {
    const { reference } = req.query
    if (!reference) return res.status(400).json({ error: 'Reference required' })
    if (!paystack) return res.status(500).json({ error: 'Paystack not configured' })

    const response = await paystack.transaction.verify({ reference })
    const txData = response.data

    if (txData.status === 'success') {
      const tx = await getTransactionByReference(reference)
      if (tx && tx.status === 'pending' && tx.type === 'tip') {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const { rows } = await client.query(
            `UPDATE transactions SET status='success', metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('paystackId', $2::text) WHERE reference=$1 AND status='pending' RETURNING id`,
            [reference, String(txData.id)]
          )
          if (rows.length === 0) {
            await client.query('ROLLBACK')
            return res.json({ success: false, error: 'Transaction already processed' })
          }
          const tip = {
            id: uuidv4(),
            userId: tx.user_id,
            creatorId: tx.creator_id,
            amount: txData.amount / 100,
            message: tx.metadata?.message || tx.message || '',
          }
          await client.query(`INSERT INTO tips (id, user_id, creator_id, amount, message) VALUES ($1,$2,$3,$4,$5)`, [tip.id, tip.userId, tip.creatorId, tip.amount, tip.message])
          // Credit creator wallet 80% share
          const gross = tip.amount
          const platformFee = Math.round(gross * 0.20 * 100) / 100
          const creatorShare = Math.round((gross - platformFee) * 100) / 100
          if (tip.creatorId) {
            const { rows: balRows } = await client.query(`UPDATE creator_profiles SET wallet_balance_ngn = wallet_balance_ngn + $1 WHERE user_id=$2 RETURNING wallet_balance_ngn`, [creatorShare, tip.creatorId])
            const bal = balRows[0]?.wallet_balance_ngn || creatorShare
            await client.query(`INSERT INTO creator_wallet_transactions (creator_id, type, amount_ngn, balance_after_ngn, metadata) VALUES ($1,'tip',$2,$3,$4)`, [tip.creatorId, creatorShare, bal, JSON.stringify({ reference, gross, platformFee, paystackId: txData.id })])
          }
          await client.query('COMMIT')
          res.json({ success: true, tip })
        } catch (e) {
          try { await client.query('ROLLBACK') } catch {}
          throw e
        } finally { client.release() }
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
