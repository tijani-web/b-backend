import { Response } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';

/** GET /api/admin/copy-traders — list all traders */
export const listCopyTraders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const traders = await (prisma as any).copyTrader.findMany({
      orderBy: { createdAt: 'asc' },
    });
    res.json({ data: traders });
  } catch (error) {
    logger.error('listCopyTraders error:', error);
    res.status(500).json({ error: 'Failed to list traders' });
  }
};

/** POST /api/admin/copy-traders — create a trader */
export const createCopyTrader = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name, avatar, roi, winRate, aum, followers, risk,
      handle, profitShare, wins, losses, trades, minStartup, isActive,
    } = req.body;

    if (!name || !roi || !winRate) {
      res.status(400).json({ error: 'name, roi, and winRate are required' });
      return;
    }

    const trader = await prisma.copyTrader.create({
      data: {
        name,
        avatar: avatar || '🤖',
        roi,
        winRate,
        aum: aum || '$1.0M',
        followers: Number(followers) || 0,
        risk: risk || 'Medium',
        handle: handle || `@${name.toLowerCase().replace(/\s+/g, '')}`,
        profitShare: profitShare || '20%',
        wins: Number(wins) || 0,
        losses: Number(losses) || 0,
        trades: Number(trades) || 0,
        minStartup: minStartup || '$0',
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });
    res.status(201).json({ data: trader });
  } catch (error) {
    logger.error('createCopyTrader error:', error);
    res.status(500).json({ error: 'Failed to create trader' });
  }
};

/** PUT /api/admin/copy-traders/:id — update a trader */
export const updateCopyTrader = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const {
      name, avatar, roi, winRate, aum, followers, risk,
      handle, profitShare, wins, losses, trades, minStartup, isActive,
    } = req.body;

    const trader = await prisma.copyTrader.update({
      where: { id },
      data: {
        ...(name        !== undefined && { name }),
        ...(avatar      !== undefined && { avatar }),
        ...(roi         !== undefined && { roi }),
        ...(winRate     !== undefined && { winRate }),
        ...(aum         !== undefined && { aum }),
        ...(followers   !== undefined && { followers: Number(followers) }),
        ...(risk        !== undefined && { risk }),
        ...(handle      !== undefined && { handle }),
        ...(profitShare !== undefined && { profitShare }),
        ...(wins        !== undefined && { wins: Number(wins) }),
        ...(losses      !== undefined && { losses: Number(losses) }),
        ...(trades      !== undefined && { trades: Number(trades) }),
        ...(minStartup  !== undefined && { minStartup }),
        ...(isActive    !== undefined && { isActive: Boolean(isActive) }),
      },
    });
    res.json({ data: trader });
  } catch (error) {
    logger.error('updateCopyTrader error:', error);
    res.status(500).json({ error: 'Failed to update trader' });
  }
};

/** DELETE /api/admin/copy-traders/:id — delete a trader */
export const deleteCopyTrader = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await prisma.copyTrader.delete({ where: { id } });
    res.json({ message: 'Trader deleted' });
  } catch (error) {
    logger.error('deleteCopyTrader error:', error);
    res.status(500).json({ error: 'Failed to delete trader' });
  }
};

/** GET /api/copy-traders — public endpoint for users */
export const publicListCopyTraders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const traders = await (prisma as any).copyTrader.findMany({
      where: { isActive: true },
      orderBy: { followers: 'desc' },
    });
    res.json({ data: traders });
  } catch (error) {
    logger.error('publicListCopyTraders error:', error);
    res.status(500).json({ error: 'Failed to fetch traders' });
  }
};

/** POST /api/copy-traders/upload-avatar — upload avatar image */
export const uploadTraderAvatar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image file uploaded' });
      return;
    }
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    res.json({ data: { url: avatarUrl } });
  } catch (error) {
    logger.error('uploadTraderAvatar error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
};

/** POST /api/copy-traders/copy — user copies a trader */
export const copyTrader = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { traderId, amount, coin = 'USDT' } = req.body;
    if (!traderId || !amount || Number(amount) <= 0) {
      res.status(400).json({ error: 'Valid traderId and amount required' });
      return;
    }

    const copyAmount = Number(amount);

    // Atomically check wallet balance and deduct, plus create CopyTrade and Transaction
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId_coin: { userId, coin } },
      });
      if (!wallet || Number(wallet.balance) < copyAmount) {
        throw new Error(`Insufficient ${coin} balance to start copy trade`);
      }

      await tx.wallet.update({
        where: { userId_coin: { userId, coin } },
        data: { balance: { decrement: copyAmount } },
      });

      const copy = await tx.copyTrade.create({
        data: {
          userId,
          traderId,
          amount: copyAmount,
          status: 'ACTIVE',
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'TRADE',
          category: 'COPY_TRADE',
          asset: coin,
          amount: copyAmount,
          status: 'COMPLETED',
          adminNote: `Copy Trade started (ID: ${copy.id})`,
        },
      });

      // Increment trader followers
      await (tx as any).copyTrader.update({
        where: { id: traderId },
        data: { followers: { increment: 1 } },
      }).catch(() => {});

      return copy;
    });

    res.status(201).json({ data: result, message: 'Copy trade started successfully' });
  } catch (error: any) {
    logger.error('copyTrader error:', error);
    res.status(400).json({ error: error.message || 'Failed to start copy trade' });
  }
};

/** POST /api/copy-traders/cancel/:id — cancel active copy trade */
export const cancelCopyTrade = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const id = req.params.id as string;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const copy = await prisma.copyTrade.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        OR: [{ id }, { traderId: id }],
      },
    });

    if (!copy) {
      res.status(404).json({ error: 'Active copy trade not found' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.copyTrade.update({
        where: { id: copy.id },
        data: { status: 'CANCELLED' },
      });

      await tx.wallet.upsert({
        where: { userId_coin: { userId, coin: 'USDT' } },
        update: { balance: { increment: copy.amount } },
        create: { userId, coin: 'USDT', balance: copy.amount },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'TRADE',
          category: 'COPY_TRADE',
          asset: 'USDT',
          amount: copy.amount,
          status: 'COMPLETED',
          adminNote: `Copy Trade cancelled - refunded $${copy.amount}`,
        },
      });

      await (tx as any).copyTrader.update({
        where: { id: copy.traderId },
        data: { followers: { decrement: 1 } },
      }).catch(() => {});
    });

    res.json({ message: 'Copy trade cancelled and funds refunded' });
  } catch (error: any) {
    logger.error('cancelCopyTrade error:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel copy trade' });
  }
};

/** GET /api/copy-traders/my — get user's copy trades */
export const getUserCopyTrades = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const copies = await prisma.copyTrade.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: copies });
  } catch (error) {
    logger.error('getUserCopyTrades error:', error);
    res.status(500).json({ error: 'Failed to fetch copy trades' });
  }
};
