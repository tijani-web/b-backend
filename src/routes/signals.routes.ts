import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate } from '../middlewares/auth';

const router = Router();

// ─── GET all signal packages ────────────────────────────────────────────────────
router.get('/packages', authenticate as any, async (req: Request, res: Response) => {
  try {
    let packages = await prisma.signalPackage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (packages.length === 0) {
      const defaults = [
        { name: 'CD V1 Alpha', price: 250, strength: 20, sortOrder: 1 },
        { name: 'CD V2 Momentum', price: 500, strength: 40, sortOrder: 2 },
        { name: 'CD V3 Breakout', price: 1000, strength: 60, sortOrder: 3 },
        { name: 'CD V4 Institutional', price: 2500, strength: 80, sortOrder: 4 },
        { name: 'CD V5 Quantum AI', price: 5000, strength: 95, sortOrder: 5 },
      ];
      for (const p of defaults) {
        await prisma.signalPackage.create({ data: p });
      }
      packages = await prisma.signalPackage.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    }

    res.json({ packages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch signal packages' });
  }
});

// ─── GET user's signal purchases ───────────────────────────────────────────────
router.get('/my', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const [purchases, wallet] = await Promise.all([
      prisma.signalPurchase.findMany({
        where: { userId },
        include: { package: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.wallet.findUnique({
        where: { userId_coin: { userId, coin: 'USDT' } },
      }),
    ]);

    const balance = purchases
      .filter(p => p.status === 'ACTIVE')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const active = purchases.find(p => p.status === 'ACTIVE');

    res.json({
      purchases,
      balance,
      walletBalance: wallet ? Number(wallet.balance) : 0,
      activeSignal: active?.package?.name || null,
      activeStrength: active?.package?.strength || 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch signal purchases' });
  }
});

// ─── POST purchase signal ───────────────────────────────────────────────────────
router.post('/purchase', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { packageId, amount } = req.body;

    if (!packageId || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'packageId and amount are required' });
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Amount must be a valid positive number' });
    }

    const pkg = await prisma.signalPackage.findUnique({ where: { id: packageId } });
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const result = await prisma.$transaction(async (tx) => {
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

      const purchase = await tx.signalPurchase.create({
        data: {
          userId,
          packageId,
          amount: amt,
          status: 'ACTIVE',
        },
        include: { package: true },
      });

      return purchase;
    });

    res.json({ purchase: result });
  } catch (err: any) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: 'Insufficient USDT balance' });
    }
    res.status(500).json({ error: 'Purchase failed' });
  }
});

export default router;
