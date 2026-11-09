import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { prisma } from './prisma';
import { logger } from './utils/logger';

const app = express();
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
import referralRoutes from './routes/referral.routes';
import notificationRoutes from './routes/notification.routes';

// ─── Global middleware ────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://www.blofinprime.com',
  'https://blofinprime.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.includes(origin) ||
      /blofinprime\.com$/.test(origin) ||
      /vercel\.app$/.test(origin) ||
      process.env.NODE_ENV !== 'production';

    if (isAllowed) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json());

// Serve deposit proof screenshots and trader avatars statically (KYC documents are restricted and served via /api/kyc/admin/:id/file)
const uploadsDir = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir));
app.use('/uploads/proofs', express.static(path.join(uploadsDir, 'proofs')));
app.use('/uploads/avatars', express.static(path.join(uploadsDir, 'avatars')));

// Direct file access helper with clear error handling for proofs
app.get('/uploads/proofs/:filename', (req, res) => {
  const file = path.join(uploadsDir, 'proofs', req.params.filename);
  if (fs.existsSync(file)) {
    return res.sendFile(file);
  }
  return res.status(404).json({ error: 'Deposit proof image not found on server' });
});

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
app.use('/api/referrals', referralRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'BlofinPrime Backend is running' });
});

// ─── Global JSON Error Handler (Never send HTML error pages) ─────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
