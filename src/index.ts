import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { logger } from './utils/logger';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

// ─── Route imports ────────────────────────────────────────────────────────────
import authRoutes from './routes/auth.routes';
import marketRoutes from './routes/market.routes';
import custodyRoutes from './routes/custody.routes';
import tradeRoutes from './routes/trade.routes';
import walletRoutes from './routes/wallet.routes';
import coinRoutes from './routes/coin.routes';
import depositRoutes from './routes/deposit.routes';
import withdrawalRoutes from './routes/withdrawal.routes';
import kycRoutes from './routes/kyc.routes';
import adminRoutes from './routes/admin.routes';
import copyTraderRoutes from './routes/copyTrader.routes';
import subscriptionRoutes from './routes/subscription.routes';
import signalsRoutes from './routes/signals.routes';
import realEstateRoutes from './routes/realestate.routes';
import stakeRoutes from './routes/stake.routes';

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve uploaded files (proofs, KYC) — accessible only via direct URL + auth in prod
// For now: static serving from /uploads (admin-only file endpoint is in kyc.routes)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/custody', custodyRoutes);
app.use('/api/trade', tradeRoutes);
app.use('/api/user', walletRoutes);

// New routes
app.use('/api/coins', coinRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/copy-traders', copyTraderRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/signals', signalsRoutes);
app.use('/api/real-estate', realEstateRoutes);
app.use('/api/stake', stakeRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'BlofinPro Backend is running' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
