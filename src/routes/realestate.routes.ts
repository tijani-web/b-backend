import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate } from '../middlewares/auth';

const router = Router();

// ─── GET all projects ──────────────────────────────────────────────────────────
router.get('/projects', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const projects = await prisma.realEstateProject.findMany({
      where: {
        isActive: true,
        ...(status ? { status: String(status).toUpperCase() } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// ─── GET user investments ──────────────────────────────────────────────────────
router.get('/my', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const investments = await prisma.realEstateInvestment.findMany({
      where: { userId },
      include: { project: true },
      orderBy: { createdAt: 'desc' },
    });

    const totalInvested = investments.reduce((sum, i) => sum + Number(i.amount), 0);
    res.json({ investments, totalInvested });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch investments' });
  }
});

// ─── POST invest in a project ──────────────────────────────────────────────────
router.post('/invest', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { projectId, amount } = req.body;

    if (!projectId || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'projectId and amount are required' });
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Amount must be a valid positive number' });
    }

    const project = await prisma.realEstateProject.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.status !== 'OPEN') return res.status(400).json({ error: 'Project is closed' });

    if (amt < Number(project.minAmount)) {
      return res.status(400).json({ error: `Minimum investment is $${project.minAmount}` });
    }

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

      const investment = await tx.realEstateInvestment.create({
        data: { userId, projectId, amount: amt },
        include: { project: true },
      });

      return investment;
    });

    res.json({ investment: result });
  } catch (err: any) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: 'Insufficient USDT balance' });
    }
    res.status(500).json({ error: 'Investment failed' });
  }
});

export default router;
