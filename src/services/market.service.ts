import { logger } from '../utils/logger';

export class MarketService {
  private static readonly COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';

  static async getPrices(symbols: string[]): Promise<Record<string, number>> {
    try {
      // CoinGecko uses specific ids for coins. Map our symbols to their ids.
      const symbolMap: Record<string, string> = {
        'BTC': 'bitcoin',
        'ETH': 'ethereum',
        'SOL': 'solana',
        'USDT': 'tether',
        'USDC': 'usd-coin',
        'BNB': 'binancecoin',
      };

      const ids = symbols.map(s => symbolMap[s.toUpperCase()]).filter(Boolean);
      
      if (ids.length === 0) return {};

      // We use the public free API for the prototype
      const response = await fetch(`${this.COINGECKO_API_URL}/simple/price?ids=${ids.join(',')}&vs_currencies=usd`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(2000)
      });

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      const result: Record<string, number> = {};
      
      // Map back to our symbols
      for (const symbol of symbols) {
        const id = symbolMap[symbol.toUpperCase()];
        if (id && data[id] && data[id].usd) {
          result[symbol.toUpperCase()] = data[id].usd;
        }
      }

      return result;
    } catch (error: any) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        logger.warn(`CoinGecko API timeout. Using fallback prices.`);
      } else {
        logger.error('Error fetching market prices:', error);
      }
      // Fallback prices in case of rate limiting
      return {
        'BTC': 65000.00,
        'ETH': 3500.00,
        'SOL': 150.00,
        'USDT': 1.00
      };
    }
  }
}
