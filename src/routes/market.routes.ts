import { Router } from 'express';
import { getPrices, getMarketData, getAllMarketData } from '../controllers/market.controller';

const router = Router();

router.get('/all', getAllMarketData);
router.get('/prices', getPrices);
router.get('/data', getMarketData);

export default router;
