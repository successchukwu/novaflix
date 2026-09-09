import { savePushSubscription, deletePushSubscription } from '../db.js'
import { getVapidPublicKey, isPushConfigured } from '../services/pushService.js'

export async function subscribe(req, res) {
  try {
    const { endpoint, keys, plan } = req.body
    // fix Dio bad response — allow FCM tokens without keys (mobile web_push + FCM)
    const isFcm = endpoint && (!keys || !keys.p256dh || !keys.auth || keys.p256dh === '')
    if (!endpoint) {
      return res.status(400).json({ error: 'Invalid subscription payload: endpoint required' })
    }
    if (!isFcm && (!keys || !keys.p256dh || !keys.auth)) {
      return res.status(400).json({ error: 'Invalid subscription payload' })
    }
    const p256dh = keys?.p256dh || ''
    const auth = keys?.auth || ''
    const saved = await savePushSubscription({
      userId: req.userId,
      endpoint,
      p256dh,
      auth,
      plan: plan || req.user?.plan || 'free',
    })
    if (!saved) return res.status(400).json({ error: 'Could not save subscription' })
    res.json({ success: true, subscription: saved })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function unsubscribe(req, res) {
  try {
    const { endpoint } = req.body
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' })
    await deletePushSubscription(endpoint)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function status(req, res) {
  try {
    res.json({
      success: true,
      configured: isPushConfigured(),
      publicKey: getVapidPublicKey() || null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
