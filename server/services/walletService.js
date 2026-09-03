import pool from '../config/database.js';
import { paystackService, flutterwaveService } from './bankService.js';
import { getCachedBaselineVPM, TIER_PARAMS } from './ppmService.js';
import { getCreatorTier } from './creatorService.js';

const GATEWAY_FEES = {
  paystack: 10,   // NGN
  flutterwave: 20 // NGN
};

export async function getWalletBalance(creatorId) {
  const { rows } = await pool.query(
    'SELECT wallet_balance_ngn FROM creator_profiles WHERE user_id = $1',
    [creatorId]
  );
  return rows[0]?.wallet_balance_ngn || 0;
}

export async function getWalletTransactions(creatorId, { type, from, to, limit = 50, offset = 0 } = {}) {
  let where = 'WHERE creator_id = $1';
  const params = [creatorId];
  let paramIndex = 2;

  if (type) {
    where += ` AND type = $${paramIndex++}`;
    params.push(type);
  }
  if (from) {
    where += ` AND created_at >= $${paramIndex++}`;
    params.push(from);
  }
  if (to) {
    where += ` AND created_at <= $${paramIndex++}`;
    params.push(to);
  }

  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT * FROM creator_wallet_transactions 
     ${where} 
     ORDER BY created_at DESC 
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    params
  );
  return rows;
}

