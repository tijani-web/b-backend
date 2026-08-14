import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

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
    const { coin, network, label, sortOrder } = req.body;

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
    const { id } = req.params;
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
    const { id: coinNetworkId } = req.params;
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
    const { id } = req.params;
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
    const { id } = req.params;
    await prisma.coinNetwork.delete({ where: { id } });
    res.status(200).json({ message: 'Coin deleted' });
  } catch (error) {
    logger.error('deleteCoin error:', error);
    res.status(500).json({ error: 'Failed to delete coin' });
  }
};
