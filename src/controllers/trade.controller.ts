import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/auth';
import { MarketService } from '../services/market.service';
import { logger } from '../utils/logger';

export const executeTrade = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { fromAsset, toAsset, amount } = req.body;

    const numAmount = parseFloat(amount);
    if (!userId || !fromAsset || !toAsset || isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'Valid fromAsset, toAsset, and positive amount are required' });
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

    if (!sourceWallet || Number(sourceWallet.balance) < numAmount) {
      const available = sourceWallet ? Number(sourceWallet.balance).toFixed(6) : '0.000000';
      res.status(400).json({
        error: `Insufficient ${fromAsset.toUpperCase()} balance. Available: ${available} ${fromAsset.toUpperCase()}, Required: ${numAmount.toFixed(6)} ${fromAsset.toUpperCase()}`
      });
      return;
    }

    // 3. Calculate conversion — round to 8 dp to prevent Prisma Decimal overflow
    const usdValue       = Math.round(numAmount * fromPrice * 1e8) / 1e8;
    const receivedAmount = Math.round((usdValue / toPrice) * 1e8) / 1e8;

    // 4. Execute trade transactionally
    await prisma.$transaction(async (tx) => {
      // Deduct from source
      await tx.wallet.update({
        where: { id: sourceWallet.id },
        data: { balance: { decrement: numAmount } }
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
          amount: numAmount,
          usdValue: usdValue,
          status: 'COMPLETED'
        }
      });
    });

    res.status(200).json({
      message: 'Trade executed successfully',
      fromAsset: fromAsset.toUpperCase(),
      toAsset: toAsset.toUpperCase(),
      executedPrice: toPrice,
      receivedAmount,
      usdValue
    });

  } catch (error) {
    logger.error('Trade execution error:', error);
    res.status(500).json({ error: 'Failed to execute trade. Please try again.' });
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
          traderId: String(traderId),
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

/** POST /api/trade/mine/:id/cancel — cancel mining contract and refund */
export const cancelMining = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;

    const contract = await prisma.transaction.findFirst({
      where: {
        id,
        userId,
        type: 'MINING',
        status: { in: ['COMPLETED', 'ACTIVE'] },
      },
    });

    if (!contract) {
      res.status(404).json({ error: 'Active mining contract not found' });
      return;
    }

    // Refund asset amount to user wallet and mark transaction CANCELLED
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: contract.id },
        data: { status: 'CANCELLED' },
      });

      const wallet = await tx.wallet.findUnique({
        where: { userId_coin: { userId, coin: contract.asset } },
      });

      if (wallet) {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: contract.amount } },
        });
      } else {
        await tx.wallet.create({
          data: {
            userId,
            coin: contract.asset,
            balance: contract.amount,
          },
        });
      }

      await tx.notification.create({
        data: {
          userId,
          title: 'Mining Contract Cancelled',
          message: `Your mining contract of ${Number(contract.amount)} ${contract.asset} has been cancelled and refunded to your wallet.`,
          type: 'INFO',
          read: false,
        },
      });
    });

    res.status(200).json({
      success: true,
      message: 'Successfully cancelled mining contract and refunded funds',
    });
  } catch (error) {
    logger.error('Cancel mining error:', error);
    res.status(500).json({ error: 'Failed to cancel mining contract' });
  }
};

/** POST /api/trade/position — open leveraged position (BUY/SELL) */
export const openTradePosition = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { asset, side, amount, leverage = 1, duration = 'Day Trade' } = req.body;
    const numAmount = parseFloat(amount);

    if (!userId || !asset || !side || isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'Valid asset, side (BUY/SELL), and amount are required' });
      return;
    }

    const prices = await MarketService.getPrices([asset.toUpperCase()]);
    const entryPrice = prices[asset.toUpperCase()] || 1;

    // Margin is deducted in USDT
    const margin = numAmount;
    const usdtWallet = await prisma.wallet.findUnique({
      where: { userId_coin: { userId, coin: 'USDT' } },
    });

    if (!usdtWallet || Number(usdtWallet.balance) < margin) {
      res.status(400).json({
        error: `Insufficient USDT balance. Available: ${Number(usdtWallet?.balance || 0).toFixed(2)} USDT, Required: ${margin.toFixed(2)} USDT`
      });
      return;
    }

    const position = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: usdtWallet.id },
        data: { balance: { decrement: margin } },
      });

      const createdTrade = await tx.transaction.create({
        data: {
          userId,
          type: 'TRADE',
          asset: `${asset.toUpperCase()}/USDT`,
          amount: margin,
          usdValue: entryPrice,
          status: 'OPEN',
          category: side.toUpperCase(),
          adminNote: `${side.toUpperCase()} ${asset.toUpperCase()}/USDT | Entry: $${entryPrice} | Lev: ${leverage}x | Dur: ${duration}`,
        },
      });

      // In-app notification: Trade Opened (F7)
      try {
        await (tx as any).notification.create({
          data: {
            userId,
            title: `📈 ${side.toUpperCase()} Position Opened`,
            message: `Opened ${side.toUpperCase()} ${asset.toUpperCase()}/USDT with margin $${margin.toFixed(2)} at entry price $${entryPrice.toLocaleString()}.`,
            type: 'INFO',
            isRead: false,
          },
        });
      } catch (notifErr) {
        logger.warn('Failed to create trade open notification:', notifErr);
      }

      return createdTrade;
    });

    res.status(201).json({
      message: `${side.toUpperCase()} position opened successfully`,
      data: position,
    });
  } catch (error) {
    logger.error('openTradePosition error:', error);
    res.status(500).json({ error: 'Failed to open position' });
  }
};

