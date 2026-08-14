import { Router } from 'express';
import {
  createWithdrawal,
  getUserWithdrawals,
  getUserWithdrawalAddresses,
  saveWithdrawalAddress,
  adminGetAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
} from '../controllers/withdrawal.controller';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

// User routes
router.post('/', authenticate, createWithdrawal);
router.get('/', authenticate, getUserWithdrawals);
router.get('/addresses', authenticate, getUserWithdrawalAddresses);
router.post('/addresses', authenticate, saveWithdrawalAddress);

// Admin routes
router.get('/admin', authenticate, requireAdmin, adminGetAllWithdrawals);
router.put('/admin/:id/approve', authenticate, requireAdmin, approveWithdrawal);
router.put('/admin/:id/reject', authenticate, requireAdmin, rejectWithdrawal);

export default router;
