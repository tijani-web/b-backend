import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

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
    const { name, avatar, roi, winRate, aum, followers, risk } = req.body;
    if (!name || !roi || !winRate || !aum) {
      res.status(400).json({ error: 'name, roi, winRate, aum are required' });
      return;
    }
    const trader = await (prisma as any).copyTrader.create({
      data: {
        name,
        avatar: avatar || '🤖',
        roi,
        winRate,
        aum,
        followers: Number(followers) || 0,
        risk: risk || 'Medium',
        isActive: true,
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
    const { id } = req.params;
    const { name, avatar, roi, winRate, aum, followers, risk, isActive } = req.body;
    const trader = await (prisma as any).copyTrader.update({
      where: { id },
      data: {
        ...(name      !== undefined && { name }),
        ...(avatar    !== undefined && { avatar }),
        ...(roi       !== undefined && { roi }),
        ...(winRate   !== undefined && { winRate }),
        ...(aum       !== undefined && { aum }),
        ...(followers !== undefined && { followers: Number(followers) }),
        ...(risk      !== undefined && { risk }),
        ...(isActive  !== undefined && { isActive }),
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
    const { id } = req.params;
    await (prisma as any).copyTrader.delete({ where: { id } });
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
