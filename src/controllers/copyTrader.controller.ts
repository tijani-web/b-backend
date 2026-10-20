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
