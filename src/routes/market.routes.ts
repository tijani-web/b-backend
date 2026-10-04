import { Router } from 'express';
import { getPrices, getMarketData } from '../controllers/market.controller';

const router = Router();

router.get('/prices', getPrices);
router.get('/data', getMarketData);

export default router;
