import { logger } from '../utils/logger';

export interface AssetData {
  symbol: string;
  price: number;
  change24h: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  lastUpdated?: number;
}

// Full catalogue of supported crypto pairs on Binance (mapped to *USDT)
const CRYPTO_PAIRS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'MATIC', 'DOT',
  'LTC', 'LINK', 'UNI', 'NEAR', 'SUI', 'APT', 'TRX', 'TON', 'PEPE', 'SHIB',
  'ATOM', 'ETC', 'FIL', 'ICP', 'INJ', 'AAVE', 'XLM', 'ALGO', 'BCH', 'HBAR',
  'EOS', 'SAND', 'MANA', 'AXS', 'FTM', 'THETA', 'EGLD', 'GRT', 'CRV', 'DYDX',
  'GMX', '1INCH', 'CHZ', 'BAT', 'OP', 'ARB', 'BONK', 'WIF', 'RNDR', 'FET',
  'WLD', 'PYTH', 'JTO', 'STX', 'IMX', 'DASH', 'ZEC', 'QNT', 'SUSHI', 'COMP',
  'MKR', 'SNX', 'LDO', 'KSM', 'VET', 'XMR', 'FLOW', 'ONE', 'XTZ', 'CAKE'
];

// Baseline fallbacks for initial startup if network is unavailable
const BASELINE_FALLBACKS: Record<string, { price: number; change24h: number; high24h: number; low24h: number; volume24h: number }> = {
  BTC:   { price: 82180, change24h: 1.45, high24h: 82950, low24h: 79800, volume24h: 18450 },
  ETH:   { price: 3240,  change24h: 0.85, high24h: 3310,  low24h: 3180,  volume24h: 142000 },
  SOL:   { price: 154,   change24h: 2.30, high24h: 158,   low24h: 148,   volume24h: 890000 },
  BNB:   { price: 585,   change24h: -0.40, high24h: 592,  low24h: 578,   volume24h: 98000 },
  XRP:   { price: 0.54,  change24h: -0.80, high24h: 0.56, low24h: 0.53, volume24h: 4500000 },
  DOGE:  { price: 0.14,  change24h: 3.10, high24h: 0.15,  low24h: 0.13,  volume24h: 12000000 },
  ADA:   { price: 0.49,  change24h: 0.60, high24h: 0.51,  low24h: 0.47,  volume24h: 3400000 },
  AVAX:  { price: 36.5,  change24h: -0.90, high24h: 38.0, low24h: 35.5, volume24h: 780000 },
  DOT:   { price: 7.4,   change24h: -0.30, high24h: 7.6,  low24h: 7.2,   volume24h: 560000 },
  LTC:   { price: 89.2,  change24h: -1.10, high24h: 91.0, low24h: 87.5, volume24h: 420000 },
  LINK:  { price: 14.8,  change24h: 1.15, high24h: 15.2,  low24h: 14.3,  volume24h: 650000 },
  TRX:   { price: 0.15,  change24h: 0.45, high24h: 0.16,  low24h: 0.14,  volume24h: 8900000 },
  TON:   { price: 6.2,   change24h: 1.90, high24h: 6.4,   low24h: 5.9,   volume24h: 1200000 },
  SUI:   { price: 2.15,  change24h: 4.80, high24h: 2.25,  low24h: 1.98,  volume24h: 3100000 },
  NEAR:  { price: 5.40,  change24h: 2.10, high24h: 5.60,  low24h: 5.20,  volume24h: 1450000 },
  PEPE:  { price: 0.0000125, change24h: 7.40, high24h: 0.0000135, low24h: 0.0000115, volume24h: 85000000 },
  SHIB:  { price: 0.0000185, change24h: 5.20, high24h: 0.0000195, low24h: 0.0000175, volume24h: 45000000 },
  USDT:  { price: 1.00,  change24h: 0.00, high24h: 1.00,  low24h: 1.00,  volume24h: 500000000 },
  USDC:  { price: 1.00,  change24h: 0.00, high24h: 1.00,  low24h: 1.00,  volume24h: 300000000 },
};

