import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/** GET /api/admin/users */
export const adminGetAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const { kycStatus, search } = req.query;

    const where: any = {};
    if (kycStatus) where.kycStatus = kycStatus;
    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: 'insensitive' } },
        { fullName: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          kycStatus: true,
          twoFactorEnabled: true,
          createdAt: true,
          wallets: { select: { coin: true, balance: true } },
          _count: {
            select: {
              deposits: true,
              withdrawals: true,
              kycDocuments: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.status(200).json({
      data: users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('adminGetAllUsers error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

/** GET /api/admin/users/:id */
export const adminGetUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        kycStatus: true,
        twoFactorEnabled: true,
        createdAt: true,
        wallets: true,
        deposits: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { coinNetwork: { select: { label: true } } },
        },
        withdrawals: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { coinNetwork: { select: { label: true } } },
        },
        kycDocuments: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            docType: true,
            fileName: true,
            status: true,
            rejectionReason: true,
            reviewedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json({ data: user });
  } catch (error) {
    logger.error('adminGetUser error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

/** GET /api/admin/stats — dashboard overview numbers */
export const adminGetStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [
      pendingDeposits,
      pendingWithdrawals,
      pendingKyc,
      totalUsers,
      totalDeposits,
      totalWithdrawals,
      depositsByCoin,
      withdrawalsByCoin,
    ] = await Promise.all([
      prisma.deposit.count({ where: { status: 'PENDING' } }),
      prisma.withdrawal.count({ where: { status: 'PENDING' } }),
      prisma.kycDocument.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.deposit.count(),
      prisma.withdrawal.count(),
      // Per-coin deposit volume (approved only)
      prisma.deposit.groupBy({
        by: ['coin'],
        where: { status: 'APPROVED' },
        _sum: { amount: true },
      }),
      // Per-coin withdrawal volume (approved/completed)
      prisma.withdrawal.groupBy({
        by: ['coin'],
        where: { status: { in: ['APPROVED', 'COMPLETED'] } },
        _sum: { amount: true },
      }),
    ]);

    // Convert groupBy results to { BTC: 0.2, ETH: 1.5, ... }
    const depositVolumeByCoin: Record<string, number> = {};
    for (const row of depositsByCoin) {
      depositVolumeByCoin[row.coin] = Number(row._sum.amount ?? 0);
    }
    const withdrawalVolumeByCoin: Record<string, number> = {};
    for (const row of withdrawalsByCoin) {
      withdrawalVolumeByCoin[row.coin] = Number(row._sum.amount ?? 0);
    }

    res.status(200).json({
      data: {
        pendingDeposits,
        pendingWithdrawals,
        pendingKyc,
        totalUsers,
        totalDeposits,
        totalWithdrawals,
        depositVolumeByCoin,
        withdrawalVolumeByCoin,
      },
    });
  } catch (error) {
    logger.error('adminGetStats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};
