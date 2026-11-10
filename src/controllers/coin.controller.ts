import { Response } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';

export const normalizeCoinSymbol = (coin: string): string => {
  const c = (coin || '').trim().toUpperCase();
  if (c === 'SOLANA') return 'SOL';
  if (c === 'BITCOIN') return 'BTC';
  if (c === 'ETHEREUM') return 'ETH';
  if (c === 'TETHER') return 'USDT';
  return c;
};

// ─── Public / User ────────────────────────────────────────────────────────────

/** GET /api/coins — all enabled CoinNetworks with their active wallet address */
export const getCoins = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const coins = await prisma.coinNetwork.findMany({
      where: { isEnabled: true },
      include: {
        walletAddresses: {
          where: { isActive: true },
          take: 1, // one active address per coin/network shown to user
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ coin: 'asc' }, { sortOrder: 'asc' }],
    });

    res.status(200).json({ data: coins });
  } catch (error) {
    logger.error('getCoins error:', error);
    res.status(500).json({ error: 'Failed to fetch coins' });
  }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

/** GET /api/admin/coins — all coins (including disabled) */
export const adminGetAllCoins = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const coins = await prisma.coinNetwork.findMany({
      include: { walletAddresses: true },
      orderBy: [{ coin: 'asc' }, { sortOrder: 'asc' }],
    });
    res.status(200).json({ data: coins });
  } catch (error) {
    logger.error('adminGetAllCoins error:', error);
    res.status(500).json({ error: 'Failed to fetch coins' });
  }
};

/** POST /api/admin/coins */
export const createCoin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rawCoin = (req.body.coin || '').trim().toUpperCase();
    const network = (req.body.network || '').trim();
    const label = (req.body.label || '').trim();
    const sortOrder = req.body.sortOrder;
    const coin = normalizeCoinSymbol(rawCoin);

    if (!coin || !network || !label) {
      res.status(400).json({ error: 'coin, network, and label are required' });
      return;
    }

    const existing = await prisma.coinNetwork.findUnique({ where: { coin_network: { coin, network } } });
    if (existing) {
      res.status(400).json({ error: 'This coin/network combination already exists' });
      return;
    }

    const coinNetwork = await prisma.coinNetwork.create({
      data: { coin, network, label, sortOrder: sortOrder ?? 0 },
    });

    res.status(201).json({ data: coinNetwork });
  } catch (error) {
    logger.error('createCoin error:', error);
    res.status(500).json({ error: 'Failed to create coin' });
  }
};

/** PUT /api/admin/coins/:id */
export const updateCoin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { label, isEnabled, sortOrder } = req.body;

    const coin = await prisma.coinNetwork.update({
      where: { id },
      data: {
        ...(label !== undefined && { label }),
        ...(isEnabled !== undefined && { isEnabled }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    res.status(200).json({ data: coin });
  } catch (error) {
    logger.error('updateCoin error:', error);
    res.status(500).json({ error: 'Failed to update coin' });
  }
};

/** POST /api/admin/coins/:id/addresses */
export const addWalletAddress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const coinNetworkId = req.params.id as string;
    const { address, label } = req.body;

    if (!address) {
      res.status(400).json({ error: 'address is required' });
      return;
    }

    const walletAddress = await prisma.adminWalletAddress.create({
      data: { coinNetworkId, address, label },
    });

    res.status(201).json({ data: walletAddress });
  } catch (error) {
    logger.error('addWalletAddress error:', error);
    res.status(500).json({ error: 'Failed to add wallet address' });
  }
};

/** PUT /api/admin/addresses/:id */
export const updateWalletAddress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { address, label, isActive } = req.body;

    const walletAddress = await prisma.adminWalletAddress.update({
      where: { id },
      data: {
        ...(address !== undefined && { address }),
        ...(label !== undefined && { label }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.status(200).json({ data: walletAddress });
  } catch (error) {
    logger.error('updateWalletAddress error:', error);
    res.status(500).json({ error: 'Failed to update wallet address' });
  }
};

/** DELETE /api/admin/coins/:id */
export const deleteCoin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const coin = await prisma.coinNetwork.findUnique({
      where: { id },
      include: {
        _count: {
          select: { deposits: true, withdrawals: true },
        },
      },
    });

    if (!coin) {
      res.status(404).json({ error: 'Coin not found' });
      return;
    }

    // 1. Delete associated admin wallet addresses
    await prisma.adminWalletAddress.deleteMany({ where: { coinNetworkId: id } });

    // 2. If deposits or withdrawals exist referencing this coinNetwork, delete associated referral bonuses & records so hard delete succeeds
    if (coin._count.deposits > 0 || coin._count.withdrawals > 0) {
      const deposits = await prisma.deposit.findMany({ where: { coinNetworkId: id }, select: { id: true } });
      const depositIds = deposits.map((d) => d.id);
      if (depositIds.length > 0) {
        await prisma.referralBonus.deleteMany({ where: { depositId: { in: depositIds } } });
        await prisma.deposit.deleteMany({ where: { id: { in: depositIds } } });
      }
      await prisma.withdrawal.deleteMany({ where: { coinNetworkId: id } });
    }

    // 3. Delete the coinNetwork
    await prisma.coinNetwork.delete({ where: { id } });
    res.status(200).json({ message: 'Coin deleted successfully' });
  } catch (error) {
    logger.error('deleteCoin error:', error);
    res.status(500).json({ error: 'Failed to delete coin' });
  }
};
