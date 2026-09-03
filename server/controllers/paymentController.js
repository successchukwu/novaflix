import { v4 as uuidv4, validate as uuidValidate } from 'uuid'
import { createHash, createHmac } from 'crypto'
import pool from '../config/database.js'
import { addSubscription, getUserSubscription, updateUser, createTransaction, getTransactionByReference, updateTransactionByReference, getPlanBySlug, listPlans, getDefaultCurrency } from '../db.js'
import { initializePayment, verifyPayment, isConfigured } from '../lib/gateway.js'
import { signToken } from './authController.js'
import { validatePromo, computeDiscountedAmount, applyPromoToTransaction } from '../services/promoService.js'

function verifyPaystackSignature(rawBody, signature, secret) {
  if (!secret) return false
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex')
  return createHash('sha256').update(signature).digest('hex') === createHash('sha256').update(expected).digest('hex')
    || signature === expected
}

function verifyFlutterwaveSignature(rawBody, verifHash, secret) {
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return verifHash === expected
}

async function creditReferralCommission(referredUserId, planSlug) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    
    // Atomically find and update the referral record
    // Only process if status is 'converted' (first paid subscription)
    const { rows } = await client.query(
      `UPDATE affiliate_referrals
       SET commission = ROUND((SELECT price FROM plans WHERE slug = $2)::numeric * 0.10, 2),
           status = 'paid',
           plan = $2
       WHERE id = (
         SELECT id FROM affiliate_referrals
         WHERE referred_id = $1 AND status = 'converted'
         FOR UPDATE
         LIMIT 1
       )
       AND status = 'converted'
       RETURNING id, referrer_id, commission`,
      [referredUserId, planSlug || 'basic']
    )
    
    if (rows.length === 0) {
      await client.query('ROLLBACK')
      return
    }
    
    const { referrer_id, commission } = rows[0]
    
    // Credit referrer coins
    await client.query(
      `UPDATE users SET coins = COALESCE(coins,0) + $1 WHERE id = $2`,
      [Math.round(commission), referrer_id]
    )
    
    await client.query('COMMIT')
    
    // Notify referrer in realtime
    try {
      const { notifyUser } = await import('../services/realtime.js')
      notifyUser(referrer_id, { type: 'referral_paid', commission, referredId: referredUserId, plan: planSlug })
    } catch {}
  } catch (e) {
    try { await client.query('ROLLBACK') } catch {}
    console.error('[referral] commission error', e.message)
  }
}

