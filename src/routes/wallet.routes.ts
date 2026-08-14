import { Router } from 'express';
import { getTransactionHistory, getWallets } from '../controllers/wallet.controller';
import { updateKyc, updatePassword, generate2fa, verify2fa } from '../controllers/user.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.get('/wallets', authenticate, getWallets);
router.get('/transactions', authenticate, getTransactionHistory);
router.put('/kyc', authenticate, updateKyc);
router.put('/password', authenticate, updatePassword);
router.post('/2fa/generate', authenticate, generate2fa);
router.post('/2fa/verify', authenticate, verify2fa);

export default router;
