import { Router } from 'express';
import { executeTrade, copyTrader, buyMining } from '../controllers/trade.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.post('/execute', authenticate, executeTrade);
router.post('/copy', authenticate, copyTrader);
router.post('/mine', authenticate, buyMining);

export default router;
