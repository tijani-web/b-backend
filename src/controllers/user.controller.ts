import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export const updateKyc = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { kycStatus: 'VERIFIED' },
      select: { 
        id: true, 
        email: true, 
        kycStatus: true,
        createdAt: true,
        twoFactorEnabled: true,
      },
    });

    res.status(200).json({ message: 'KYC status updated successfully', user });
  } catch (error) {
    logger.error('Error updating KYC:', error);
    res.status(500).json({ error: 'Failed to update KYC status' });
  }
};

export const updatePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new password are required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      res.status(400).json({ error: 'Incorrect current password' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: req.userId },
      data: { passwordHash },
    });

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    logger.error('Error updating password:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
};

export const generate2fa = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const secret = speakeasy.generateSecret({ name: `BlofinPro (${user.email})` });
    
    await prisma.user.update({
      where: { id: req.userId },
      data: { twoFactorSecret: secret.base32 },
    });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    res.status(200).json({ qrCodeUrl, secret: secret.base32 });
  } catch (error) {
    logger.error('Error generating 2FA:', error);
    res.status(500).json({ error: 'Failed to generate 2FA' });
  }
};

export const verify2fa = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || !user.twoFactorSecret) {
      res.status(400).json({ error: '2FA not setup' });
      return;
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
    });

    if (verified) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { twoFactorEnabled: true },
      });
      res.status(200).json({ message: '2FA enabled successfully' });
    } else {
      res.status(400).json({ error: 'Invalid 2FA code' });
    }
  } catch (error) {
    logger.error('Error verifying 2FA:', error);
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
};
