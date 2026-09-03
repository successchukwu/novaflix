#!/usr/bin/env node
// Test payment webhook locally and prod
// Usage: node scripts/test-webhook.js --url http://localhost:3030/api/payment/webhook --ref TEST-123 --gateway paystack
// Or: PAYSTACK_SECRET_KEY=xxx node scripts/test-webhook.js --ref TIP-xxx --gateway paystack --amount 500

import { createHmac } from 'crypto';

const args = process.argv.slice(2);
const getArg = (name, def=null) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i+1] : def;
};

const url = getArg('url', process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/,'')}/api/payment/webhook` : 'http://localhost:3030/api/payment/webhook');
const reference = getArg('ref', `TEST-${Date.now()}`);
const gateway = getArg('gateway', 'paystack');
const amount = parseInt(getArg('amount', '1500'), 10);
const event = getArg('event', gateway === 'flutterwave' ? 'charge.completed' : 'charge.success');

let body;
let headers = { 'Content-Type': 'application/json' };

if (gateway === 'paystack') {
  const secret = process.env.PAYSTACK_SECRET_KEY || 'sk_test_dummy';
  body = JSON.stringify({
    event,
    data: { reference, amount: amount * 100, status: 'success', gateway: 'paystack', customer: { email: 'test@nova-flix.com' } },
    gateway: 'paystack'
  });
  const sig = createHmac('sha512', secret).update(body).digest('hex');
  headers['x-paystack-signature'] = sig;
  console.log(`[test] Paystack webhook -> ${url}\n  ref=${reference} amount=${amount} sig=${sig.slice(0,16)}...`);
} else {
  const secret = process.env.FLW_SECRET_HASH || process.env.FLW_SECRET_KEY || 'flw_test_dummy';
  body = JSON.stringify({
    event,
    data: { tx_ref: reference, amount, status: 'successful', gateway: 'flutterwave' },
    gateway: 'flutterwave'
  });
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  headers['verif-hash'] = sig;
  headers['x-flw-verif-hash'] = sig;
  console.log(`[test] Flutterwave webhook -> ${url}\n  ref=${reference} amount=${amount} sig=${sig.slice(0,16)}...`);
}

console.log(`  body: ${body.slice(0,200)}...`);

fetch(url, { method: 'POST', headers, body })
  .then(async res => {
    const text = await res.text();
    console.log(`[test] Response ${res.status}: ${text.slice(0,500)}`);
    if (res.ok) console.log('[test] ✓ Webhook accepted (200)');
    else console.log('[test] ✗ Webhook failed — check signature / PAYSTACK_SECRET_KEY / FLW_SECRET_HASH');
  })
  .catch(err => {
    console.error('[test] Fetch failed:', err.message);
    console.log('[test] Is server running? Try: npm run dev -w server');
  });
