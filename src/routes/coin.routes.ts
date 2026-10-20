import { Router } from 'express';
import {
  getCoins,
  adminGetAllCoins,
  createCoin,
  updateCoin,
  deleteCoin,
  addWalletAddress,
  updateWalletAddress,
} from '../controllers/coin.controller';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

// Public / user
router.get('/', authenticate, getCoins);

// Admin
router.get('/admin', authenticate, requireAdmin, adminGetAllCoins);
router.post('/admin', authenticate, requireAdmin, createCoin);
router.put('/admin/:id', authenticate, requireAdmin, updateCoin);
router.delete('/admin/:id', authenticate, requireAdmin, deleteCoin);
router.post('/admin/:id/addresses', authenticate, requireAdmin, addWalletAddress);
router.put('/admin/addresses/:id', authenticate, requireAdmin, updateWalletAddress);

export default router;