export async function listPricing(req, res) {
  try {
    const plans = await listPlans()
    const currency = await getDefaultCurrency()
    res.json({ success: true, plans, currency })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function initialize(req, res) {
  try {
    const { plan, gateway, promoCode } = req.body
    const planRow = await getPlanBySlug(plan)
    const originalAmount = planRow?.price
    if (!originalAmount) return res.status(400).json({ error: 'Invalid plan' })

    let amount = originalAmount
    let promo = null
    let discount = 0

    if (promoCode) {
      const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown'
      const validation = await validatePromo(promoCode, { plan, ip, phone: req.user?.phone, userId: req.userId })
      if (!validation.valid) return res.status(400).json({ error: validation.error })
      promo = validation.promo
      const computed = computeDiscountedAmount(originalAmount, promo)
      amount = computed.total
      discount = computed.discount
    }

    const selectedGateway = gateway === 'flutterwave' ? 'flutterwave' : 'paystack'
    if (!isConfigured(selectedGateway)) {
      return res.status(400).json({ error: `${selectedGateway} is not configured. Please select another payment method.` })
    }

    const reference = `SUB-${uuidv4().split('-')[0]}-${Date.now()}`

    await createTransaction({
      userId: req.userId,
      reference,
      type: 'subscription',
      plan,
      amount,
      status: 'pending',
      metadata: { gateway: selectedGateway, promoCode: promo?.code, originalAmount, discount, discountedAmount: amount },
    })

    const result = await initializePayment({
      gateway: selectedGateway,
      email: req.user.email,
      amount,
      reference,
      callbackUrl: `${process.env.APP_URL || 'http://localhost:3000'}/payment/success?reference=${reference}&plan=${plan}`,
      metadata: { userId: req.userId, plan },
      currency: await getDefaultCurrency(),
    })

    if (!result.success) return res.status(500).json({ error: result.error })

    res.json({ success: true, authorization_url: result.authorization_url, reference, gateway: selectedGateway, originalAmount, discount, amount, promoCode: promo?.code })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function validatePromoCode(req, res) {
  try {
    const { code, plan } = req.body
    if (!code || !plan) return res.status(400).json({ error: 'Code and plan required' })
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown'
    const validation = await validatePromo(code, { plan, ip, phone: req.user?.phone, userId: req.userId })
    if (!validation.valid) return res.json({ success: false, valid: false, error: validation.error })
    const planRow = await getPlanBySlug(plan)
    const originalAmount = planRow?.price || 0
    const computed = computeDiscountedAmount(originalAmount, validation.promo)
    res.json({
      success: true,
      valid: true,
      originalAmount,
      discount: computed.discount,
      total: computed.total,
      discountType: validation.promo.discount_type,
      discountValue: validation.promo.discount_value,
      isHighValue: computed.discount / originalAmount >= 0.8,
      promo: { code: validation.promo.code, plan: validation.promo.plan }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function verify(req, res) {
  try {
    const { reference } = req.query
    if (!reference) return res.status(400).json({ error: 'Reference required' })

    const tx = await getTransactionByReference(reference)
    if (!tx) return res.status(404).json({ error: 'Transaction not found' })
    if (tx.user_id !== req.userId) return res.status(403).json({ error: 'Unauthorized' })

    // Idempotency: if already verified, return existing subscription
    if (tx.status === 'success') {
      const existingSub = await getUserSubscription(req.userId)
      return res.json({ success: true, subscription: existingSub, alreadyVerified: true })
    }
    if (tx.status !== 'pending') {
      return res.status(400).json({ error: 'Transaction not pending' })
    }

    const gateway = tx.metadata?.gateway || 'paystack'
    const result = await verifyPayment({ gateway, reference })
    if (result.success) {
      const planSlug = tx.plan || 'basic'
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const sub = {
        id: uuidv4(),
        userId: req.userId,
        plan: tx.plan || 'basic',
        active: true,
        startedAt: new Date().toISOString(),
        expiresAt,
      }
      await addSubscription(sub)
      await updateUser(req.userId, { plan: tx.plan || 'basic' })
      await updateTransactionByReference(reference, { status: 'success' })
      await creditReferralCommission(req.userId, tx.plan || 'basic')

      if (tx.metadata?.promoCode) {
        await applyPromoToTransaction(
          { id: tx.metadata.promoCode, code: tx.metadata.promoCode },
          {
            userId: req.userId,
            plan: tx.plan,
            originalAmount: tx.metadata.originalAmount,
            discountedAmount: tx.metadata.discountedAmount || tx.amount,
            ip: req.ip,
            phone: req.user?.phone,
          }
        )
      }

      const token = signToken({ id: req.userId, email: req.user.email, role: req.user.role || 'user', plan: tx.plan || 'basic' })

      res.json({
        success: true,
        subscription: sub,
        gateway: tx.metadata?.gateway,
        plan: tx.plan || 'basic',
        token,
        planEndsAt: expiresAt,
        promoCode: tx.metadata?.promoCode || null,
        originalAmount: tx.metadata?.originalAmount || null,
        discount: tx.metadata?.discount || null,
        discountedAmount: tx.metadata?.discountedAmount || null,
      })
    } else {
      res.json({ success: false, error: 'Payment not completed', status: result.status })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function webhook(req, res) {
  try {
    const rawBody = req.rawBody || JSON.stringify(req.body)
    const gateway = req.body?.gateway || 'paystack'

    // Signature verification (enforced when secrets are configured)
    if (gateway === 'paystack') {
      const signature = req.headers['x-paystack-signature']
      if (process.env.PAYSTACK_SECRET_KEY && !verifyPaystackSignature(rawBody, signature, process.env.PAYSTACK_SECRET_KEY)) {
        console.warn('[webhook] Invalid Paystack signature')
        return res.status(400).json({ error: 'Invalid signature' })
      }
    } else if (gateway === 'flutterwave') {
      const verifHash = req.headers['verif-hash'] || req.headers['x-flw-verif-hash']
      const secret = process.env.FLW_SECRET_HASH || process.env.FLW_SECRET_KEY
      if (secret && !verifyFlutterwaveSignature(rawBody, verifHash, secret)) {
        console.warn('[webhook] Invalid Flutterwave signature')
        return res.status(400).json({ error: 'Invalid signature' })
      }
    }

    if (gateway === 'paystack' && req.body?.event === 'charge.success') {
      const { reference, amount } = req.body.data
      await handleSuccessfulPayment(reference, amount / 100, req.body.data)
    }

    if (gateway === 'flutterwave' && req.body?.event === 'charge.completed' && req.body?.data?.status === 'successful') {
      const { tx_ref, amount } = req.body.data
      await handleSuccessfulPayment(tx_ref, amount, req.body.data)
    }

    res.sendStatus(200)
  } catch (err) {
    console.error('[webhook] Error:', err.message)
    res.sendStatus(200)
  }
}

async function handleSuccessfulPayment(reference, amount, eventData) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Atomic claim: only process if transaction is still pending
    const { rows } = await client.query(
      `UPDATE transactions 
       SET status = 'success', amount = $2, metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('gateway_event', $3)
       WHERE reference = $1 AND status = 'pending'
       RETURNING id, user_id, plan`,
      [reference, amount, JSON.stringify(eventData)]
    )

    if (rows.length === 0) {
      await client.query('ROLLBACK')
      return // Already processed
    }

    const { id: txId, user_id, plan: planSlug } = rows[0]
    const plan = planSlug || 'basic'

    // Deterministic subscription id from transaction id
    const subId = txId

    // Upsert subscription (1:1 with transaction)
    await client.query(
      `INSERT INTO subscriptions (id, user_id, plan, active, started_at, expires_at)
       VALUES ($1, $2, $3, true, NOW(), NOW() + INTERVAL '30 days')
       ON CONFLICT (id) DO UPDATE SET
         plan = EXCLUDED.plan,
         active = true,
         started_at = NOW(),
         expires_at = NOW() + INTERVAL '30 days'`,
      [subId, user_id, plan]
    )

    await client.query(`UPDATE users SET plan = $2 WHERE id = $1`, [user_id, plan])

    // Credit referral commission inside same transaction
    const refRows = await client.query(
      `UPDATE affiliate_referrals
       SET commission = ROUND((SELECT price FROM plans WHERE slug = $2)::numeric * 0.10, 2),
           status = 'paid',
           plan = $2
       WHERE id = (
         SELECT id FROM affiliate_referrals
         WHERE referred_id = $1 AND status = 'converted'
         FOR UPDATE
         LIMIT 1
       )
       AND status = 'converted'
       RETURNING id, referrer_id, commission`,
      [user_id, plan]
    )

    if (refRows.rows.length > 0) {
      const { referrer_id, commission } = refRows.rows[0]
      await client.query(`UPDATE users SET coins = COALESCE(coins,0) + $1 WHERE id = $2`, [Math.round(commission), referrer_id])
      // Notify referrer (non-blocking)
      try {
        const { notifyUser } = await import('../services/realtime.js')
        notifyUser(referrer_id, { type: 'referral_paid', commission, referredId: user_id, plan })
      } catch {}
    }

    await client.query('COMMIT')
  } catch (e) {
    try { await client.query('ROLLBACK') } catch {}
    console.error('[webhook] Fulfillment error:', e.message)
    throw e
  } finally {
    client.release()
  }
}

export async function status(req, res) {
  try {
    const sub = await getUserSubscription(req.userId)
    res.json({ success: true, subscription: sub || null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function gatewayInfo(req, res) {
  res.json({
    paystack: { configured: isConfigured('paystack'), publicKey: process.env.PAYSTACK_PUBLIC_KEY || '' },
    flutterwave: { configured: isConfigured('flutterwave'), publicKey: process.env.FLW_PUBLIC_KEY || '' },
  })
}

export async function publicSettings(req, res) {
  const currency = await getDefaultCurrency()
  res.json({ success: true, currency })
}
