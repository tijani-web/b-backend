import { Router } from 'express';
import {
  executeTrade,
  copyTrader,
  buyMining,
  cancelMining,
  openTradePosition,
  closeTradePosition,
  cancelTradePosition,
} from '../controllers/trade.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.post('/execute', authenticate, executeTrade);
router.post('/position', authenticate, openTradePosition);
router.post('/position/:id/close', authenticate, closeTradePosition);
router.post('/position/:id/cancel', authenticate, cancelTradePosition);
router.post('/copy', authenticate, copyTrader);
router.post('/mine', authenticate, buyMining);
router.post('/mine/:id/cancel', authenticate, cancelMining);
router.post('/mine/cancel/:id', authenticate, cancelMining);

export default router;
