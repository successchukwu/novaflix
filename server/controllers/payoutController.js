import { findUserById, getUserTransactions, createTransaction } from '../db.js'
import Paystack from 'paystack-api'
import { v4 as uuidv4 } from 'uuid'
import { withdraw as walletWithdraw } from '../services/walletService.js'

const paystack = process.env.PAYSTACK_SECRET_KEY
  ? new Paystack(process.env.PAYSTACK_SECRET_KEY)
  : null

export async function createRecipient(req, res) {
  try {
    const { bankCode, accountNumber, accountName } = req.body
    if (!bankCode || !accountNumber || !accountName) {
      return res.status(400).json({ error: 'bankCode, accountNumber, and accountName required' })
    }
    if (!paystack) return res.status(500).json({ error: 'Paystack not configured' })

    const response = await paystack.transferrecipient.create({
      type: 'nuban',
      name: accountName,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: 'NGN',
    })

    const { data } = response
    const { db } = await import('../db.js')
    await db.pool.query(
      `UPDATE creator_profiles SET paystack_recipient_code = $1 WHERE user_id = $2`,
      [data.recipient_code, req.userId]
    )

    res.json({ success: true, recipient_code: data.recipient_code })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function requestWithdraw(req, res) {
  try {
    const { amount, amountNgn } = req.body
    const requested = parseFloat(amountNgn || amount)
    if (!requested || !Number.isFinite(requested) || requested < 10000) {
      return res.status(400).json({ error: 'Minimum withdrawal is ₦10,000' })
    }
    // Legacy route now proxies to walletService.withdraw for consistent wallet debit + fee handling
    // Keeps Paystack-only behavior for backward compatibility
    const result = await walletWithdraw({ creatorId: req.userId, amountNgn: requested, gateway: 'paystack' })
    // Also log legacy transaction for payout history compatibility
    await createTransaction({
      userId: req.userId,
      reference: result.transferRef || `PAY-${uuidv4().split('-')[0]}-${Date.now()}`,
      type: 'payout',
      amount: requested,
      status: 'pending',
      metadata: { legacy: true, gateway: 'paystack', netToCreator: result.netToCreator, gatewayFee: result.gatewayFee },
    }).catch(() => {})
    res.json({ success: true, transfer: result, message: 'Withdrawal via legacy /payouts proxied to wallet service' })
  } catch (err) {
    const status = err.message.includes('Insufficient') || err.message.includes('Minimum') || err.message.includes('beneficiary') ? 400 : 500
    res.status(status).json({ error: err.message })
  }
}

export async function getPayoutHistory(req, res) {
  try {
    const txs = await getUserTransactions(req.userId)
    const payouts = txs.filter(t => t.type === 'payout')
    res.json({ success: true, payouts })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getBalance(req, res) {
  try {
    if (!paystack) return res.status(500).json({ error: 'Paystack not configured' })
    const response = await paystack.balance.fetch()
    res.json({ success: true, balance: response.data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
