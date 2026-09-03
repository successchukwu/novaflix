import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as walletController from '../controllers/walletController.js';

const router = Router();

// Wallet balance & transactions
router.get('/wallet/balance', authMiddleware, walletController.getBalance);
router.get('/wallet/transactions', authMiddleware, walletController.getTransactions);
router.get('/wallet/earnings', authMiddleware, walletController.getEarningsSummary);

// PPM
router.get('/wallet/ppm/rate', authMiddleware, walletController.getPPMRate);
router.get('/wallet/ppm/config', authMiddleware, walletController.getPPMConfig);
router.post('/wallet/ppm/credit', authMiddleware, walletController.creditPPMWatch);

// Tips & Gifts
router.post('/wallet/tip', authMiddleware, walletController.creditTip);
router.post('/wallet/gift', authMiddleware, walletController.creditGift);

// Withdrawal
router.get('/wallet/withdraw/preview', authMiddleware, walletController.previewWithdrawal);
router.post('/wallet/withdraw', authMiddleware, walletController.processWithdrawal);

export default router;