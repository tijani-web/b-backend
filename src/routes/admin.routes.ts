import { Router } from 'express';
import { adminGetAllUsers, adminGetUser, adminGetStats, adminDeleteUser, adminCreditProfit, adminApproveWelcomeBonus } from '../controllers/admin.controller';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.get('/stats', authenticate, requireAdmin, adminGetStats);
router.get('/users', authenticate, requireAdmin, adminGetAllUsers);
router.get('/users/:id', authenticate, requireAdmin, adminGetUser);
router.delete('/users/:id', authenticate, requireAdmin, adminDeleteUser);
router.post('/users/:id/credit-profit', authenticate, requireAdmin, adminCreditProfit);
router.post('/users/:id/approve-welcome-bonus', authenticate, requireAdmin, adminApproveWelcomeBonus);


export default router;

