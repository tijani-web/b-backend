import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

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

    if (!planId || !amount) {
      return res.status(400).json({ error: 'planId and amount are required' });
    }

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const amt = parseFloat(amount);
    if (amt < Number(plan.minAmount) || amt > Number(plan.maxAmount)) {
      return res.status(400).json({
        error: `Amount must be between $${plan.minAmount} and $${plan.maxAmount}`,
      });
    }

    // Check if user already has an active subscription
    const existing = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
    if (existing) {
      return res.status(400).json({ error: 'You already have an active subscription' });
    }

    // Check balance and deduct
    const wallet = await prisma.wallet.findUnique({
      where: { userId_coin: { userId, coin: 'USDT' } }
    });
    
    if (!wallet || Number(wallet.balance) < amt) {
      return res.status(400).json({ error: 'Insufficient USDT balance' });
    }

    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amt } }
    });

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.durationDays);

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        planId,
        amount: amt,
        endDate,
        status: 'ACTIVE',
      },
      include: { plan: true },
    });

    res.json({ subscription });
  } catch (err) {
    res.status(500).json({ error: 'Subscription failed' });
  }
});

export default router;
