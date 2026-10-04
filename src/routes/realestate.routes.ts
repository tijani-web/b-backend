import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

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

    if (!projectId || !amount) {
      return res.status(400).json({ error: 'projectId and amount are required' });
    }

    const project = await prisma.realEstateProject.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.status !== 'OPEN') return res.status(400).json({ error: 'Project is closed' });

    const amt = parseFloat(amount);
    if (amt < Number(project.minAmount)) {
      return res.status(400).json({ error: `Minimum investment is $${project.minAmount}` });
    }

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

    const investment = await prisma.realEstateInvestment.create({
      data: { userId, projectId, amount: amt },
      include: { project: true },
    });

    res.json({ investment });
  } catch (err) {
    res.status(500).json({ error: 'Investment failed' });
  }
});

export default router;
