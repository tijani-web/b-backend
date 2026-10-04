import { Request, Response } from 'express';
import { MarketService } from '../services/market.service';
import { logger } from '../utils/logger';

export const getPrices = async (req: Request, res: Response): Promise<void> => {
  try {
    const symbolsQuery = req.query.symbols as string;
    if (!symbolsQuery) {
      res.status(400).json({ error: 'Provide comma-separated symbols, e.g. ?symbols=BTC,ETH' });
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

/** GET /api/market/data?symbols=BTC,ETH — returns { price, change24h } per symbol */
export const getMarketData = async (req: Request, res: Response): Promise<void> => {
  try {
    const symbolsQuery = req.query.symbols as string;
    if (!symbolsQuery) {
      res.status(400).json({ error: 'Provide comma-separated symbols, e.g. ?symbols=BTC,ETH' });
      return;
    }
    const symbols = symbolsQuery.split(',').map(s => s.trim());
    const data = await MarketService.getMarketData(symbols);
    res.status(200).json({ data });
  } catch (error) {
    logger.error('Error in getMarketData:', error);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
};
