import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { verifyToken } from '../utils/jwt';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
    return;
  }

  req.userId = payload.userId;
  next();
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { role: true },
  });

  if (!user || user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
    return;
  }

  req.userRole = 'ADMIN';
  next();
};
