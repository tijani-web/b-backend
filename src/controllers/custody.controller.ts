import { Response } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';

export const getDepositAddress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { asset } = req.body;

    if (!userId || !asset) {
      res.status(400).json({ error: 'User ID and asset are required' });
      return;
    }

    const coin = asset.toUpperCase();

    // Find active admin wallet address for this coin
    const adminAddr = await prisma.adminWalletAddress.findFirst({
      where: {
        isActive: true,
        coinNetwork: { coin, isEnabled: true },
      },
      include: { coinNetwork: true },
      orderBy: { createdAt: 'desc' },
    });

    // Ensure wallet exists for user
    const wallet = await prisma.wallet.upsert({
      where: { userId_coin: { userId, coin } },
      update: {},
      create: { userId, coin, balance: 0 },
    });

    res.status(200).json({
      address: adminAddr?.address || 'Contact support for deposit address',
      asset: coin,
      balance: wallet.balance,
    });
  } catch (error) {
    logger.error('Error handling deposit request:', error);
    res.status(500).json({ error: 'Failed to process deposit address' });
  }
};

export const withdraw = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { asset, amount: rawAmount, address } = req.body;
    const amount = Number(rawAmount);

    if (!userId || !asset || isNaN(amount) || amount <= 0 || !address) {
      res.status(400).json({ error: 'Valid asset, positive amount, and destination address are required' });
      return;
    }

    const coin = asset.toUpperCase();

    const wallet = await prisma.wallet.findUnique({
      where: { userId_coin: { userId, coin } },
    });

    if (!wallet || Number(wallet.balance) < amount) {
      res.status(400).json({ error: 'Insufficient balance' });
      return;
    }

    // Atomic: deduct balance + record pending withdrawal
    const createdTx = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      });

      return await tx.transaction.create({
        data: {
          userId,
          type: 'WITHDRAWAL',
          asset: coin,
          amount: amount,
          status: 'PENDING',
        },
      });
    });

    res.status(200).json({
      message: 'Withdrawal request submitted successfully. Awaiting processing.',
      txId: createdTx.id,
    });
  } catch (error) {
    logger.error('Withdrawal error:', error);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
};
