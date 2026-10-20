import { Router } from 'express';
import {
  getUserReferralInfo,
  adminGetReferralBonuses,
  adminApproveReferralBonus,
  adminRejectReferralBonus,
} from '../controllers/referral.controller';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

// User referral profile & stats
router.get('/my', authenticate, getUserReferralInfo);

// Admin management
router.get('/admin', authenticate, requireAdmin, adminGetReferralBonuses);
router.put('/admin/:id/approve', authenticate, requireAdmin, adminApproveReferralBonus);
router.put('/admin/:id/reject', authenticate, requireAdmin, adminRejectReferralBonus);

export default router;
