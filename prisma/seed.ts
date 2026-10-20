import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Best-known production coin/network catalogue with correct display labels
const COINS = [
  // Bitcoin
  { coin: 'BTC',  network: 'Bitcoin',  label: 'BTC (Bitcoin)',        sortOrder: 1 },

  // Ethereum
  { coin: 'ETH',  network: 'ERC20',    label: 'ETH (ERC20)',          sortOrder: 2 },

  // USDT — 3 networks
  { coin: 'USDT', network: 'TRC20',    label: 'USDT (TRC20)',         sortOrder: 3 },
  { coin: 'USDT', network: 'ERC20',    label: 'USDT (ERC20)',         sortOrder: 4 },
  { coin: 'USDT', network: 'BEP20',    label: 'USDT (BEP20/BSC)',     sortOrder: 5 },

  // USDC — 2 networks
  { coin: 'USDC', network: 'ERC20',    label: 'USDC (ERC20)',         sortOrder: 6 },
  { coin: 'USDC', network: 'TRC20',    label: 'USDC (TRC20)',         sortOrder: 7 },

  // BNB
  { coin: 'BNB',  network: 'BEP20',    label: 'BNB (BEP20/BSC)',      sortOrder: 8 },
  { coin: 'BNB',  network: 'ERC20',    label: 'BNB (ERC20)',          sortOrder: 9 },

  // Solana
  { coin: 'SOL',  network: 'Solana',   label: 'SOL (Solana)',         sortOrder: 10 },

  // XRP
  { coin: 'XRP',  network: 'Ripple',   label: 'XRP (Ripple)',         sortOrder: 11 },

  // LTC
  { coin: 'LTC',  network: 'Litecoin', label: 'LTC (Litecoin)',       sortOrder: 12 },

  // TRX
  { coin: 'TRX',  network: 'TRC20',    label: 'TRX (TRON)',           sortOrder: 13 },

  // DOGE
  { coin: 'DOGE', network: 'Dogecoin', label: 'DOGE (Dogecoin)',      sortOrder: 14 },

  // TON
  { coin: 'TON',  network: 'TON',      label: 'TON (TON Network)',    sortOrder: 15 },
];

async function main() {
  console.log('Seeding coin/network catalogue...');

  for (const coin of COINS) {
    await prisma.coinNetwork.upsert({
      where: { coin_network: { coin: coin.coin, network: coin.network } },
      update: { label: coin.label, sortOrder: coin.sortOrder },
      create: {
        coin: coin.coin,
        network: coin.network,
        label: coin.label,
        sortOrder: coin.sortOrder,
        isEnabled: true,
      },
    });
  }

  console.log(`✅ Seeded ${COINS.length} coin/network entries.`);

  // ─── Seed default copy traders ──────────────────────────────────────────────
  console.log('Seeding copy traders...');
  const TRADERS = [
    { name: 'CryptoWhale_99',  avatar: '🐋', roi: '+145.2%', winRate: '82%', aum: '$1.2M', followers: 1240, risk: 'High' },
    { name: 'SafeTrades_Algo', avatar: '🤖', roi: '+32.4%',  winRate: '95%', aum: '$4.5M', followers: 8530, risk: 'Low'  },
    { name: 'Ethereum_Maxi',   avatar: '💎', roi: '+88.1%',  winRate: '64%', aum: '$850K', followers: 430,  risk: 'Medium' },
    { name: 'AlphaSeeker',     avatar: '🐺', roi: '+210.5%', winRate: '55%', aum: '$2.1M', followers: 3200, risk: 'High' },
  ];
  for (const t of TRADERS) {
    const existing = await (prisma as any).copyTrader?.findFirst({ where: { name: t.name } });
    if (!existing) await (prisma as any).copyTrader?.create({ data: t });
  }
  console.log(`✅ Seeded ${TRADERS.length} copy traders.`);

  console.log('');
  console.log('⚠️  Next steps:');
  console.log('   1. Go to the admin panel > Wallet Settings');
  console.log('   2. Add your actual wallet addresses for each coin/network');
  console.log('   3. Set your account role to ADMIN in the DB:');
  console.log("      UPDATE \"User\" SET role = 'ADMIN' WHERE email = 'your@email.com';");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
