import { Router } from 'express';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { publicListCopyTraders, listCopyTraders, createCopyTrader, updateCopyTrader, deleteCopyTrader } from '../controllers/copyTrader.controller';

const router = Router();

// Public — authenticated users can fetch traders to copy
router.get('/', authenticate, publicListCopyTraders);

// Admin management
router.get('/admin',     authenticate, requireAdmin, listCopyTraders);
router.post('/admin',    authenticate, requireAdmin, createCopyTrader);
router.put('/admin/:id', authenticate, requireAdmin, updateCopyTrader);
router.delete('/admin/:id', authenticate, requireAdmin, deleteCopyTrader);

export default router;
