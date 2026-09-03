import { Router } from 'express'
import express from 'express'
import { authMiddleware } from '../middleware/auth.js'
import * as paymentController from '../controllers/paymentController.js'

const router = Router()

router.get('/pricing', paymentController.listPricing)
router.post('/initialize', authMiddleware, paymentController.initialize)
router.post('/validate-promo', authMiddleware, paymentController.validatePromoCode)
router.get('/verify', authMiddleware, paymentController.verify)
// Raw body parser for webhook signature verification
router.post('/webhook', express.raw({ type: 'application/json', limit: '1mb' }), paymentController.webhook)
router.get('/status', authMiddleware, paymentController.status)
router.get('/gateway-info', authMiddleware, paymentController.gatewayInfo)
router.get('/settings', paymentController.publicSettings)

export default router
