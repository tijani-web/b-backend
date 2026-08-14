import { Request, Response } from 'express';
import { MarketService } from '../services/market.service';
import { logger } from '../utils/logger';

export const getPrices = async (req: Request, res: Response): Promise<void> => {
  try {
    const symbolsQuery = req.query.symbols as string;
    
    if (!symbolsQuery) {
      res.status(400).json({ error: 'Please provide a comma-separated list of symbols (e.g. ?symbols=BTC,ETH)' });
      return;
    }

    const symbols = symbolsQuery.split(',').map(s => s.trim());
    const prices = await MarketService.getPrices(symbols);

    res.status(200).json({ data: prices });
  } catch (error) {
    logger.error('Error in getPrices:', error);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
};
