import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export const getTransactionHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where: { userId } }),
    ]);

    res.status(200).json({
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Transaction history error:', error);
    res.status(500).json({ error: 'Failed to fetch transaction history' });
  }
};

export const getWallets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const wallets = await prisma.wallet.findMany({
      where: { userId },
    });
    res.status(200).json({ data: wallets });
  } catch (error) {
    logger.error('Get wallets error:', error);
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
};
