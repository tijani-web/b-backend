import { Request, Response } from 'express';
import { MarketService } from '../services/market.service';
import { logger } from '../utils/logger';

/** GET /api/market/all — returns all available assets with live prices and 24h market stats */
export const getAllMarketData = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await MarketService.getAllMarketData();
    res.status(200).json({ data, timestamp: Date.now() });
  } catch (error) {
    logger.error('Error in getAllMarketData:', error);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
};

/** GET /api/market/prices?symbols=BTC,ETH — returns flat { [symbol]: price } */
export const getPrices = async (req: Request, res: Response): Promise<void> => {
  try {
    const symbolsQuery = req.query.symbols as string;
    const symbols = symbolsQuery ? symbolsQuery.split(',').map(s => s.trim()).filter(Boolean) : [];
    const prices = await MarketService.getPrices(symbols);
    res.status(200).json({ data: prices });
  } catch (error) {
    logger.error('Error in getPrices:', error);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
};

/** GET /api/market/data?symbols=BTC,ETH — returns { [symbol]: AssetData } */
export const getMarketData = async (req: Request, res: Response): Promise<void> => {
  try {
    const symbolsQuery = req.query.symbols as string;
    if (!symbolsQuery) {
      const allData = await MarketService.getAllMarketData();
      res.status(200).json({ data: allData, timestamp: Date.now() });
      return;
    }
    const symbols = symbolsQuery.split(',').map(s => s.trim()).filter(Boolean);
    const data = await MarketService.getMarketData(symbols);
    res.status(200).json({ data, timestamp: Date.now() });
  } catch (error) {
    logger.error('Error in getMarketData:', error);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
};