// Benchmark assets (Stocks, Commodities, Fiat) to power the Markets page
const BENCHMARK_ASSETS: Record<string, { price: number; change24h: number; high24h: number; low24h: number; volume24h: number }> = {
  // Stocks
  AAPL:  { price: 182.4, change24h: 0.65, high24h: 184.2, low24h: 181.1, volume24h: 54000000 },
  MSFT:  { price: 388.5, change24h: 0.92, high24h: 391.0, low24h: 385.2, volume24h: 22000000 },
  GOOGL: { price: 145.2, change24h: -0.25, high24h: 147.0, low24h: 144.1, volume24h: 19000000 },
  AMZN:  { price: 189.6, change24h: 1.34, high24h: 191.5, low24h: 187.0, volume24h: 38000000 },
  TSLA:  { price: 254.8, change24h: -1.85, high24h: 260.0, low24h: 250.2, volume24h: 75000000 },
  NVDA:  { price: 495.2, change24h: 3.20, high24h: 502.0, low24h: 488.0, volume24h: 48000000 },
  META:  { price: 492.3, change24h: 1.10, high24h: 496.0, low24h: 489.0, volume24h: 18000000 },
  // Commodities
  GOLD:   { price: 2042.5, change24h: 0.42, high24h: 2050.0, low24h: 2035.0, volume24h: 120000 },
  SILVER: { price: 25.10,  change24h: -0.35, high24h: 25.40, low24h: 24.80, volume24h: 85000 },
  OIL:    { price: 79.40,  change24h: -1.15, high24h: 80.80, low24h: 78.90, volume24h: 340000 },
  BRENT:  { price: 83.20,  change24h: -0.95, high24h: 84.50, low24h: 82.60, volume24h: 290000 },
  // Fiat
  EUR: { price: 1.085, change24h: 0.12, high24h: 1.088, low24h: 1.082, volume24h: 850000000 },
  GBP: { price: 1.272, change24h: -0.18, high24h: 1.276, low24h: 1.268, volume24h: 620000000 },
  JPY: { price: 0.0065, change24h: -0.45, high24h: 0.0066, low24h: 0.0064, volume24h: 710000000 },
  CAD: { price: 0.735, change24h: 0.08, high24h: 0.738, low24h: 0.732, volume24h: 240000000 },
  AUD: { price: 0.655, change24h: 0.22, high24h: 0.658, low24h: 0.651, volume24h: 210000000 },
};

export class MarketService {
  private static cache: Map<string, AssetData> = new Map();
  private static lastCacheTime = 0;
  private static readonly CACHE_TTL_MS = 6000; // 6-second in-memory cache to prevent upstream rate limits
  private static isFetching = false;

  /**
   * Refreshes the in-memory cache by querying the Binance public ticker API.
   * If Binance is unavailable, falls back gracefully to CoinCap or baseline benchmarks.
   */
  private static async refreshCache(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheTime < this.CACHE_TTL_MS && this.cache.size > 0) {
      return;
    }
    if (this.isFetching) {
      return; // Deduplicate simultaneous in-flight fetches
    }

