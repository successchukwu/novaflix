import pool from '../config/database.js';
import { paystackService, flutterwaveService, keywordMatch } from '../services/bankService.js';

export async function createBeneficiary(req, res) {
  try {
    const { gateway, bankCode, accountNumber, accountName } = req.body;
    const creatorId = req.userId;

    if (!gateway || !bankCode || !accountNumber || !accountName) {
      return res.status(400).json({ error: 'gateway, bankCode, accountNumber, accountName required' });
    }
    if (!['paystack', 'flutterwave'].includes(gateway)) {
      return res.status(400).json({ error: 'Invalid gateway' });
    }

    let verification;
    let verifiedName;

    if (gateway === 'paystack') {
      verification = await paystackService.resolveAccount(accountNumber, bankCode);
      if (!verification.status || !verification.data) {
        return res.status(400).json({ error: 'Invalid account number or bank code' });
      }
      verifiedName = verification.data.account_name;
      
      if (!keywordMatch(accountName, verifiedName)) {
        return res.status(400).json({ 
          error: `Account name mismatch. Bank records show: ${verifiedName}` 
        });
      }

      const recipient = await paystackService.createRecipient({
        name: accountName,
        accountNumber,
        bankCode
      });
      
      if (!recipient.status) {
        return res.status(400).json({ error: recipient.message || 'Failed to create Paystack recipient' });
      }

      await pool.query(
        `UPDATE creator_profiles SET 
         paystack_recipient_code = $1, 
         paystack_verified_name = $2,
         paystack_bank_code = $3, paystack_account_number = $4, paystack_account_name = $5,
         bank_code = $3, account_number = $4, account_name = $5
         WHERE user_id = $6`,
        [recipient.data.recipient_code, verifiedName, bankCode, accountNumber, accountName, creatorId]
      );

      res.json({ 
        success: true, 
        gateway: 'paystack',
        recipientCode: recipient.data.recipient_code,
        verifiedName 
      });

    } else {
      verification = await flutterwaveService.resolveAccount(accountNumber, bankCode);
      if (verification.status !== 'success' || !verification.data) {
        return res.status(400).json({ error: 'Invalid account number or bank code' });
      }
      verifiedName = verification.data.account_name;
      
      if (!keywordMatch(accountName, verifiedName)) {
        return res.status(400).json({ 
          error: `Account name mismatch. Bank records show: ${verifiedName}` 
        });
      }

      const beneficiary = await flutterwaveService.createBeneficiary({
        accountBank: bankCode,
        accountNumber,
        beneficiaryName: accountName
      });
      
      if (beneficiary.status !== 'success') {
        return res.status(400).json({ error: beneficiary.message || 'Failed to create Flutterwave beneficiary' });
      }

      await pool.query(
        `UPDATE creator_profiles SET 
         flutterwave_beneficiary_id = $1, 
         flutterwave_verified_name = $2,
         flutterwave_bank_code = $3, flutterwave_account_number = $4, flutterwave_account_name = $5,
         bank_code = $3, account_number = $4, account_name = $5
         WHERE user_id = $6`,
        [beneficiary.data.id, verifiedName, bankCode, accountNumber, accountName, creatorId]
      );

      res.json({ 
        success: true, 
        gateway: 'flutterwave',
        beneficiaryId: beneficiary.data.id,
        verifiedName 
      });
    }
  } catch (err) {
    console.error('[beneficiary] createBeneficiary error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function getBeneficiaries(req, res) {
  try {
    const creatorId = req.userId;
    const { rows } = await pool.query(
      `SELECT paystack_recipient_code, paystack_verified_name, 
              flutterwave_beneficiary_id, flutterwave_verified_name,
              bank_code, account_number, account_name,
              paystack_bank_code, paystack_account_number, paystack_account_name,
              flutterwave_bank_code, flutterwave_account_number, flutterwave_account_name
       FROM creator_profiles WHERE user_id = $1`,
      [creatorId]
    );
    const data = rows[0] || {}
    // Mask account numbers for privacy
    const mask = (num) => num ? `${String(num).slice(0,3)}******${String(num).slice(-3)}` : num
    if (data.account_number) data.account_number_masked = mask(data.account_number)
    if (data.paystack_account_number) data.paystack_account_number_masked = mask(data.paystack_account_number)
    if (data.flutterwave_account_number) data.flutterwave_account_number_masked = mask(data.flutterwave_account_number)
    res.json({ success: true, beneficiaries: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getBankCodes(req, res) {
  try {
    const { gateway } = req.query;
    if (!gateway || !['paystack', 'flutterwave'].includes(gateway)) {
      return res.status(400).json({ error: 'gateway query param required (paystack|flutterwave)' });
    }

    let banks;
    if (gateway === 'paystack') {
      const result = await paystackService.listBanks();
      banks = result.data?.map(b => ({
        code: b.code,
        name: b.name,
        slug: b.slug
      })) || [];
    } else {
      const result = await flutterwaveService.listBanks('NG');
      banks = result.data?.map(b => ({
        code: b.code,
        name: b.name
      })) || [];
    }
    res.json({ success: true, banks });
  } catch (err) {
    console.error('[bank] getBankCodes error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function verifyBankAccount(req, res) {
  try {
    const { gateway, bankCode, accountNumber, accountName } = req.body;
    if (!gateway || !bankCode || !accountNumber || !accountName) {
      return res.status(400).json({ error: 'gateway, bankCode, accountNumber, accountName required' });
    }

    let verifiedName;
    if (gateway === 'paystack') {
      const result = await paystackService.resolveAccount(accountNumber, bankCode);
      if (!result.status) return res.status(400).json({ error: 'Invalid account' });
      verifiedName = result.data.account_name;
    } else {
      const result = await flutterwaveService.resolveAccount(accountNumber, bankCode);
      if (result.status !== 'success') return res.status(400).json({ error: 'Invalid account' });
      verifiedName = result.data.account_name;
    }

    const match = keywordMatch(accountName, verifiedName);
    res.json({ 
      success: true, 
      verifiedName, 
      match,
      message: match ? 'Account name matches' : `Name mismatch. Bank has: ${verifiedName}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}