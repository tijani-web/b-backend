import { Response } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';

/**
 * GET /api/referrals/my
 * Returns the authenticated user's referral code, statistics, and list of referred friends
 */
export const getUserReferralInfo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, referralCode: true, email: true, fullName: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // If for any reason user has no referral code, generate one now
    let referralCode = user.referralCode;
    if (!referralCode) {
      const crypto = await import('crypto');
      referralCode = 'BLF-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      await prisma.user.update({
        where: { id: userId },
        data: { referralCode },
      });
    }

    // Get referrals count and list
    const referrals = await prisma.user.findMany({
      where: { referredById: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        firstName: true,
        createdAt: true,
        referralBonusesGiven: {
          where: { referrerId: userId },
          select: {
            id: true,
            amount: true,
            coin: true,
            status: true,
            createdAt: true,
            approvedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate approved bonuses and pending bonuses
    const bonuses = await prisma.referralBonus.findMany({
      where: { referrerId: userId },
    });

    const totalEarned = bonuses
      .filter((b) => b.status === 'APPROVED')
      .reduce((sum, b) => sum + Number(b.amount), 0);

    const pendingBonus = bonuses
      .filter((b) => b.status === 'PENDING')
      .reduce((sum, b) => sum + Number(b.amount), 0);

    // Mask emails for privacy (e.g., jo***@gmail.com)
    const formattedReferrals = referrals.map((r) => {
      const emailParts = r.email.split('@');
      const namePart = emailParts[0];
      const maskedName = namePart.length > 2 ? `${namePart.slice(0, 2)}***` : `${namePart}***`;
      const maskedEmail = `${maskedName}@${emailParts[1] || ''}`;

      const bonusRecord = r.referralBonusesGiven[0] || null;

      return {
        id: r.id,
        name: r.fullName || r.firstName || maskedEmail,
        maskedEmail,
        joinedAt: r.createdAt,
        bonusStatus: bonusRecord ? bonusRecord.status : 'NO_DEPOSIT_YET',
        bonusAmount: bonusRecord ? Number(bonusRecord.amount) : 0,
        coin: bonusRecord ? bonusRecord.coin : 'USDT',
      };
    });

    res.status(200).json({
      referralCode,
      totalFriends: referrals.length,
      totalEarned: Number(totalEarned.toFixed(2)),
      pendingBonus: Number(pendingBonus.toFixed(2)),
      referrals: formattedReferrals,
    });
  } catch (error) {
    logger.error('getUserReferralInfo error:', error);
    res.status(500).json({ error: 'Failed to retrieve referral information' });
  }
};

/**
 * GET /api/referrals/admin
 * Admin: List all referral bonuses with status filter & pagination
 */
export const adminGetReferralBonuses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const { status } = req.query;

    const where: any = {};
    if (status && typeof status === 'string' && status !== 'ALL') {
      where.status = status;
    }

    const [bonuses, total] = await Promise.all([
      prisma.referralBonus.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          referrer: { select: { id: true, email: true, fullName: true, referralCode: true } },
          referredUser: { select: { id: true, email: true, fullName: true } },
          deposit: { select: { id: true, amount: true, coin: true, txHash: true, createdAt: true } },
        },
      }),
      prisma.referralBonus.count({ where }),
    ]);

    res.status(200).json({
      data: bonuses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('adminGetReferralBonuses error:', error);
    res.status(500).json({ error: 'Failed to fetch referral bonuses' });
  }
};

/**
 * PUT /api/referrals/admin/:id/approve
 * Admin: Approve a referral bonus and credit referrer's wallet
 */
export const adminApproveReferralBonus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const adminId = req.userId!;

    const bonus = await prisma.referralBonus.findUnique({
      where: { id },
      include: {
        referrer: { select: { id: true, email: true } },
      },
    });

    if (!bonus) {
      res.status(404).json({ error: 'Referral bonus record not found' });
      return;
    }

    if (bonus.status !== 'PENDING') {
      res.status(400).json({ error: `Bonus is already ${bonus.status}` });
      return;
    }

    // Atomic transaction: mark approved + credit referrer's wallet + record transaction
    const [updatedBonus] = await prisma.$transaction([
      prisma.referralBonus.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedBy: adminId,
          approvedAt: new Date(),
        },
      }),
      prisma.wallet.upsert({
        where: { userId_coin: { userId: bonus.referrerId, coin: bonus.coin } },
        update: { balance: { increment: bonus.amount } },
        create: { userId: bonus.referrerId, coin: bonus.coin, balance: bonus.amount },
      }),
      prisma.transaction.create({
        data: {
          userId: bonus.referrerId,
          type: 'REFERRAL_BONUS',
          asset: bonus.coin,
          amount: bonus.amount,
          usdValue: bonus.amount,
          status: 'COMPLETED',
          txHash: `REF_BONUS_${bonus.id.replace(/-/g, '').slice(0, 12)}`,
        },
      }),
    ]);

    logger.info(`Admin ${adminId} approved referral bonus ${id} of ${bonus.amount} ${bonus.coin} for user ${bonus.referrerId}`);

    res.status(200).json({
      message: 'Referral bonus approved and balance credited to referrer successfully',
      data: updatedBonus,
    });
  } catch (error) {
    logger.error('adminApproveReferralBonus error:', error);
    res.status(500).json({ error: 'Failed to approve referral bonus' });
  }
};

/**
 * PUT /api/referrals/admin/:id/reject
 * Admin: Reject a referral bonus
 */
export const adminRejectReferralBonus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const adminId = req.userId!;
    const { reason } = req.body;

    const bonus = await prisma.referralBonus.findUnique({ where: { id } });
    if (!bonus) {
      res.status(404).json({ error: 'Referral bonus record not found' });
      return;
    }

    if (bonus.status !== 'PENDING') {
      res.status(400).json({ error: `Bonus is already ${bonus.status}` });
      return;
    }

    const updatedBonus = await prisma.referralBonus.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason || 'Rejected by administrator',
        approvedBy: adminId,
        approvedAt: new Date(),
      },
    });

    res.status(200).json({
      message: 'Referral bonus rejected',
      data: updatedBonus,
    });
  } catch (error) {
    logger.error('adminRejectReferralBonus error:', error);
    res.status(500).json({ error: 'Failed to reject referral bonus' });
  }
};