    this.isFetching = true;
    try {
      // Build Binance query symbol pairs (e.g. ["BTCUSDT","ETHUSDT",...])
      const queryPairs = CRYPTO_PAIRS.map(sym => `"${sym}USDT"`);
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=[${encodeURIComponent(queryPairs.join(','))}]`;

      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        throw new Error(`Binance returned HTTP ${res.status}: ${res.statusText}`);
      }

      const tickers: any[] = await res.json();
      if (Array.isArray(tickers)) {
        for (const item of tickers) {
          const sym = item.symbol.replace(/USDT$/, '');
          const price = parseFloat(item.lastPrice);
          const change24h = parseFloat(item.priceChangePercent);
          const high24h = parseFloat(item.highPrice);
          const low24h = parseFloat(item.lowPrice);
          const volume24h = parseFloat(item.volume);

          if (!isNaN(price) && price > 0) {
            this.cache.set(sym, {
              symbol: sym,
              price,
              change24h: isNaN(change24h) ? 0 : change24h,
              high24h: isNaN(high24h) ? price : high24h,
              low24h: isNaN(low24h) ? price : low24h,
              volume24h: isNaN(volume24h) ? 0 : volume24h,
              lastUpdated: now,
            });
          }
        }
      }

      // Explicitly guarantee 1.00 pegs for stablecoins
      const stableCoins = ['USDT', 'USDC', 'USD', 'DAI', 'BUSD'];
      for (const sc of stableCoins) {
        this.cache.set(sc, {
          symbol: sc,
          price: 1.0,
          change24h: 0.0,
          high24h: 1.0,
          low24h: 1.0,
          volume24h: 500000000,
          lastUpdated: now,
        });
      }

      // Add stocks, commodities, and fiat benchmarks
      for (const [sym, bench] of Object.entries(BENCHMARK_ASSETS)) {
        if (!this.cache.has(sym)) {
          this.cache.set(sym, {
            symbol: sym,
            ...bench,
            lastUpdated: now,
          });
        }
      }

      this.lastCacheTime = now;
    } catch (err: any) {
      logger.warn(`Binance price fetch failed: ${err.message}. Trying CoinCap fallback...`);
      await this.fetchCoinCapFallback();
    } finally {
      this.isFetching = false;
    }

    // Ensure baseline values exist if cache is still empty
    if (this.cache.size === 0) {
      for (const [sym, data] of Object.entries(BASELINE_FALLBACKS)) {
        this.cache.set(sym, { symbol: sym, ...data, lastUpdated: now });
      }
      for (const [sym, data] of Object.entries(BENCHMARK_ASSETS)) {
        this.cache.set(sym, { symbol: sym, ...data, lastUpdated: now });
      }
    }
  }

  /** Secondary fallback if Binance is blocked or down */
  private static async fetchCoinCapFallback(): Promise<void> {
    try {
      const res = await fetch('https://api.coincap.io/v2/assets?limit=50', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return;

      const body = await res.json();
      if (Array.isArray(body.data)) {
        const now = Date.now();
        for (const asset of body.data) {
          const sym = (asset.symbol || '').toUpperCase();
          const price = parseFloat(asset.priceUsd);
          const change24h = parseFloat(asset.changePercent24Hr);
          if (!isNaN(price) && price > 0) {
            this.cache.set(sym, {
              symbol: sym,
              price,
              change24h: isNaN(change24h) ? 0 : change24h,
              high24h: price * 1.02,
              low24h: price * 0.98,
              volume24h: parseFloat(asset.volumeUsd24Hr) || 0,
              lastUpdated: now,
            });
          }
        }
        this.lastCacheTime = now;
      }
    } catch (e: any) {
      logger.warn(`CoinCap fallback also failed: ${e.message}`);
    }
  }

  /**
   * Returns all available market assets with full ticker statistics.
   */
  static async getAllMarketData(): Promise<Record<string, AssetData>> {
    await this.refreshCache();
    const result: Record<string, AssetData> = {};
    for (const [sym, data] of this.cache.entries()) {
      result[sym] = data;
    }
    return result;
  }

  /**
   * Returns market data for specific requested symbols.
   * If a requested symbol is not in the cache, searches case-insensitively or provides fallback.
   */
  static async getMarketData(symbols: string[]): Promise<Record<string, AssetData>> {
    await this.refreshCache();
    const result: Record<string, AssetData> = {};

    for (const rawSym of symbols) {
      const sym = rawSym.trim().toUpperCase();
      if (!sym) continue;

      if (['USDT', 'USDC', 'USD', 'DAI', 'BUSD'].includes(sym)) {
        result[sym] = {
          symbol: sym,
          price: 1.0,
          change24h: 0.0,
          high24h: 1.0,
          low24h: 1.0,
          volume24h: 100000000,
          lastUpdated: Date.now(),
        };
        continue;
      }

      if (this.cache.has(sym)) {
        result[sym] = this.cache.get(sym)!;
      } else if (BASELINE_FALLBACKS[sym]) {
        result[sym] = { symbol: sym, ...BASELINE_FALLBACKS[sym], lastUpdated: Date.now() };
      } else if (BENCHMARK_ASSETS[sym]) {
        result[sym] = { symbol: sym, ...BENCHMARK_ASSETS[sym], lastUpdated: Date.now() };
      } else {
        // Unknown coin - default safe 0 or price check
        result[sym] = { symbol: sym, price: 0, change24h: 0, lastUpdated: Date.now() };
      }
    }

    return result;
  }

  /**
   * Returns a flat map of symbol -> current price (number).
   * Used for wallet balance valuations and trade conversions.
   */
  static async getPrices(symbols: string[]): Promise<Record<string, number>> {
    if (!symbols || symbols.length === 0) {
      const all = await this.getAllMarketData();
      const res: Record<string, number> = {};
      for (const [sym, d] of Object.entries(all)) {
        res[sym] = d.price;
      }
      return res;
    }

    const data = await this.getMarketData(symbols);
    const result: Record<string, number> = {};
    for (const [sym, d] of Object.entries(data)) {
      result[sym] = d.price;
    }
    return result;
  }
}
