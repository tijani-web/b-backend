import { Router } from 'express';
import {
  createDeposit,
  getUserDeposits,
  adminGetAllDeposits,
  approveDeposit,
  rejectDeposit,
} from '../controllers/deposit.controller';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { uploadProof } from '../services/upload.service';

const router = Router();

// User routes
router.post('/', authenticate, uploadProof, createDeposit);
router.get('/', authenticate, getUserDeposits);

// Admin routes
router.get('/admin', authenticate, requireAdmin, adminGetAllDeposits);
router.put('/admin/:id/approve', authenticate, requireAdmin, approveDeposit);
router.put('/admin/:id/reject', authenticate, requireAdmin, rejectDeposit);

export default router;
