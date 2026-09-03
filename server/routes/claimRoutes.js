import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware, requirePermission } from '../middleware/admin.js';
import * as claimController from '../controllers/claimController.js';

const router = Router();

// Public claim flow
router.post('/claim/start', claimController.startClaim);
router.get('/claim/preview/:tmdbPersonId', claimController.getClaimPreview);
router.get('/claim/status/:claimId', claimController.getClaimStatus);

// Social verification (authenticated user attaches their connected social identity)
router.post('/claim/verify/social', authMiddleware, claimController.verifyClaimSocial);

// Admin routes — require auth + admin + permission
router.get('/admin/claims', authMiddleware, adminMiddleware, requirePermission('creators.view'), claimController.adminListClaims);
router.post('/admin/claims/:claimId/approve', authMiddleware, adminMiddleware, requirePermission('creators.approve'), claimController.adminApproveClaim);
router.post('/admin/claims/:claimId/deny', authMiddleware, adminMiddleware, requirePermission('creators.approve'), claimController.adminDenyClaim);

export default router;