/** POST /api/trade/position/:id/close — close open position */
export const closeTradePosition = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const id = req.params.id as string;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const trade = await prisma.transaction.findFirst({
      where: { id, userId, type: 'TRADE', status: 'OPEN' },
    });

    if (!trade) {
      res.status(404).json({ error: 'Open trade position not found' });
      return;
    }

    const pair = trade.asset;
    const symbol = pair.split('/')[0];
    const prices = await MarketService.getPrices([symbol]);
    const exitPrice = prices[symbol] || Number(trade.usdValue || 1);
    const entryPrice = Number(trade.usdValue || exitPrice);
    const margin = Number(trade.amount);

    const isBuy = (trade.category || '').toUpperCase().includes('BUY');
    const priceDiff = exitPrice - entryPrice;
    const pnlPercent = entryPrice > 0 ? (priceDiff / entryPrice) * (isBuy ? 1 : -1) : 0;
    const pnl = margin * pnlPercent;
    const payout = Math.max(0, Number((margin + pnl).toFixed(2)));

    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: trade.id },
        data: {
          status: 'CLOSED',
          adminNote: `${trade.adminNote || ''} | Exit: $${exitPrice} | PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
        },
      });

      await tx.wallet.upsert({
        where: { userId_coin: { userId, coin: 'USDT' } },
        update: { balance: { increment: payout } },
        create: { userId, coin: 'USDT', balance: payout },
      });

      // In-app notification: Trade Closed (F7)
      try {
        await (tx as any).notification.create({
          data: {
            userId,
            title: pnl >= 0 ? '🎉 Trade Closed (Profit)' : '📉 Trade Closed',
            message: `Closed ${trade.asset} position. PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}. Payout of $${payout.toFixed(2)} USDT credited.`,
            type: pnl >= 0 ? 'SUCCESS' : 'INFO',
            isRead: false,
          },
        });
      } catch (notifErr) {
        logger.warn('Failed to create trade close notification:', notifErr);
      }
    });

    res.status(200).json({
      message: 'Position closed successfully',
      payout,
      pnl,
    });
  } catch (error) {
    logger.error('closeTradePosition error:', error);
    res.status(500).json({ error: 'Failed to close position' });
  }
};

/** POST /api/trade/position/:id/cancel — cancel open position */
export const cancelTradePosition = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const id = req.params.id as string;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const trade = await prisma.transaction.findFirst({
      where: { id, userId, type: 'TRADE', status: 'OPEN' },
    });

    if (!trade) {
      res.status(404).json({ error: 'Open position not found' });
      return;
    }

    const margin = Number(trade.amount);

    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: trade.id },
        data: {
          status: 'CANCELLED',
          adminNote: `${trade.adminNote || ''} | Cancelled by user`,
        },
      });

      await tx.wallet.upsert({
        where: { userId_coin: { userId, coin: 'USDT' } },
        update: { balance: { increment: margin } },
        create: { userId, coin: 'USDT', balance: margin },
      });

      // In-app notification: Trade Cancelled
      try {
        await (tx as any).notification.create({
          data: {
            userId,
            title: '🚫 Trade Position Cancelled',
            message: `Cancelled ${trade.asset} position. Full margin of $${margin.toFixed(2)} USDT refunded.`,
            type: 'INFO',
            isRead: false,
          },
        });
      } catch (notifErr) {
        logger.warn('Failed to create trade cancel notification:', notifErr);
      }
    });

    res.status(200).json({ message: 'Position cancelled and margin refunded' });
  } catch (error) {
    logger.error('cancelTradePosition error:', error);
    res.status(500).json({ error: 'Failed to cancel position' });
  }
};
