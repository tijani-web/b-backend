import { Router } from 'express';
import { getPrices } from '../controllers/market.controller';

const router = Router();

router.get('/prices', getPrices);

export default router;
