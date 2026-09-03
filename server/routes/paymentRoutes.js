import { Router } from 'express'
import express from 'express'
import { authMiddleware } from '../middleware/auth.js'
import * as paymentController from '../controllers/paymentController.js'

const router = Router()

router.get('/pricing', paymentController.listPricing)
router.post('/initialize', authMiddleware, paymentController.initialize)
router.post('/validate-promo', authMiddleware, paymentController.validatePromoCode)
router.get('/verify', authMiddleware, paymentController.verify)
// Webhook uses rawBody captured via express.json verify (server.js) for timingSafeEqual verification
router.post('/webhook', paymentController.webhook)
router.get('/webhook-info', paymentController.webhookInfo)
router.get('/webhook/info', paymentController.webhookInfo)
router.get('/status', authMiddleware, paymentController.status)
router.get('/gateway-info', authMiddleware, paymentController.gatewayInfo)
router.get('/settings', paymentController.publicSettings)

export default router
