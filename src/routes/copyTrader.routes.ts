import { Router } from 'express';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { uploadAvatar } from '../services/upload.service';
import {
  publicListCopyTraders,
  listCopyTraders,
  createCopyTrader,
  updateCopyTrader,
  deleteCopyTrader,
  uploadTraderAvatar,
  copyTrader,
  cancelCopyTrade,
  getUserCopyTrades,
} from '../controllers/copyTrader.controller';

const router = Router();

// Public / User endpoints
router.get('/', authenticate, publicListCopyTraders);
router.get('/my', authenticate, getUserCopyTrades);
router.post('/copy', authenticate, copyTrader);
router.post('/cancel/:id', authenticate, cancelCopyTrade);

// Admin management
router.get('/admin', authenticate, requireAdmin, listCopyTraders);
router.post('/admin', authenticate, requireAdmin, createCopyTrader);
router.put('/admin/:id', authenticate, requireAdmin, updateCopyTrader);
router.delete('/admin/:id', authenticate, requireAdmin, deleteCopyTrader);
router.post('/admin/upload-avatar', authenticate, requireAdmin, uploadAvatar, uploadTraderAvatar);

export default router;
