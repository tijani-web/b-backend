import { Response } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';

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
    const id = req.params.id as string;

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
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            type: true,
            status: true,
            amount: true,
            coin: true,
            category: true,
            adminNote: true,
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
      prisma.deposit.count({ where: { status: 'PENDING' } }).catch(() => 0),
      prisma.withdrawal.count({ where: { status: 'PENDING' } }).catch(() => 0),
      prisma.kycDocument.count({ where: { status: 'PENDING' } }).catch(() => 0),
      prisma.user.count({ where: { role: 'USER' } }).catch(() => 0),
      prisma.deposit.count().catch(() => 0),
      prisma.withdrawal.count().catch(() => 0),
      // Per-coin deposit volume (approved only)
      prisma.deposit.groupBy({
        by: ['coin'],
        where: { status: 'APPROVED' },
        _sum: { amount: true },
      }).catch(() => [] as any[]),
      // Per-coin withdrawal volume (approved/completed)
      prisma.withdrawal.groupBy({
        by: ['coin'],
        where: { status: { in: ['APPROVED', 'COMPLETED'] } },
        _sum: { amount: true },
      }).catch(() => [] as any[]),
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

/** DELETE /api/admin/users/:id */
export const adminDeleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    // Prevent admin from deleting themselves
    if (user.id === req.userId) {
      res.status(400).json({ error: 'Cannot delete your own admin account' });
      return;
    }

    // Delete user and all related records in a transaction
    await prisma.$transaction([
      prisma.wallet.deleteMany({ where: { userId: id } }),
      prisma.transaction.deleteMany({ where: { userId: id } }),
      prisma.copyTrade.deleteMany({ where: { userId: id } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
      prisma.deposit.deleteMany({ where: { userId: id } }),
      prisma.withdrawal.deleteMany({ where: { userId: id } }),
      prisma.kycDocument.deleteMany({ where: { userId: id } }),
      prisma.userWithdrawalAddress.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);

    res.status(200).json({ message: 'User and all related records deleted successfully' });
  } catch (error) {
    logger.error('adminDeleteUser error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

/**
 * POST /api/admin/users/:id/credit-profit
 * Manually credit a profit / bonus to a user's USDT wallet.
 * Body: { category, coin?, amount, note? }
 */
export const adminCreditProfit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.params.id as string;
    const { category, coin = 'USDT', amount, note } = req.body as {
      category: string;
      coin?: string;
      amount: number;
      note?: string;
    };

    if (!category || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ error: 'category and a positive amount are required' });
      return;
    }

    const creditAmount = Number(amount);

    // Atomically credit wallet + create transaction record
    await prisma.$transaction(async (tx) => {
      // Upsert wallet balance
      await tx.wallet.upsert({
        where: { userId_coin: { userId, coin } },
        update: { balance: { increment: creditAmount } },
        create: { userId, coin, balance: creditAmount },
      });

      // Create transaction history record
      await tx.transaction.create({
        data: {
          userId,
          type: 'PROFIT',
          asset: coin,
          amount: creditAmount,
          status: 'COMPLETED',
          category,
          adminNote: note || null,
        },
      });

      // Create in-app notification
      await (tx as any).notification.create({
        data: {
          userId,
          title: '💰 Profit Credited',
          message: `${creditAmount} ${coin} has been credited to your account${note ? `: ${note}` : ''}.`,
          type: 'SUCCESS',
        },
      });
    });

    res.status(200).json({ message: `${creditAmount} ${coin} successfully credited to user` });
  } catch (error) {
    logger.error('adminCreditProfit error:', error);
    res.status(500).json({ error: 'Failed to credit profit' });
  }
};

/**
 * POST /api/admin/users/:id/approve-welcome-bonus
 * Approve the pending $15 welcome bonus for a user.
 */
export const adminApproveWelcomeBonus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.params.id as string;

    // Find the pending welcome bonus transaction (created as SIGNUP_BONUS in auth.controller)
    const pending = await prisma.transaction.findFirst({
      where: { userId, type: { in: ['SIGNUP_BONUS', 'WELCOME_BONUS'] as any }, status: 'PENDING' },
    });

    if (!pending) {
      res.status(404).json({ error: 'No pending welcome bonus found for this user' });
      return;
    }

    const bonusAmount = Number(pending.amount);

    await prisma.$transaction(async (tx) => {
      // Mark the transaction as completed
      await tx.transaction.update({
        where: { id: pending.id },
        data: { status: 'COMPLETED' },
      });

      // Credit the USDT wallet
      await tx.wallet.upsert({
        where: { userId_coin: { userId, coin: 'USDT' } },
        update: { balance: { increment: bonusAmount } },
        create: { userId, coin: 'USDT', balance: bonusAmount },
      });

      // Notify user
      await (tx as any).notification.create({
        data: {
          userId,
          title: '🎁 Welcome Bonus Approved!',
          message: `Your $${bonusAmount} USDT welcome bonus has been approved and added to your wallet.`,
          type: 'SUCCESS',
        },
      });
    });

    res.status(200).json({ message: `Welcome bonus of ${bonusAmount} USDT approved` });
  } catch (error) {
    logger.error('adminApproveWelcomeBonus error:', error);
    res.status(500).json({ error: 'Failed to approve welcome bonus' });
  }
};

