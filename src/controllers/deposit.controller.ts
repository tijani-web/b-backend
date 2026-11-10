import { Response } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';
import { EmailService } from '../services/email.service';
import { normalizeCoinSymbol } from './coin.controller';

// ─── User ─────────────────────────────────────────────────────────────────────

/** POST /api/deposits */
export const createDeposit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { coinNetworkId, amount, txHash } = req.body;
    const proofUrl = (req as any).file
      ? `/uploads/proofs/${(req as any).file.filename}`
      : undefined;

    if (!coinNetworkId || amount === undefined || amount === null) {
      res.status(400).json({ error: 'coinNetworkId and amount are required' });
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'Amount must be a valid positive number' });
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
    const coin = normalizeCoinSymbol(coinNetwork.coin);

    const deposit = await prisma.deposit.create({
      data: {
        userId,
        coinNetworkId,
        coin,
        network: coinNetwork.network,
        amount,
        txHash: txHash || null,
        proofUrl: proofUrl || null,
        walletAddressUsed,
        status: 'PENDING',
      },
    });

    // In-app notification: deposit submitted
    try {
      await (prisma as any).notification.create({
        data: {
          userId,
          title: '📥 Deposit Submitted',
          message: `Your deposit of ${numAmount} ${coinNetwork.coin} has been submitted and is awaiting admin approval.`,
          type: 'INFO',
          isRead: false,
        },
      });
    } catch (_) {}

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
    const id = req.params.id as string;
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

    const targetCoin = normalizeCoinSymbol(deposit.coin);

    // Atomic: credit wallet + mark approved
    const [updatedDeposit] = await prisma.$transaction([
      prisma.deposit.update({
        where: { id },
        data: { status: 'APPROVED', coin: targetCoin, reviewedBy: adminId, reviewedAt: new Date() },
        include: { user: { select: { email: true } } },
      }),
      prisma.wallet.upsert({
        where: { userId_coin: { userId: deposit.userId, coin: targetCoin } },
        update: { balance: { increment: deposit.amount } },
        create: { userId: deposit.userId, coin: targetCoin, balance: deposit.amount },
      }),
    ]);

    // Notify user via email
    await EmailService.sendDepositStatusEmail(
      (updatedDeposit as any).user.email,
      'APPROVED',
      deposit.amount.toString(),
      deposit.coin
    );

    // In-app notification: deposit approved
    try {
      await (prisma as any).notification.create({
        data: {
          userId: deposit.userId,
          title: '✅ Deposit Approved',
          message: `Your deposit of ${deposit.amount} ${deposit.coin} has been approved and credited to your wallet.`,
          type: 'SUCCESS',
          isRead: false,
        },
      });
    } catch (_) {}

    // ── Referral Bonus: 5% of first deposit to referrer (PENDING admin approval) ──
    try {
      const depositingUser = await prisma.user.findUnique({
        where: { id: deposit.userId },
        select: { id: true, referredById: true },
      });

      if (depositingUser?.referredById) {
        // Only trigger on the user's first deposit (check if any referral bonus was already generated)
        const existingBonus = await prisma.referralBonus.findFirst({
          where: { referredUserId: deposit.userId },
        });

        if (!existingBonus) {
          const bonusAmount = Number(deposit.amount) * 0.05;
          await prisma.referralBonus.create({
            data: {
              referrerId: depositingUser.referredById,
              referredUserId: deposit.userId,
              depositId: deposit.id,
              amount: bonusAmount,
              coin: deposit.coin,
              status: 'PENDING',
            },
          });
          logger.info(
            `Recorded 5% referral bonus (${bonusAmount} ${deposit.coin}) as PENDING for referrer ${depositingUser.referredById}`
          );
        }
      }
    } catch (refErr) {
      logger.error('Error generating referral bonus on deposit approval:', refErr);
    }

    res.status(200).json({ data: updatedDeposit, message: 'Deposit approved and balance credited' });
  } catch (error) {
    logger.error('approveDeposit error:', error);
    res.status(500).json({ error: 'Failed to approve deposit' });
  }
};

/** PUT /api/admin/deposits/:id/reject */
export const rejectDeposit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
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

    // In-app notification: deposit rejected
    try {
      await (prisma as any).notification.create({
        data: {
          userId: deposit.userId,
          title: '❌ Deposit Rejected',
          message: `Your deposit of ${deposit.amount} ${deposit.coin} was rejected${reason ? `: ${reason}` : '. Please contact support for details.'}.`,
          type: 'ERROR',
          isRead: false,
        },
      });
    } catch (_) {}

    res.status(200).json({ data: updated, message: 'Deposit rejected' });
  } catch (error) {
    logger.error('rejectDeposit error:', error);
    res.status(500).json({ error: 'Failed to reject deposit' });
  }
};
