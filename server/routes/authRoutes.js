import { Router } from 'express'
import { authenticateToken } from '../middleware/auth.js'
import * as authController from '../controllers/authController.js'

const router = Router()

// ============ NEW PRODUCTION AUTH ROUTES ============

// Signup
router.post('/signup/viewer', authController.signupViewer)
router.post('/signup/creator-apply', authController.signupCreatorApply)

// Login (centralized)
router.post('/login', authController.login)

// Email verification
router.post('/verify-email', authController.verifyEmail)
router.post('/resend-verification', authController.resendVerification)
router.post('/login/verify', authController.loginVerify)

// Token management
router.post('/refresh', authController.refreshAccessToken)
router.post('/logout', authenticateToken, authController.logout)

// Profile
router.get('/me', authenticateToken, authController.getMe)

// Password reset
router.post('/forgot-password', authController.forgotPassword)
router.post('/reset-password', authController.resetPassword)

// Google OAuth (aliases for backward compatibility)
router.get('/google', authController.startGoogleAuth)
router.get('/google/callback', authController.googleCallback)

// Social OAuth (Facebook, Instagram, TikTok, Twitter/X, YouTube, Twitch, Discord + Google)
router.get('/social/providers', authController.socialProviders)
router.get('/social/:provider', authController.startSocialAuth)
router.get('/social/:provider/callback', authController.socialCallback)

// ============ DEPRECATED ROUTES → 308 PERMANENT REDIRECTS ============

// Old /register → new /signup/viewer
router.all('/register', (req, res) => res.redirect(308, '/api/auth/signup/viewer'))

// Old /creator/auth/login → new /login
router.all('/creator/auth/login', (req, res) => res.redirect(308, '/api/auth/login'))

// Old /creator/auth/register → new /signup/creator-apply
router.all('/creator/auth/register', (req, res) => res.redirect(308, '/api/auth/signup/creator-apply'))

// Old /creator/auth/forgot-password → new /forgot-password
router.all('/creator/auth/forgot-password', (req, res) => res.redirect(308, '/api/auth/forgot-password'))

// Old /creator/auth/reset-password → new /reset-password
router.all('/creator/auth/reset-password', (req, res) => res.redirect(308, '/api/auth/reset-password'))

// Old /creator/auth/login/verify → new /login/verify
router.all('/creator/auth/login/verify', (req, res) => res.redirect(308, '/api/auth/login/verify'))

export default router
