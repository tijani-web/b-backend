import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';
import { EmailService } from '../services/email.service';

const prisma = new PrismaClient();

// ─── User ─────────────────────────────────────────────────────────────────────

/** POST /api/deposits */
export const createDeposit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { coinNetworkId, amount, txHash } = req.body;
    const proofUrl = (req as any).file
      ? `/uploads/proofs/${(req as any).file.filename}`
      : undefined;

    if (!coinNetworkId || !amount) {
      res.status(400).json({ error: 'coinNetworkId and amount are required' });
      return;
    }

    if (parseFloat(amount) <= 0) {
      res.status(400).json({ error: 'Amount must be greater than 0' });
      return;
    }

    // Check txHash uniqueness if provided
    if (txHash) {
      const duplicate = await prisma.deposit.findUnique({ where: { txHash } });
      if (duplicate) {
        res.status(400).json({ error: 'This transaction hash has already been submitted' });
        return;
      }
    }

    // Resolve coin/network
    const coinNetwork = await prisma.coinNetwork.findUnique({
      where: { id: coinNetworkId },
      include: {
        walletAddresses: { where: { isActive: true }, take: 1, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!coinNetwork || !coinNetwork.isEnabled) {
      res.status(400).json({ error: 'Coin/network is not available for deposits' });
      return;
    }

    if (coinNetwork.walletAddresses.length === 0) {
      res.status(400).json({ error: 'No active wallet address configured for this network. Contact support.' });
      return;
    }

    const walletAddressUsed = coinNetwork.walletAddresses[0].address;

    const deposit = await prisma.deposit.create({
      data: {
        userId,
        coinNetworkId,
        coin: coinNetwork.coin,
        network: coinNetwork.network,
        amount,
        txHash: txHash || null,
        proofUrl: proofUrl || null,
        walletAddressUsed,
        status: 'PENDING',
      },
    });

    res.status(201).json({
      data: deposit,
      message: 'Deposit submitted successfully. Awaiting admin approval.',
    });
  } catch (error) {
    logger.error('createDeposit error:', error);
    res.status(500).json({ error: 'Failed to submit deposit' });
  }
};

/** GET /api/deposits — current user's deposits */
export const getUserDeposits = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { coinNetwork: { select: { label: true } } },
      }),
      prisma.deposit.count({ where: { userId } }),
    ]);

    res.status(200).json({
      data: deposits,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('getUserDeposits error:', error);
    res.status(500).json({ error: 'Failed to fetch deposits' });
  }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

/** GET /api/admin/deposits */
export const adminGetAllDeposits = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const { status, coin } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (coin) where.coin = coin;

    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, fullName: true } },
          coinNetwork: true,
        },
      }),
      prisma.deposit.count({ where }),
    ]);

    res.status(200).json({
      data: deposits,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('adminGetAllDeposits error:', error);
    res.status(500).json({ error: 'Failed to fetch deposits' });
  }
};

/** PUT /api/admin/deposits/:id/approve */
export const approveDeposit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = req.userId!;

    const deposit = await prisma.deposit.findUnique({ where: { id } });
    if (!deposit) {
      res.status(404).json({ error: 'Deposit not found' });
      return;
    }
    if (deposit.status !== 'PENDING') {
      res.status(400).json({ error: `Deposit is already ${deposit.status}` });
      return;
    }

    // Atomic: credit wallet + mark approved
    const [updatedDeposit] = await prisma.$transaction([
      prisma.deposit.update({
        where: { id },
        data: { status: 'APPROVED', reviewedBy: adminId, reviewedAt: new Date() },
        include: { user: { select: { email: true } } },
      }),
      prisma.wallet.upsert({
        where: { userId_coin: { userId: deposit.userId, coin: deposit.coin } },
        update: { balance: { increment: deposit.amount } },
        create: { userId: deposit.userId, coin: deposit.coin, balance: deposit.amount },
      }),
    ]);

    // Notify user
    await EmailService.sendDepositStatusEmail(
      (updatedDeposit as any).user.email,
      'APPROVED',
      deposit.amount.toString(),
      deposit.coin
    );

    res.status(200).json({ data: updatedDeposit, message: 'Deposit approved and balance credited' });
  } catch (error) {
    logger.error('approveDeposit error:', error);
    res.status(500).json({ error: 'Failed to approve deposit' });
  }
};

/** PUT /api/admin/deposits/:id/reject */
export const rejectDeposit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = req.userId!;
    const { reason } = req.body;

    const deposit = await prisma.deposit.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });
    if (!deposit) {
      res.status(404).json({ error: 'Deposit not found' });
      return;
    }
    if (deposit.status !== 'PENDING') {
      res.status(400).json({ error: `Deposit is already ${deposit.status}` });
      return;
    }

    const updated = await prisma.deposit.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason || null,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });

    await EmailService.sendDepositStatusEmail(
      (deposit as any).user.email,
      'REJECTED',
      deposit.amount.toString(),
      deposit.coin,
      reason
    );

    res.status(200).json({ data: updated, message: 'Deposit rejected' });
  } catch (error) {
    logger.error('rejectDeposit error:', error);
    res.status(500).json({ error: 'Failed to reject deposit' });
  }
};
