const CALLBACK_URL = process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:3000/payment/success'

// ---- Paystack ----
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

// ---- Flutterwave (direct API via axios) ----
async function flutterwaveApi(method, path, data) {
  const axios = (await import('axios')).default
  return axios({
    method,
    url: `https://api.flutterwave.com/v3${path}`,
    data: method === 'POST' ? data : undefined,
    params: method === 'GET' ? data : undefined,
    headers: {
      Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
  })
}

export async function initializePayment({ gateway, email, amount, reference, callbackUrl, metadata, currency = 'NGN' }) {
  if (gateway === 'paystack') {
    const paystack = await getPaystack()
    if (!paystack) return { success: false, error: 'Paystack not configured' }

    const response = await paystack.transaction.initialize({
      email,
      amount: Math.round(amount * 100),
      reference,
      callback_url: callbackUrl || `${CALLBACK_URL}?reference=${reference}`,
      metadata,
    })
    return { success: true, authorization_url: response.data.authorization_url, reference }
  }

  if (gateway === 'flutterwave') {
    if (!process.env.FLW_SECRET_KEY) return { success: false, error: 'Flutterwave not configured' }

    try {
      const response = await flutterwaveApi('POST', '/payments', {
        tx_ref: reference,
        amount,
        currency,
        redirect_url: callbackUrl || `${CALLBACK_URL}?reference=${reference}`,
        customer: { email },
        customizations: { title: 'NovaFlix' },
        meta: metadata,
      })

      if (response.data.status === 'success' && response.data.data?.link) {
        return { success: true, authorization_url: response.data.data.link, reference }
      }
      return { success: false, error: response.data.message || 'Failed to initialize Flutterwave payment' }
    } catch (err) {
      return { success: false, error: err.response?.data?.message || err.message }
    }
  }

  return { success: false, error: `Unknown gateway: ${gateway}` }
}

export async function verifyPayment({ gateway, reference }) {
  if (gateway === 'paystack') {
    const paystack = await getPaystack()
    if (!paystack) return { success: false, error: 'Paystack not configured' }

    const response = await paystack.transaction.verify({ reference })
    const txData = response.data
    if (txData.status === 'success') {
      return { success: true, status: 'success', amount: txData.amount / 100 }
    }
    return { success: false, status: txData.status }
  }

  if (gateway === 'flutterwave') {
    if (!process.env.FLW_SECRET_KEY) return { success: false, error: 'Flutterwave not configured' }

    try {
      const response = await flutterwaveApi('GET', '/transactions/verify_by_reference', { tx_ref: reference })
      if (response.data.status === 'success' && response.data.data.status === 'successful') {
        return { success: true, status: 'success', amount: response.data.data.amount }
      }
      return { success: false, status: response.data.data?.status || 'failed' }
    } catch (err) {
      return { success: false, error: err.response?.data?.message || err.message }
    }
  }

  return { success: false, error: `Unknown gateway: ${gateway}` }
}

export function isConfigured(gateway) {
  if (gateway === 'paystack') return !!process.env.PAYSTACK_SECRET_KEY
  if (gateway === 'flutterwave') return !!process.env.FLW_SECRET_KEY
  return false
}
