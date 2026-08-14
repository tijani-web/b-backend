import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth';
import { MarketService } from '../services/market.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export const executeTrade = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { fromAsset, toAsset, amount } = req.body;

    if (!userId || !fromAsset || !toAsset || !amount || amount <= 0) {
      res.status(400).json({ error: 'Valid fromAsset, toAsset, and amount are required' });
      return;
    }

    if (fromAsset.toUpperCase() === toAsset.toUpperCase()) {
      res.status(400).json({ error: 'Cannot trade the same asset' });
      return;
    }

    // 1. Get live prices
    const prices = await MarketService.getPrices([fromAsset, toAsset]);
    const fromPrice = prices[fromAsset.toUpperCase()];
    const toPrice = prices[toAsset.toUpperCase()];

    if (!fromPrice || !toPrice) {
      res.status(400).json({ error: 'Pricing not available for one or both assets' });
      return;
    }

    // 2. Fetch user's source wallet
    const sourceWallet = await prisma.wallet.findUnique({
      where: { userId_coin: { userId, coin: fromAsset.toUpperCase() } }
    });

    if (!sourceWallet || Number(sourceWallet.balance) < amount) {
      res.status(400).json({ error: `Insufficient ${fromAsset} balance` });
      return;
    }

    // 3. Calculate conversion
    const usdValue = amount * fromPrice;
    const receivedAmount = usdValue / toPrice;

    // 4. Execute trade transactionally
    await prisma.$transaction(async (tx) => {
      // Deduct from source
      await tx.wallet.update({
        where: { id: sourceWallet.id },
        data: { balance: { decrement: amount } }
      });

      // Credit to target
      let targetWallet = await tx.wallet.findUnique({
        where: { userId_coin: { userId, coin: toAsset.toUpperCase() } }
      });

      if (targetWallet) {
        await tx.wallet.update({
          where: { id: targetWallet.id },
          data: { balance: { increment: receivedAmount } }
        });
      } else {
        await tx.wallet.create({
          data: {
            userId,
            coin: toAsset.toUpperCase(),
            balance: receivedAmount
          }
        });
      }

      // Record trade transaction
      await tx.transaction.create({
        data: {
          userId,
          type: 'TRADE',
          asset: `${fromAsset.toUpperCase()}_TO_${toAsset.toUpperCase()}`,
          amount: amount,
          usdValue: usdValue,
          status: 'COMPLETED'
        }
      });
    });

    res.status(200).json({
      message: 'Trade executed successfully',
      executedPrice: toPrice,
      receivedAmount
    });

  } catch (error) {
    logger.error('Trade execution error:', error);
    res.status(500).json({ error: 'Failed to execute trade' });
  }
};

export const copyTrader = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { traderId, amount: rawUsdAmount, asset } = req.body;
    const usdAmount = Number(rawUsdAmount);
    
    if (!traderId || !usdAmount || !asset || isNaN(usdAmount) || usdAmount <= 0) {
      res.status(400).json({ error: 'traderId, USD amount, and asset are required' });
      return;
    }

    // Get live price of the asset
    const prices = await MarketService.getPrices([asset.toUpperCase()]);
    const assetPrice = prices[asset.toUpperCase()];

    if (!assetPrice) {
      res.status(400).json({ error: `Pricing not available for ${asset}` });
      return;
    }

    // Calculate how much of the asset is equivalent to the USD amount
    const assetAmount = usdAmount / assetPrice;

    // Deduct asset amount from user's wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId_coin: { userId: req.userId, coin: asset.toUpperCase() } },
    });

    if (!wallet || Number(wallet.balance) < assetAmount) {
      res.status(400).json({ error: `Insufficient ${asset} balance. You need ${assetAmount.toFixed(6)} ${asset} ($${usdAmount})` });
      return;
    }

    // Wrap in transaction
    await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: assetAmount } },
      }),
      prisma.transaction.create({
        data: {
          userId: req.userId,
          type: 'COPY_TRADE',
          asset: asset.toUpperCase(),
          amount: assetAmount,
          usdValue: usdAmount,
          status: 'COMPLETED',
        },
      }),
      prisma.copyTrade.create({
        data: {
          userId: req.userId,
          traderId: Number(traderId),
          amount: assetAmount,
        },
      }),
    ]);

    res.status(200).json({ 
      message: 'Successfully started copying trader',
      assetAmountDeducted: assetAmount,
      usdValue: usdAmount
    });
  } catch (error) {
    logger.error('Copy trade error:', error);
    res.status(500).json({ error: 'Failed to start copy trading' });
  }
};

export const buyMining = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { packageId, price, asset } = req.body;
    const usdAmount = Number(price);
    
    if (!packageId || !usdAmount || !asset || isNaN(usdAmount) || usdAmount <= 0) {
      res.status(400).json({ error: 'Invalid mining package or price' });
      return;
    }

    // Get live price of the asset
    const prices = await MarketService.getPrices([asset.toUpperCase()]);
    const assetPrice = prices[asset.toUpperCase()];

    if (!assetPrice) {
      res.status(400).json({ error: `Pricing not available for ${asset}` });
      return;
    }

    // Calculate how much of the asset is equivalent to the USD amount
    const assetAmount = usdAmount / assetPrice;

    // Deduct asset amount from user's wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId_coin: { userId: req.userId, coin: asset.toUpperCase() } },
    });

    if (!wallet || Number(wallet.balance) < assetAmount) {
      res.status(400).json({ error: `Insufficient ${asset} balance. You need ${assetAmount.toFixed(6)} ${asset} ($${usdAmount})` });
      return;
    }

    // Wrap in transaction. We'll just create a transaction record of type "MINING" 
    await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: assetAmount } },
      }),
      prisma.transaction.create({
        data: {
          userId: req.userId,
          type: 'MINING',
          asset: asset.toUpperCase(),
          amount: assetAmount,
          usdValue: usdAmount,
          status: 'COMPLETED',
        },
      }),
    ]);

    res.status(200).json({ 
      message: 'Successfully purchased mining contract',
      assetAmountDeducted: assetAmount,
      usdValue: usdAmount
    });
  } catch (error) {
    logger.error('Mining purchase error:', error);
    res.status(500).json({ error: 'Failed to purchase mining contract' });
  }
};
