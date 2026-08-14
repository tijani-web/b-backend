import { Router } from 'express';
import { getDepositAddress, withdraw } from '../controllers/custody.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.post('/deposit-address', authenticate, getDepositAddress);
router.post('/withdraw', authenticate, withdraw);

export default router;