export async function creditWallet(creatorId, amountNgn, type, metadata = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Atomic credit
    const { rows } = await client.query(
      `UPDATE creator_profiles 
       SET wallet_balance_ngn = wallet_balance_ngn + $1 
       WHERE user_id = $2 
       RETURNING wallet_balance_ngn`,
      [amountNgn, creatorId]
    );

    const balanceAfter = rows[0]?.wallet_balance_ngn || 0;

    // Log transaction
    await client.query(
      `INSERT INTO creator_wallet_transactions 
       (creator_id, type, amount_ngn, balance_after_ngn, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [creatorId, type, amountNgn, balanceAfter, JSON.stringify(metadata)]
    );

    await client.query('COMMIT');
    return { success: true, newBalance: balanceAfter, credited: amountNgn };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function debitWallet(creatorId, amountNgn, type, metadata = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE creator_profiles 
       SET wallet_balance_ngn = wallet_balance_ngn - $1 
       WHERE user_id = $2 AND wallet_balance_ngn >= $1
       RETURNING wallet_balance_ngn`,
      [amountNgn, creatorId]
    );

    if (rows.length === 0) {
      throw new Error('Insufficient balance');
    }

    const balanceAfter = rows[0].wallet_balance_ngn;

    await client.query(
      `INSERT INTO creator_wallet_transactions 
       (creator_id, type, amount_ngn, balance_after_ngn, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [creatorId, type, -amountNgn, balanceAfter, JSON.stringify(metadata)]
    );

    await client.query('COMMIT');
    return { success: true, newBalance: balanceAfter, debited: amountNgn };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Real-time PPM credit (called on watch heartbeat / session end)
export async function creditPPM({ creatorId, contentId, contentType, minutesWatched, userPlan }) {
  // 1. Get creator's subscription tier
  const creatorTier = await getCreatorTier(creatorId); // student/basic/standard/premium
  const tierParams = TIER_PARAMS[creatorTier];

  // 2. Get baseline VPM for content type
  const baselineVPM = await getCachedBaselineVPM(contentType);

  // 3. Get creator's base rate (clamped to tier)
  const { rows: configRows } = await pool.query(
    'SELECT base_rate FROM creator_ppm_config WHERE creator_id = $1',
    [creatorId]
  );
  const baseRate = configRows[0]?.base_rate || tierParams.min_ppm;

  // 4. Calculate dynamic rate
  let dynamicRate;
  if (['scraped', 'youtube', 'movie'].includes(contentType)) {
    // Scraped/YouTube/Movie: baseline VPM × multiplier
    dynamicRate = baselineVPM * tierParams.multiplier;
  } else if (contentType === 'shorts') {
    // Shorts: use shorts baseline VPM × multiplier
    dynamicRate = baselineVPM * tierParams.multiplier;
  } else if (contentType === 'live') {
    // Live: saved as shorts, use shorts baseline
    const shortsVPM = await getCachedBaselineVPM('shorts');
    dynamicRate = shortsVPM * tierParams.multiplier;
  } else {
    // Uploads: creator's base rate
    dynamicRate = baseRate;
  }

  // 5. Clamp to tier floor/ceiling
  dynamicRate = Math.min(Math.max(dynamicRate, tierParams.min_ppm), tierParams.max_ppm);

  // 6. Calculate earnings
  const earnings = minutesWatched * dynamicRate;

  if (earnings <= 0) return { earnings: 0, dynamicRate, baselineVPM };

  // 7. Credit wallet
  const metadata = {
    contentId,
    contentType,
    dynamicRate: Math.round(dynamicRate * 10000) / 10000,
    baselineVPM: Math.round(baselineVPM * 10000) / 10000,
    creatorTier,
    minutesWatched,
    userPlan
  };

  await creditWallet(creatorId, earnings, `ppm_${contentType}`, metadata);

  return { earnings, dynamicRate, baselineVPM, tier: creatorTier };
}

// Tips & Gifts: Flat 80/20 split
export async function creditTipOrGift({ creatorId, amount, type, reference, note }) {
  const creatorShare = Math.round(amount * 0.80 * 100) / 100;
  const platformFee = Math.round(amount * 0.20 * 100) / 100;

  await creditWallet(creatorId, creatorShare, type, { reference, note, gross: amount, platformFee });
  return { creatorShare, platformFee };
}

// Withdrawal (creator selects gateway, min ₦10,000, creator pays fee)
export async function withdraw({ creatorId, amountNgn, gateway }) {
  const MIN_WITHDRAWAL = 10000;
  if (amountNgn < MIN_WITHDRAWAL) {
    throw new Error(`Minimum withdrawal: ₦${MIN_WITHDRAWAL.toLocaleString()}`);
  }

  const gatewayFee = GATEWAY_FEES[gateway] || 0;
  const totalDeduction = amountNgn;
  const transferAmount = Math.max(0, amountNgn - gatewayFee);

  // Atomic debit + payout initiation
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check balance + atomic debit (deduct requested amount, fee borne by creator via reduced transfer)
    const { rows } = await client.query(
      `UPDATE creator_profiles 
       SET wallet_balance_ngn = wallet_balance_ngn - $1 
       WHERE user_id = $2 AND wallet_balance_ngn >= $1
       RETURNING wallet_balance_ngn, paystack_recipient_code, flutterwave_beneficiary_id, 
                 paystack_verified_name, flutterwave_verified_name, bank_code, account_number, account_name,
                 paystack_bank_code, paystack_account_number, paystack_account_name,
                 flutterwave_bank_code, flutterwave_account_number, flutterwave_account_name`,
      [totalDeduction, creatorId]
    );

    if (rows.length === 0) {
      throw new Error('Insufficient balance');
    }

    const profile = rows[0];
    const newBalance = profile.wallet_balance_ngn;

    // Verify beneficiary exists for selected gateway
    if (gateway === 'paystack' && !profile.paystack_recipient_code) {
      throw new Error('Paystack beneficiary not configured. Add bank account first.');
    }
    if (gateway === 'flutterwave' && !profile.flutterwave_beneficiary_id) {
      throw new Error('Flutterwave beneficiary not configured. Add bank account first.');
    }

    // Initiate payout (transfer net amount, fee retained by platform)
    let transfer;
    if (gateway === 'paystack') {
      transfer = await paystackService.initiateTransfer({
        amount: transferAmount,
        recipient: profile.paystack_recipient_code,
        reason: 'NovaFlix creator withdrawal'
      });
    } else {
      // Prefer gateway-specific columns, fallback to generic
      const fwBank = profile.flutterwave_bank_code || profile.bank_code
      const fwAcct = profile.flutterwave_account_number || profile.account_number
      const fwName = profile.flutterwave_account_name || profile.account_name
      transfer = await flutterwaveService.initiateTransfer({
        amount: transferAmount,
        accountBank: fwBank,
        accountNumber: fwAcct,
        beneficiaryName: fwName,
        reference: `NFX-WD-${Date.now()}-${creatorId.slice(0,8)}`
      });
    }

    // Log withdrawal transaction (deducted amount includes fee implicitly via reduced payout)
    await client.query(
      `INSERT INTO creator_wallet_transactions 
       (creator_id, type, amount_ngn, balance_after_ngn, metadata)
       VALUES ($1, 'withdrawal', $2, $3, $4)`,
      [creatorId, -totalDeduction, newBalance, JSON.stringify({
        gateway,
        amountNgn,
        gatewayFee: GATEWAY_FEES[gateway],
        transferAmount,
        transferRef: transfer.data?.reference || transfer.data?.id,
        verifiedName: gateway === 'paystack' ? profile.paystack_verified_name : profile.flutterwave_verified_name,
        netToCreator: transferAmount
      })]
    );

    await client.query('COMMIT');
    return { 
      success: true, 
      newBalance, 
      amountNgn,
      gatewayFee: GATEWAY_FEES[gateway],
      transferAmount,
      netToCreator: transferAmount,
      transferRef: transfer.data?.reference || transfer.data?.id
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getWithdrawalPreview({ creatorId, amountNgn, gateway }) {
  const gatewayFee = GATEWAY_FEES[gateway] || 0;
  const balance = await getWalletBalance(creatorId);
  const transferAmount = Math.max(0, amountNgn - gatewayFee);
  const totalDeduction = amountNgn;
  return {
    amountNgn,
    gatewayFee,
    transferAmount,
    netToCreator: transferAmount,
    totalDeduction,
    balance,
    canWithdraw: balance >= totalDeduction && amountNgn >= 10000
  };
}