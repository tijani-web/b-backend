import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { CustodyService } from '../services/custody.service';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export const getDepositAddress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { asset } = req.body;

    if (!userId || !asset) {
      res.status(400).json({ error: 'User ID and asset are required' });
      return;
    }

    // Check if wallet already exists
    let wallet = await prisma.wallet.findUnique({
      where: {
        userId_asset: { userId, asset: asset.toUpperCase() }
      }
    });

    // If wallet doesn't have an address, generate one
    if (!wallet || !wallet.depositAddress) {
      const address = await CustodyService.generateDepositAddress(userId, asset);
      
      if (wallet) {
        wallet = await prisma.wallet.update({
          where: { id: wallet.id },
          data: { depositAddress: address }
        });
      } else {
        wallet = await prisma.wallet.create({
          data: {
            userId,
            asset: asset.toUpperCase(),
            depositAddress: address,
            balance: 0
          }
        });
      }
    }

    // --- LAZY SYNC: Check for new incoming deposits ---
    if (wallet.depositAddress && (asset.toUpperCase() === 'ETH' || asset.toUpperCase() === 'USDT')) {
      const deposits = await CustodyService.getNewDeposits(wallet.depositAddress, asset);
      
      for (const deposit of deposits) {
        try {
          // Attempt to insert the transaction. The @unique constraint on txHash 
          // ensures we NEVER double-credit the same deposit, even on double-refreshes.
          await prisma.$transaction(async (tx) => {
            const newTx = await tx.transaction.create({
              data: {
                userId,
                type: 'DEPOSIT',
                asset: asset.toUpperCase(),
                amount: deposit.amount,
                status: 'COMPLETED',
                txHash: deposit.txHash
              }
            });
            // If the create succeeds, credit the wallet
            await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: { increment: deposit.amount } }
            });
            logger.info(`Credited deposit of ${deposit.amount} ${asset} to user ${userId} (TX: ${deposit.txHash})`);
          });
        } catch (dbError: any) {
          // Prisma throws P2002 if a unique constraint fails (meaning txHash already exists)
          if (dbError.code === 'P2002') {
             // Silently ignore, this deposit was already credited
             continue;
          }
          logger.error('Error during deposit DB sync:', dbError);
        }
      }
    }

    // Fetch the updated wallet to return latest balance
    const updatedWallet = await prisma.wallet.findUnique({ where: { id: wallet.id }});

    res.status(200).json({ address: updatedWallet?.depositAddress, asset: updatedWallet?.asset, balance: updatedWallet?.balance });
  } catch (error) {
    logger.error('Error handling deposit request:', error);
    res.status(500).json({ error: 'Failed to process deposit address' });
  }
};

export const withdraw = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { asset, amount: rawAmount, address } = req.body;
    const amount = Number(rawAmount);

    if (!userId || !asset || !amount || isNaN(amount) || amount <= 0 || !address) {
      res.status(400).json({ error: 'Valid asset, positive amount, and destination address are required' });
      return;
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId_asset: { userId, asset: asset.toUpperCase() } }
    });

    if (!wallet || Number(wallet.balance) < amount) {
      res.status(400).json({ error: 'Insufficient balance' });
      return;
    }

    let transaction;
    // --- CRASH RECOVERY PHASE 1: Write PENDING state to DB ---
    // Deduct balance and create a PENDING transaction FIRST.
    // If the server crashes after this block, the funds are safely locked and cannot be double-spent.
    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } }
      });

      transaction = await tx.transaction.create({
        data: {
          userId,
          type: 'WITHDRAWAL',
          asset: asset.toUpperCase(),
          amount: amount,
          status: 'PENDING'
        }
      });
    });

    try {
      // --- CRASH RECOVERY PHASE 2: Broadcast to Network ---
      // This calls the CustodyService which holds the Mutex lock to prevent Nonce collisions
      const txId = await CustodyService.withdraw(asset, amount, address);

      // --- CRASH RECOVERY PHASE 3: Mark as COMPLETED ---
      await prisma.transaction.update({
        where: { id: transaction!.id },
        data: { status: 'COMPLETED', txHash: txId }
      });

      res.status(200).json({ message: 'Withdrawal successful', txId });
    } catch (externalError) {
      // If the external withdrawal fails (e.g. insufficient gas in Hot Wallet), 
      // we mark it FAILED and refund the user.
      await prisma.$transaction(async (tx) => {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: amount } }
        });

        await tx.transaction.update({
          where: { id: transaction!.id },
          data: { status: 'FAILED' }
        });
      });

      throw externalError; // Caught by the outer catch block
    }

  } catch (error) {
    logger.error('Withdrawal error:', error);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
};
