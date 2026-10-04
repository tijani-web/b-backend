import { logger } from '../utils/logger';

interface AssetData {
  price: number;
  change24h: number;
}

export class MarketService {
  private static readonly COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';

  static readonly SYMBOL_MAP: Record<string, string> = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
    'USDT': 'tether',
    'USDC': 'usd-coin',
    'BNB': 'binancecoin',
  };

  /** Returns { SYMBOL: { price, change24h } } */
  static async getMarketData(symbols: string[]): Promise<Record<string, AssetData>> {
    try {
      const ids = symbols.map(s => this.SYMBOL_MAP[s.toUpperCase()]).filter(Boolean);
      if (ids.length === 0) return {};

      const response = await fetch(
        `${this.COINGECKO_API_URL}/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`,
        { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(5000) }
      );

      if (!response.ok) throw new Error(`CoinGecko error: ${response.statusText}`);

      const data = await response.json();
      const result: Record<string, AssetData> = {};

      for (const symbol of symbols) {
        const id = this.SYMBOL_MAP[symbol.toUpperCase()];
        if (id && data[id]) {
          result[symbol.toUpperCase()] = {
            price: data[id].usd ?? 0,
            change24h: data[id].usd_24h_change ?? 0,
          };
        }
      }
      return result;
    } catch (error: any) {
      logger.error('Error fetching market data:', error.message);
      return {
        BTC:  { price: 65000, change24h: 0 },
        ETH:  { price: 3500,  change24h: 0 },
        SOL:  { price: 150,   change24h: 0 },
        USDT: { price: 1,     change24h: 0 },
        USDC: { price: 1,     change24h: 0 },
        BNB:  { price: 580,   change24h: 0 },
      };
    }
  }

  /** Legacy: flat price map for internal wallet balance calculations */
  static async getPrices(symbols: string[]): Promise<Record<string, number>> {
    const data = await this.getMarketData(symbols);
    const result: Record<string, number> = {};
    for (const [sym, d] of Object.entries(data)) result[sym] = d.price;
    return result;
  }
}
