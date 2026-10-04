import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

// ─── GET all signal packages ────────────────────────────────────────────────────
router.get('/packages', authenticate as any, async (req: Request, res: Response) => {
  try {
    const packages = await prisma.signalPackage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ packages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch signal packages' });
  }
});

// ─── GET user's signal purchases ───────────────────────────────────────────────
router.get('/my', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const purchases = await prisma.signalPurchase.findMany({
      where: { userId },
      include: { package: true },
      orderBy: { createdAt: 'desc' },
    });

    const balance = purchases
      .filter(p => p.status === 'ACTIVE')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const active = purchases.find(p => p.status === 'ACTIVE');

    res.json({ purchases, balance, activeSignal: active?.package?.name || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch signal purchases' });
  }
});

// ─── POST purchase signal ───────────────────────────────────────────────────────
router.post('/purchase', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { packageId, amount } = req.body;

    if (!packageId || !amount) {
      return res.status(400).json({ error: 'packageId and amount are required' });
    }

    const pkg = await prisma.signalPackage.findUnique({ where: { id: packageId } });
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const wallet = await prisma.wallet.findUnique({
      where: { userId_coin: { userId, coin: 'USDT' } }
    });

    const amt = parseFloat(amount);
    
    if (!wallet || Number(wallet.balance) < amt) {
      return res.status(400).json({ error: 'Insufficient USDT balance' });
    }

    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amt } }
    });

    const purchase = await prisma.signalPurchase.create({
      data: {
        userId,
        packageId,
        amount: amt,
        status: 'ACTIVE',
      },
      include: { package: true },
    });

    res.json({ purchase });
  } catch (err) {
    res.status(500).json({ error: 'Purchase failed' });
  }
});

export default router;
