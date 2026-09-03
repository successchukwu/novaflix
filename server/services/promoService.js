import { pool } from '../db.js'

export async function getPromoByCode(code) {
  const { rows } = await pool.query(
    `SELECT * FROM promo_codes WHERE code = $1`,
    [code.toUpperCase()]
  )
  return rows[0] || null
}

export async function validatePromo(code, { plan, ip, phone, userId }) {
  const promo = await getPromoByCode(code)
  if (!promo) return { valid: false, error: 'Invalid promo code' }
  if (!promo.active) return { valid: false, error: 'Promo code is inactive' }
  const now = new Date()
  if (promo.starts_at && new Date(promo.starts_at) > now) return { valid: false, error: 'Promo code not yet active' }
  if (promo.expires_at && new Date(promo.expires_at) < now) return { valid: false, error: 'Promo code has expired' }
  if (promo.max_uses > 0 && promo.uses >= promo.max_uses) return { valid: false, error: 'Promo code usage limit reached' }
  if (promo.min_amount > 0) {
    const { rows } = await pool.query(`SELECT price FROM plans WHERE slug = $1`, [plan])
    const planPrice = rows[0]?.price || 0
    if (planPrice < promo.min_amount) return { valid: false, error: `Minimum purchase amount is ${promo.min_amount}` }
  }
  if (!promo.apply_to_all_plans && promo.plan !== plan) return { valid: false, error: 'Promo code not valid for this plan' }
  if (promo.allowed_ips && promo.allowed_ips.length > 0 && ip && !promo.allowed_ips.includes(ip)) return { valid: false, error: 'Promo code not available in your region' }
  if (promo.allowed_phones && promo.allowed_phones.length > 0 && phone && !promo.allowed_phones.includes(phone)) return { valid: false, error: 'Promo code not available for your phone number' }
  if (promo.country) {
    const { rows } = await pool.query(`SELECT country FROM users WHERE id = $1`, [userId])
    if (rows[0]?.country !== promo.country) return { valid: false, error: 'Promo code not available in your country' }
  }
  if (promo.usage_per_user > 0 && userId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM promo_redemptions WHERE promo_id = $1 AND user_id = $2`,
      [promo.id, userId]
    )
    if (parseInt(rows[0].count, 10) >= promo.usage_per_user) return { valid: false, error: 'You have already used this promo code' }
  }
  return { valid: true, promo }
}

export function computeDiscountedAmount(price, promo) {
  let discount = 0
  if (promo.discount_type === 'pct') {
    discount = Math.round(price * (promo.discount_value / 100))
  } else {
    discount = Math.min(price, Math.round(promo.discount_value))
  }
  const total = Math.max(0, price - discount)
  return { original: price, discount, total }
}

export async function applyPromoToTransaction(promo, { userId, plan, originalAmount, discountedAmount, ip, phone }) {
  await pool.query(
    `INSERT INTO promo_redemptions (promo_id, user_id, plan, original_amount, discounted_amount, ip, phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [promo.id, userId, plan, originalAmount, discountedAmount, ip || null, phone || null]
  )
  await pool.query(
    `UPDATE promo_codes SET uses = uses + 1 WHERE id = $1`,
    [promo.id]
  )
}

export async function getPromoStats(promoId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as redemptions, SUM(original_amount) as total_original, SUM(discounted_amount) as total_discounted
     FROM promo_redemptions WHERE promo_id = $1`,
    [promoId]
  )
  return rows[0] || { redemptions: 0, total_original: 0, total_discounted: 0 }
}