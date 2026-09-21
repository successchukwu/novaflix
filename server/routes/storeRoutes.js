import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { creatorOrAdminMiddleware } from '../middleware/admin.js'
import {
  createProductHandler, updateProductHandler, listProducts, getProduct, myProducts,
  checkout, verifyOrder, getOrders, getCreatorProducts,
} from '../controllers/storeController.js'
import multer from 'multer'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const router = Router()

router.get('/creator/:id', getCreatorProducts)
router.post('/', authMiddleware, creatorOrAdminMiddleware, upload.single('image'), createProductHandler)
router.patch('/:id', authMiddleware, creatorOrAdminMiddleware, upload.single('image'), updateProductHandler)
router.get('/', listProducts)
router.get('/mine', authMiddleware, creatorOrAdminMiddleware, myProducts)
router.get('/:id', getProduct)

router.post('/checkout', authMiddleware, checkout)
router.get('/checkout/verify', authMiddleware, verifyOrder)
router.get('/orders/mine', authMiddleware, getOrders)

export default router
