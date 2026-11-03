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

// Benchmark assets (Stocks, Commodities, Fiat, and secondary cryptos) with realistic 24/7 live movement
const BENCHMARK_ASSETS: Record<string, { price: number; change24h: number; high24h: number; low24h: number; volume24h: number }> = {
  // ── Stocks
  AAPL:  { price: 185.50, change24h: 0.65, high24h: 187.20, low24h: 184.10, volume24h: 54000000 },
  MSFT:  { price: 422.30, change24h: 0.92, high24h: 425.00, low24h: 418.50, volume24h: 22000000 },
  GOOGL: { price: 176.40, change24h: -0.25, high24h: 178.00, low24h: 175.10, volume24h: 19000000 },
  AMZN:  { price: 189.60, change24h: 1.34, high24h: 192.50, low24h: 187.00, volume24h: 38000000 },
  TSLA:  { price: 254.80, change24h: -1.85, high24h: 260.00, low24h: 250.20, volume24h: 75000000 },
  NVDA:  { price: 128.50, change24h: 3.20, high24h: 132.00, low24h: 126.00, volume24h: 98000000 },
  META:  { price: 512.40, change24h: 1.10, high24h: 518.00, low24h: 508.00, volume24h: 18000000 },
  NFLX:  { price: 648.20, change24h: 1.45, high24h: 654.00, low24h: 641.00, volume24h: 5200000 },
  AMD:   { price: 164.20, change24h: 2.10, high24h: 168.00, low24h: 161.50, volume24h: 42000000 },
  INTC:  { price: 31.80,  change24h: -0.85, high24h: 32.50, low24h: 31.20, volume24h: 31000000 },
  CRM:   { price: 295.40, change24h: 0.40, high24h: 298.00, low24h: 292.00, volume24h: 6800000 },
  ORCL:  { price: 142.80, change24h: 0.75, high24h: 145.00, low24h: 141.00, volume24h: 9400000 },
  IBM:   { price: 194.50, change24h: -0.15, high24h: 196.50, low24h: 193.00, volume24h: 4300000 },
  CSCO:  { price: 51.90,  change24h: 0.30, high24h: 52.50, low24h: 51.20, volume24h: 15000000 },
  ADBE:  { price: 538.20, change24h: -0.65, high24h: 545.00, low24h: 532.00, volume24h: 3200000 },
  PYPL:  { price: 65.40,  change24h: 1.80, high24h: 67.00, low24h: 64.20, volume24h: 12000000 },
  SQ:    { price: 68.90,  change24h: 2.30, high24h: 71.00, low24h: 67.50, volume24h: 8900000 },
  COIN:  { price: 236.40, change24h: 4.10, high24h: 242.00, low24h: 228.00, volume24h: 14000000 },
  HOOD:  { price: 22.80,  change24h: 3.50, high24h: 23.50, low24h: 21.90, volume24h: 16000000 },
  JPM:   { price: 204.80, change24h: 0.55, high24h: 207.00, low24h: 203.00, volume24h: 11000000 },
  GS:    { price: 466.20, change24h: 0.80, high24h: 470.00, low24h: 462.00, volume24h: 2800000 },
  BAC:   { price: 39.70,  change24h: 0.40, high24h: 40.20, low24h: 39.20, volume24h: 29000000 },
  V:     { price: 278.60, change24h: 0.25, high24h: 281.00, low24h: 276.50, volume24h: 7500000 },
  MA:    { price: 462.40, change24h: 0.35, high24h: 466.00, low24h: 459.00, volume24h: 3400000 },
  DIS:   { price: 104.50, change24h: -0.45, high24h: 106.00, low24h: 103.50, volume24h: 9800000 },
  SPOT:  { price: 326.80, change24h: 2.15, high24h: 332.00, low24h: 321.00, volume24h: 2400000 },
  SNAP:  { price: 15.40,  change24h: -1.20, high24h: 16.00, low24h: 15.10, volume24h: 21000000 },
  TWTR:  { price: 54.20,  change24h: 0.00, high24h: 54.20, low24h: 54.20, volume24h: 0 },
  UBER:  { price: 73.20,  change24h: 1.65, high24h: 74.50, low24h: 72.00, volume24h: 17000000 },
  LYFT:  { price: 14.90,  change24h: 0.90, high24h: 15.40, low24h: 14.50, volume24h: 11000000 },
  ABNB:  { price: 149.20, change24h: -0.75, high24h: 152.00, low24h: 147.50, volume24h: 4800000 },
  SHOP:  { price: 68.70,  change24h: 2.40, high24h: 70.50, low24h: 67.00, volume24h: 13000000 },
  ZM:    { price: 65.80,  change24h: 0.15, high24h: 67.00, low24h: 65.00, volume24h: 3500000 },
  PLTR:  { price: 28.60,  change24h: 3.80, high24h: 29.80, low24h: 27.50, volume24h: 45000000 },
  NKE:   { price: 95.80,  change24h: -0.50, high24h: 97.20, low24h: 94.80, volume24h: 8900000 },
  SBUX:  { price: 82.70,  change24h: 0.60, high24h: 84.00, low24h: 81.80, volume24h: 7400000 },
  MCD:   { price: 265.40, change24h: 0.30, high24h: 268.00, low24h: 263.50, volume24h: 3800000 },
  KO:    { price: 63.20,  change24h: 0.10, high24h: 63.80, low24h: 62.80, volume24h: 14000000 },
  PEP:   { price: 168.90, change24h: -0.20, high24h: 170.50, low24h: 167.50, volume24h: 5600000 },
  WMT:   { price: 68.80,  change24h: 0.85, high24h: 69.50, low24h: 68.00, volume24h: 18000000 },
  TGT:   { price: 146.80, change24h: 1.15, high24h: 149.00, low24h: 145.00, volume24h: 4500000 },
  AMGN:  { price: 316.20, change24h: 0.45, high24h: 320.00, low24h: 313.00, volume24h: 2200000 },
  JNJ:   { price: 153.40, change24h: -0.30, high24h: 155.00, low24h: 152.00, volume24h: 6700000 },
  PFE:   { price: 29.10,  change24h: 0.20, high24h: 29.60, low24h: 28.80, volume24h: 24000000 },
  MRNA:  { price: 126.40, change24h: -2.10, high24h: 130.00, low24h: 124.00, volume24h: 3900000 },
  BABA:  { price: 78.60,  change24h: 1.70, high24h: 80.50, low24h: 77.20, volume24h: 19000000 },
  TSM:   { price: 173.20, change24h: 2.80, high24h: 176.00, low24h: 170.50, volume24h: 15000000 },
  F:     { price: 12.30,  change24h: -0.60, high24h: 12.60, low24h: 12.10, volume24h: 41000000 },
  GM:    { price: 47.10,  change24h: 0.40, high24h: 48.00, low24h: 46.50, volume24h: 13000000 },
  BA:    { price: 183.40, change24h: -1.30, high24h: 187.00, low24h: 181.50, volume24h: 6200000 },
  XOM:   { price: 119.20, change24h: 0.80, high24h: 121.00, low24h: 118.00, volume24h: 14000000 },
  CVX:   { price: 157.10, change24h: 0.60, high24h: 159.00, low24h: 155.50, volume24h: 8900000 },

  // ── Fiat Assets
  EUR: { price: 1.0865, change24h: 0.12, high24h: 1.0895, low24h: 1.0830, volume24h: 850000000 },
  GBP: { price: 1.2940, change24h: -0.18, high24h: 1.2980, low24h: 1.2890, volume24h: 620000000 },
  JPY: { price: 0.00648, change24h: -0.45, high24h: 0.00655, low24h: 0.00642, volume24h: 710000000 },
  CNY: { price: 0.1382, change24h: 0.05, high24h: 0.1390, low24h: 0.1375, volume24h: 310000000 },
  CAD: { price: 0.7340, change24h: 0.08, high24h: 0.7380, low24h: 0.7310, volume24h: 240000000 },
  AUD: { price: 0.6645, change24h: 0.22, high24h: 0.6680, low24h: 0.6610, volume24h: 210000000 },
  CHF: { price: 1.1140, change24h: 0.15, high24h: 1.1180, low24h: 1.1100, volume24h: 180000000 },
  SGD: { price: 0.7550, change24h: 0.10, high24h: 0.7580, low24h: 0.7520, volume24h: 120000000 },
  HKD: { price: 0.1281, change24h: 0.02, high24h: 0.1285, low24h: 0.1278, volume24h: 190000000 },
  NZD: { price: 0.6120, change24h: 0.18, high24h: 0.6160, low24h: 0.6080, volume24h: 95000000 },
  INR: { price: 0.01202, change24h: -0.05, high24h: 0.01210, low24h: 0.01195, volume24h: 150000000 },
  BRL: { price: 0.1845, change24h: -0.30, high24h: 0.1870, low24h: 0.1820, volume24h: 88000000 },
  MXN: { price: 0.0542, change24h: -0.20, high24h: 0.0548, low24h: 0.0538, volume24h: 140000000 },
  NGN: { price: 0.00065, change24h: 0.10, high24h: 0.00066, low24h: 0.00064, volume24h: 45000000 },
  ZAR: { price: 0.0552, change24h: 0.40, high24h: 0.0560, low24h: 0.0546, volume24h: 76000000 },
  AED: { price: 0.2723, change24h: 0.00, high24h: 0.2725, low24h: 0.2721, volume24h: 110000000 },
  SAR: { price: 0.2665, change24h: 0.00, high24h: 0.2668, low24h: 0.2662, volume24h: 89000000 },
  TRY: { price: 0.0305, change24h: -0.80, high24h: 0.0310, low24h: 0.0301, volume24h: 64000000 },
  KRW: { price: 0.000732, change24h: -0.15, high24h: 0.000740, low24h: 0.000725, volume24h: 220000000 },
  SEK: { price: 0.0965, change24h: 0.25, high24h: 0.0975, low24h: 0.0955, volume24h: 58000000 },

  // ── Commodities
  GOLD:   { price: 2415.80, change24h: 0.48, high24h: 2428.00, low24h: 2405.00, volume24h: 185000 },
  SILVER: { price: 31.40,   change24h: -0.35, high24h: 31.80, low24h: 30.90, volume24h: 120000 },
  OIL:    { price: 79.60,   change24h: -1.15, high24h: 81.20, low24h: 78.80, volume24h: 420000 },
  BRENT:  { price: 83.80,   change24h: -0.95, high24h: 85.10, low24h: 82.90, volume24h: 360000 },
  GAS:    { price: 2.86,    change24h: 2.40, high24h: 2.95, low24h: 2.78, volume24h: 580000 },
  WHEAT:  { price: 574.50,  change24h: -0.60, high24h: 582.00, low24h: 568.00, volume24h: 94000 },
  CORN:   { price: 439.20,  change24h: 0.45, high24h: 444.00, low24h: 435.00, volume24h: 110000 },
  COFFE:  { price: 228.60,  change24h: 1.80, high24h: 233.00, low24h: 224.00, volume24h: 76000 },
  COCOA:  { price: 7890.00, change24h: 3.10, high24h: 8050.00, low24h: 7680.00, volume24h: 45000 },
  PLAT:   { price: 986.50,  change24h: 0.20, high24h: 995.00, low24h: 978.00, volume24h: 32000 },
  PALL:   { price: 981.20,  change24h: -0.80, high24h: 994.00, low24h: 970.00, volume24h: 28000 },
  COPP:   { price: 4.46,    change24h: 1.25, high24h: 4.54, low24h: 4.40, volume24h: 84000 },
  ALU:    { price: 2465.00, change24h: 0.50, high24h: 2490.00, low24h: 2440.00, volume24h: 51000 },
  NICKEL: { price: 17350.0, change24h: -1.10, high24h: 17600.0, low24h: 17100.0, volume24h: 39000 },
  ZINC:   { price: 2840.00, change24h: 0.35, high24h: 2870.00, low24h: 2810.00, volume24h: 43000 },
  SUGAR:  { price: 19.45,   change24h: -0.40, high24h: 19.80, low24h: 19.20, volume24h: 62000 },
  COTTON: { price: 77.10,   change24h: 0.70, high24h: 78.40, low24h: 76.20, volume24h: 37000 },
  SOYBN:  { price: 1184.00, change24h: -0.25, high24h: 1195.00, low24h: 1172.00, volume24h: 83000 },
  LIVEC:  { price: 184.80,  change24h: 0.15, high24h: 186.50, low24h: 183.00, volume24h: 29000 },
  LEAN:   { price: 92.60,   change24h: 0.55, high24h: 94.00, low24h: 91.50, volume24h: 24000 },

  // ── Secondary Cryptos
  CRO:   { price: 0.125, change24h: 1.80, high24h: 0.132, low24h: 0.120, volume24h: 28000000 },
  HOT:   { price: 0.00224, change24h: 0.90, high24h: 0.00235, low24h: 0.00215, volume24h: 18000000 },
  ZIL:   { price: 0.0242, change24h: -0.50, high24h: 0.0255, low24h: 0.0235, volume24h: 15000000 },
  ENJ:   { price: 0.324, change24h: 2.10, high24h: 0.340, low24h: 0.312, volume24h: 21000000 },
  GNO:   { price: 326.50, change24h: 0.40, high24h: 334.00, low24h: 320.00, volume24h: 8900000 },
  RPL:   { price: 24.80, change24h: -1.20, high24h: 25.60, low24h: 24.10, volume24h: 12000000 },
  BAL:   { price: 3.85, change24h: 1.40, high24h: 4.05, low24h: 3.70, volume24h: 9500000 },
  YFI:   { price: 7180.00, change24h: 2.60, high24h: 7350.00, low24h: 6980.00, volume24h: 34000000 },
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

      // Add and continuously fluctuate stocks, commodities, and fiat benchmarks 24/7
      for (const [sym, bench] of Object.entries(BENCHMARK_ASSETS)) {
        const existing = this.cache.get(sym);
        const basePrice = existing ? existing.price : bench.price;
        // Natural micro-fluctuation (random walk ±0.15%)
        const drift = (Math.random() - 0.495) * 0.003;
        const decimals = basePrice > 100 ? 2 : basePrice > 1 ? 4 : 6;
        const newPrice = Number((basePrice * (1 + drift)).toFixed(decimals));
        const newChange = Number((bench.change24h + (drift * 25)).toFixed(2));

        this.cache.set(sym, {
          symbol: sym,
          price: newPrice,
          change24h: newChange,
          high24h: Math.max(bench.high24h, newPrice),
          low24h: Math.min(bench.low24h, newPrice),
          volume24h: bench.volume24h,
          lastUpdated: now,
        });
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
