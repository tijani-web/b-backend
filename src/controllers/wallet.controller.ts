import { Response } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';

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

    let wallets = await prisma.wallet.findMany({
      where: { userId },
    });

    // Merge any non-standard alias wallets (e.g. SOLANA -> SOL, BITCOIN -> BTC) into their canonical wallet
    const ALIAS_MAP: Record<string, string> = {
      SOLANA: 'SOL',
      BITCOIN: 'BTC',
      ETHEREUM: 'ETH',
      TETHER: 'USDT',
    };

    let needsRefetch = false;
    for (const w of wallets) {
      const canonical = ALIAS_MAP[w.coin.toUpperCase()];
      if (canonical && canonical !== w.coin) {
        const bal = Number(w.balance) || 0;
        if (bal > 0) {
          await prisma.wallet.upsert({
            where: { userId_coin: { userId, coin: canonical } },
            update: { balance: { increment: bal } },
            create: { userId, coin: canonical, balance: bal },
          });
        }
        await prisma.wallet.delete({ where: { id: w.id } }).catch(() => null);
        needsRefetch = true;
      }
    }

    if (needsRefetch) {
      wallets = await prisma.wallet.findMany({ where: { userId } });
    }

    // If user has no wallets yet, initialize standard primary wallets (USDT, BTC, ETH, SOL)
    if (wallets.length === 0) {
      const defaultCoins = ['USDT', 'BTC', 'ETH', 'SOL'];
      await prisma.wallet.createMany({
        data: defaultCoins.map(coin => ({
          userId,
          coin,
          balance: 0.00,
        })),
        skipDuplicates: true,
      });
      wallets = await prisma.wallet.findMany({
        where: { userId },
      });
    } else {
      // Ensure primary USDT wallet always exists
      const hasUSDT = wallets.some(w => w.coin === 'USDT');
      if (!hasUSDT) {
        const usdtWallet = await prisma.wallet.create({
          data: { userId, coin: 'USDT', balance: 0.00 },
        }).catch(() => null);
        if (usdtWallet) wallets.unshift(usdtWallet);
      }
    }

    // Sort: USDT first, then BTC, ETH, SOL, then alphabetical
    const priority = ['USDT', 'BTC', 'ETH', 'SOL'];
    wallets.sort((a, b) => {
      const idxA = priority.indexOf(a.coin);
      const idxB = priority.indexOf(b.coin);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.coin.localeCompare(b.coin);
    });

    res.status(200).json({ data: wallets });
  } catch (error) {
    logger.error('Get wallets error:', error);
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
};
