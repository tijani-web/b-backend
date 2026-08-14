import { Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';
import { EmailService } from '../services/email.service';

const prisma = new PrismaClient();

// ─── User withdrawal addresses ────────────────────────────────────────────────

/** GET /api/withdrawals/addresses */
export const getUserWithdrawalAddresses = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const addresses = await prisma.userWithdrawalAddress.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ data: addresses });
  } catch (error) {
    logger.error('getUserWithdrawalAddresses error:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawal addresses' });
  }
};

/** POST /api/withdrawals/addresses */
export const saveWithdrawalAddress = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.userId!;
    const { coin, network, address, label } = req.body;

    if (!coin || !network || !address) {
      res.status(400).json({ error: 'coin, network, and address are required' });
      return;
    }

    const saved = await prisma.userWithdrawalAddress.upsert({
      where: { userId_coin_network: { userId, coin, network } },
      update: { address, label: label || null },
      create: { userId, coin, network, address, label: label || null },
    });

    res.status(200).json({ data: saved });
  } catch (error) {
    logger.error('saveWithdrawalAddress error:', error);
    res.status(500).json({ error: 'Failed to save withdrawal address' });
  }
};

// ─── Withdrawals ──────────────────────────────────────────────────────────────

/** POST /api/withdrawals */
export const createWithdrawal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { coinNetworkId, amount, toAddress } = req.body;

    if (!coinNetworkId || !amount || !toAddress) {
      res.status(400).json({ error: 'coinNetworkId, amount, and toAddress are required' });
      return;
    }

    const parsedAmount = new Prisma.Decimal(amount);
    if (parsedAmount.lte(0)) {
      res.status(400).json({ error: 'Amount must be greater than 0' });
      return;
    }

    const coinNetwork = await prisma.coinNetwork.findUnique({
      where: { id: coinNetworkId },
    });

    if (!coinNetwork || !coinNetwork.isEnabled) {
      res.status(400).json({ error: 'Coin/network is not available for withdrawals' });
      return;
    }

    // Check user balance
    const wallet = await prisma.wallet.findUnique({
      where: { userId_coin: { userId, coin: coinNetwork.coin } },
    });

    if (!wallet || wallet.balance.lt(parsedAmount)) {
      res.status(400).json({ error: 'Insufficient balance' });
      return;
    }

    // Atomic: deduct balance + create withdrawal (reserve funds)
    const [withdrawal] = await prisma.$transaction([
      prisma.withdrawal.create({
        data: {
          userId,
          coinNetworkId,
          coin: coinNetwork.coin,
          network: coinNetwork.network,
          amount: parsedAmount,
          toAddress,
          status: 'PENDING',
        },
      }),
      prisma.wallet.update({
        where: { userId_coin: { userId, coin: coinNetwork.coin } },
        data: { balance: { decrement: parsedAmount } },
      }),
    ]);

    res.status(201).json({
      data: withdrawal,
      message: 'Withdrawal request submitted. Awaiting admin approval.',
    });
  } catch (error) {
    logger.error('createWithdrawal error:', error);
    res.status(500).json({ error: 'Failed to submit withdrawal' });
  }
};

/** GET /api/withdrawals */
export const getUserWithdrawals = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { coinNetwork: { select: { label: true } } },
      }),
      prisma.withdrawal.count({ where: { userId } }),
    ]);

    res.status(200).json({
      data: withdrawals,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('getUserWithdrawals error:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

/** GET /api/admin/withdrawals */
export const adminGetAllWithdrawals = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const { status, coin } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (coin) where.coin = coin;

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, fullName: true } },
          coinNetwork: true,
        },
      }),
      prisma.withdrawal.count({ where }),
    ]);

    res.status(200).json({
      data: withdrawals,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('adminGetAllWithdrawals error:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
};

/** PUT /api/admin/withdrawals/:id/approve */
export const approveWithdrawal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = req.userId!;

    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });

    if (!withdrawal) {
      res.status(404).json({ error: 'Withdrawal not found' });
      return;
    }
    if (withdrawal.status !== 'PENDING') {
      res.status(400).json({ error: `Withdrawal is already ${withdrawal.status}` });
      return;
    }

    // Balance already deducted at request time — just mark as COMPLETED
    const updated = await prisma.withdrawal.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        completedAt: new Date(),
      },
    });

    await EmailService.sendWithdrawalStatusEmail(
      (withdrawal as any).user.email,
      'APPROVED',
      withdrawal.amount.toString(),
      withdrawal.coin,
      withdrawal.toAddress
    );

    res.status(200).json({ data: updated, message: 'Withdrawal approved and marked as completed' });
  } catch (error) {
    logger.error('approveWithdrawal error:', error);
    res.status(500).json({ error: 'Failed to approve withdrawal' });
  }
};

/** PUT /api/admin/withdrawals/:id/reject */
export const rejectWithdrawal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = req.userId!;
    const { reason } = req.body;

    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });

    if (!withdrawal) {
      res.status(404).json({ error: 'Withdrawal not found' });
      return;
    }
    if (withdrawal.status !== 'PENDING') {
      res.status(400).json({ error: `Withdrawal is already ${withdrawal.status}` });
      return;
    }

    // Atomic: refund balance + mark rejected
    const [updated] = await prisma.$transaction([
      prisma.withdrawal.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason || null,
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      }),
      prisma.wallet.update({
        where: { userId_coin: { userId: withdrawal.userId, coin: withdrawal.coin } },
        data: { balance: { increment: withdrawal.amount } },
      }),
    ]);

    await EmailService.sendWithdrawalStatusEmail(
      (withdrawal as any).user.email,
      'REJECTED',
      withdrawal.amount.toString(),
      withdrawal.coin,
      withdrawal.toAddress,
      reason
    );

    res.status(200).json({ data: updated, message: 'Withdrawal rejected and balance refunded' });
  } catch (error) {
    logger.error('rejectWithdrawal error:', error);
    res.status(500).json({ error: 'Failed to reject withdrawal' });
  }
};
