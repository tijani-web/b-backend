import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

// ─── GET user stakes ──────────────────────────────────────────────────────────
router.get('/my', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const stakes = await prisma.stake.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const totalStaked = stakes.reduce((sum, s) => sum + Number(s.amount), 0);
    const activeStakes = stakes.filter(s => s.status === 'ACTIVE').length;
    const closedStakes = stakes.filter(s => s.status === 'CLOSED').length;

    res.json({ stakes, totalStaked, activeStakes, closedStakes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stakes' });
  }
});

// ─── POST create stake ─────────────────────────────────────────────────────────
router.post('/create', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { coin, amount } = req.body;

    if (!coin || !amount) {
      return res.status(400).json({ error: 'coin and amount are required' });
    }

    const amt = parseFloat(amount);
    
    // Check wallet balance
    const wallet = await prisma.wallet.findUnique({
      where: { userId_coin: { userId, coin } }
    });
    
    if (!wallet || Number(wallet.balance) < amt) {
      return res.status(400).json({ error: `Insufficient ${coin} balance` });
    }

    // Deduct from wallet
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amt } }
    });

    const stake = await prisma.stake.create({
      data: { userId, coin, amount: amt, status: 'ACTIVE' },
    });

    res.json({ stake });
  } catch (err) {
    res.status(500).json({ error: 'Staking failed' });
  }
});

export default router;
