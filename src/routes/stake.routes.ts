import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate } from '../middlewares/auth';

const router = Router();

// ─── GET user stakes ──────────────────────────────────────────────────────────
router.get('/my', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const [stakes, wallets] = await Promise.all([
      prisma.stake.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.wallet.findMany({
        where: { userId },
      }),
    ]);

    const activeStakesList = stakes.filter(s => s.status === 'ACTIVE');
    const closedStakesList = stakes.filter(s => s.status === 'CLOSED');

    const totalStaked = stakes.reduce((sum, s) => sum + Number(s.amount), 0);
    const activeAmount = activeStakesList.reduce((sum, s) => sum + Number(s.amount), 0);
    const closedAmount = closedStakesList.reduce((sum, s) => sum + Number(s.amount), 0);

    const balances: Record<string, number> = {};
    wallets.forEach(w => {
      balances[w.coin] = Number(w.balance);
    });

    res.json({
      stakes,
      totalStaked,
      activeAmount,
      activeStakes: activeStakesList.length,
      closedAmount,
      closedStakes: closedStakesList.length,
      balances,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stakes' });
  }
});

// ─── POST create stake ─────────────────────────────────────────────────────────
router.post('/create', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { coin, amount } = req.body;

    if (!coin || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'coin and amount are required' });
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Amount must be a valid positive number' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Check wallet balance
      const wallet = await tx.wallet.findUnique({
        where: { userId_coin: { userId, coin } }
      });
      
      if (!wallet || Number(wallet.balance) < amt) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      // Deduct from wallet
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amt } }
      });

      const stake = await tx.stake.create({
        data: { userId, coin, amount: amt, status: 'ACTIVE' },
      });

      return stake;
    });

    res.json({ stake: result });
  } catch (err: any) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: `Insufficient balance` });
    }
    res.status(500).json({ error: 'Staking failed' });
  }
});

export default router;
