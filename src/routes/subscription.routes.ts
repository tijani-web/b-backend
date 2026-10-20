import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate } from '../middlewares/auth';

const router = Router();

// ─── GET all plans ─────────────────────────────────────────────────────────────
router.get('/plans', authenticate as any, async (req: Request, res: Response) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ plans });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// ─── GET user subscriptions ────────────────────────────────────────────────────
router.get('/my', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const subscriptions = await prisma.subscription.findMany({
      where: { userId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate total balance (sum of active subscriptions amounts)
    const balance = subscriptions
      .filter(s => s.status === 'ACTIVE')
      .reduce((sum, s) => sum + Number(s.amount), 0);

    const active = subscriptions.find(s => s.status === 'ACTIVE');

    res.json({ subscriptions, balance, activePlan: active?.plan?.name || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// ─── POST subscribe ────────────────────────────────────────────────────────────
router.post('/subscribe', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { planId, amount } = req.body;

    if (!planId || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'planId and amount are required' });
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Amount must be a valid positive number' });
    }

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    if (amt < Number(plan.minAmount) || amt > Number(plan.maxAmount)) {
      return res.status(400).json({
        error: `Amount must be between $${plan.minAmount} and $${plan.maxAmount}`,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Check if user already has an active subscription
      const existing = await tx.subscription.findFirst({
        where: { userId, status: 'ACTIVE' },
      });
      if (existing) {
        throw new Error('ALREADY_SUBSCRIBED');
      }

      // Check balance and deduct
      const wallet = await tx.wallet.findUnique({
        where: { userId_coin: { userId, coin: 'USDT' } }
      });
      
      if (!wallet || Number(wallet.balance) < amt) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amt } }
      });

      const endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.durationDays);

      const subscription = await tx.subscription.create({
        data: {
          userId,
          planId,
          amount: amt,
          endDate,
          status: 'ACTIVE',
        },
        include: { plan: true },
      });

      return subscription;
    });

    res.json({ subscription: result });
  } catch (err: any) {
    if (err.message === 'ALREADY_SUBSCRIBED') {
      return res.status(400).json({ error: 'You already have an active subscription' });
    }
    if (err.message === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: 'Insufficient USDT balance' });
    }
    res.status(500).json({ error: 'Subscription failed' });
  }
});

export default router;
